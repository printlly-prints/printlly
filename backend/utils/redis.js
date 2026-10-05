// Upstash Redis: shared ephemeral state.
//
// WHAT BELONGS HERE, AND WHAT NEVER WILL
//
// MongoDB is the source of truth for every durable business fact - orders,
// payments, users, settlements, document ownership. Redis holds only state
// that may be lost without a correctness problem:
//
//   - rate-limit counters        (a lost counter grants a few extra requests)
//   - alert suppression markers  (a lost marker sends a duplicate card)
//   - short-lived caches         (a lost entry costs a database read)
//   - distributed locks          (a lost lock allows a duplicate attempt,
//                                 which the operation underneath must
//                                 already tolerate)
//
// Nothing authoritative is ever written here. The test is simple: if losing
// the value could change what a customer is charged, who owns a document, or
// whether an order is paid, it belongs in MongoDB. That rule is what keeps a
// Redis outage from being a data-integrity incident.
//
// WHY REST RATHER THAN THE REDIS PROTOCOL
//
// Upstash is addressed over HTTPS. That means no connection pool to exhaust,
// no reconnect storm after a network blip, and no socket held open by an idle
// process - at the cost of some latency per command, which does not matter
// for counters. It also means every call is independently cancellable, which
// is what makes the timeout below meaningful.
//
// FAILURE BEHAVIOUR, which is the whole design
//
// Every function here returns null when Redis is unavailable, rather than
// throwing or returning a plausible-looking default. null means "no answer",
// which forces each CALLER to decide what that means for its own operation,
// because the right answer genuinely differs:
//
//   rate limiting   -> degrade to per-process counters (utils/redis.js
//                      RedisRateLimitStore falls back to MemoryStore). Not
//                      fail-closed: refusing all traffic because a counter
//                      store is unreachable is a self-inflicted outage.
//   alert dedupe    -> fail towards SENDING (utils/alerts.js). A duplicate
//                      card is better than a missed incident.
//   caching         -> fail towards the database. Slower, still correct.
//   locks           -> fail towards NOT holding the lock, so the caller must
//                      only use locks for work that is safe to repeat.

const { observabilityConfig } = require("../config/observability");
const { scrubString } = require("./scrub");

let client = null;
let clientReady = false;
let loadFailed = false;

// Health, tracked rather than inferred, so GET /health/ready can answer
// honestly without issuing a probe of its own on every request.
const health = {
  configured: false,
  lastOk: null,
  lastError: null,
  lastErrorAt: null,
  consecutiveFailures: 0,
};

function redisEnabled() {
  try {
    return observabilityConfig().redis.enabled;
  } catch {
    return false;
  }
}

const isRedisEnabled = () => redisEnabled();

// Builds the client on first use. Not at module load: requiring the SDK is
// pointless work for a deployment that has not configured Redis, and a
// failure to load it must not stop the server from booting.
function getClient() {
  if (client || loadFailed) return client;
  if (!redisEnabled()) return null;

  try {
    const config = observabilityConfig().redis;
    const { Redis } = require("@upstash/redis");
    client = new Redis({
      url: config.url,
      token: config.token,
      // The SDK's own retry is disabled. Retrying inside a request path
      // multiplies the latency of a Redis that is already struggling, and
      // every caller here is designed to proceed without an answer - so a
      // fast null beats a slow correct value.
      retry: false,
    });
    health.configured = true;
    clientReady = true;
    return client;
  } catch (error) {
    loadFailed = true;
    console.error("[redis] client unavailable, continuing without it: " + scrubString(error.message || ""));
    return null;
  }
}

function recordOk() {
  health.lastOk = new Date();
  health.consecutiveFailures = 0;
}

function recordFailure(error) {
  health.lastError = scrubString((error && error.message) || "unknown");
  health.lastErrorAt = new Date();
  health.consecutiveFailures += 1;

  // Logged on the first failure and then every 50th, so a sustained outage
  // leaves evidence without filling the log with one line per request.
  if (health.consecutiveFailures === 1 || health.consecutiveFailures % 50 === 0) {
    console.error(
      "[redis] command failed (" + health.consecutiveFailures + " consecutive): " + health.lastError
    );
  }
}

// The sentinel for "Redis could not answer".
//
// This exists because null is a LEGITIMATE Redis reply and must not be
// confused with a failure. `SET key value NX` returns null when the key
// already exists, and `GET` returns null for a missing key - so a run()
// that signalled failure with null would make "someone else holds this
// lock" indistinguishable from "Redis is down".
//
// That distinction is not cosmetic. withLock treats a failure as "run the
// work anyway" (so a Redis outage cannot halt the cron jobs), and treats
// "held elsewhere" as "do not run". Conflating them would mean a held lock
// was ignored and the work ran twice on every instance - the lock would
// silently do nothing at all. The alert deduplicator has the mirror-image
// problem: it would read "already alerted" as "cannot tell" and send a
// duplicate card every time.
//
// A Symbol rather than a string or a special object so that no Redis value
// can ever collide with it.
const FAILED = Symbol("redis-failed");

// Runs one Redis operation with a hard timeout, converting every failure
// into the FAILED sentinel. This is the only place a Redis error is caught,
// so no caller needs its own try/catch.
async function run(operation) {
  const redis = getClient();
  if (!redis) return FAILED;

  const timeoutMs = observabilityConfig().redis.timeoutMs;

  try {
    // Promise.race rather than AbortSignal: the Upstash SDK does not take a
    // signal per command, and an operation left running in the background
    // after we have stopped waiting is harmless for these commands.
    const result = await Promise.race([
      operation(redis),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("redis timeout after " + timeoutMs + "ms")), timeoutMs)
      ),
    ]);
    recordOk();
    return result;
  } catch (error) {
    recordFailure(error);
    return FAILED;
  }
}

// Namespaced so that several deployments (staging and production, or two
// branches) can share one Upstash database without colliding.
function key(name) {
  try {
    return observabilityConfig().redis.keyPrefix + ":" + name;
  } catch {
    return "printlly:" + name;
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

// SET key value NX PX ttl. Returns true if this caller set it, false if it
// already existed, null if Redis could not answer.
//
// The three-way return is deliberate: a caller must be able to tell "someone
// else holds this" (false) from "I do not know" (null), because those call
// for opposite behaviour in alerting and in locking.
async function redisSetIfAbsent(name, value, ttlMs) {
  const result = await run((redis) => redis.set(key(name), value, { nx: true, px: Math.max(1, Math.round(ttlMs)) }));
  if (result === FAILED) return null;
  // Upstash answers "OK" when the key was set and null when it already
  // existed. Anything else is treated as "not set", which is the safe
  // reading for a caller deciding whether it holds a claim.
  return result === "OK";
}

async function redisGet(name) {
  const result = await run((redis) => redis.get(key(name)));
  // A missing key and an unreachable Redis both come back as null here, and
  // for a cache read that is the same thing to the caller: go and ask the
  // database. Callers that need to tell them apart use redisSetIfAbsent.
  return result === FAILED ? null : result;
}

async function redisSet(name, value, ttlMs) {
  const result = await run((redis) =>
    ttlMs ? redis.set(key(name), value, { px: Math.max(1, Math.round(ttlMs)) }) : redis.set(key(name), value)
  );
  return result === FAILED ? null : true;
}

async function redisDel(name) {
  const result = await run((redis) => redis.del(key(name)));
  return result === FAILED ? null : true;
}

// Increments a counter inside a fixed window, creating the window on the
// first hit. Returns { count, resetAt } or null.
//
// Pipelined so the increment and the remaining TTL cost one round trip. The
// expiry is applied only when the key has none, which is both the first hit
// of a window and the recovery case where a key somehow outlived its TTL.
async function redisIncrementWindow(name, windowMs) {
  const namespaced = key(name);

  const result = await run(async (redis) => {
    const pipeline = redis.pipeline();
    pipeline.incr(namespaced);
    pipeline.pttl(namespaced);
    return pipeline.exec();
  });

  if (result === FAILED || !Array.isArray(result)) return null;

  const count = Number(result[0]);
  let ttl = Number(result[1]);

  if (!Number.isFinite(count)) return null;

  if (!Number.isFinite(ttl) || ttl < 0) {
    // No expiry set: this is a new window. Applied as a separate call rather
    // than conditionally inside the pipeline, because the REST API has no
    // conditional expiry and a Lua script would be more moving parts than
    // this is worth.
    await run((redis) => redis.pexpire(namespaced, Math.max(1, Math.round(windowMs))));
    ttl = windowMs;
  }

  return { count, resetAt: new Date(Date.now() + ttl) };
}

async function redisDecrement(name) {
  const result = await run((redis) => redis.decr(key(name)));
  return result === FAILED ? null : Number(result);
}

// ---------------------------------------------------------------------------
// Distributed lock
// ---------------------------------------------------------------------------
//
// withLock runs `fn` only if this process acquires the named lock.
//
// IMPORTANT: this is an optimisation, never a correctness guarantee. A lock
// held in Redis is lost if Redis loses the key, and cannot be acquired at all
// when Redis is down - in which case this runs `fn` anyway, because the
// alternative is that a Redis outage silently stops the cron jobs.
//
// So the operation inside must be safe to run twice. Everything this codebase
// locks already is: document cleanup claims each upload in MongoDB before
// deleting it (utils/documentCleanup.js), and webhook handling claims its
// event by primary key (models/WebhookEvent.js). The lock exists to stop two
// instances doing the same scan at the same moment, not to make an unsafe
// operation safe.
async function withLock(name, ttlMs, fn) {
  const claimed = await redisSetIfAbsent("lock:" + name, String(process.pid), ttlMs);

  if (claimed === false) {
    return { ran: false, reason: "held_elsewhere" };
  }

  // claimed === null means Redis could not answer. Run anyway - see above.
  const degraded = claimed === null;

  try {
    const value = await fn();
    return { ran: true, degraded, value };
  } finally {
    // Released early so the next scheduled run is not blocked by a TTL that
    // outlasts the work. A failure to release is survivable: the TTL expires.
    if (claimed === true) await redisDel("lock:" + name);
  }
}

// ---------------------------------------------------------------------------
// express-rate-limit store
// ---------------------------------------------------------------------------
//
// WHY A CUSTOM STORE RATHER THAN A DIFFERENT RATE LIMITER
//
// middleware/rateLimit.js already encodes a lot of decided behaviour: six
// policies sized for what each protects, identity keying by JWT user id so
// customers behind carrier NAT are not bucketed together, a draft-7 429 with
// retry information, and successful-request refunds on the pickup-OTP
// limiter. Replacing the limiter would mean re-deriving all of that against
// a new library. Replacing only the STORE moves where counters live and
// leaves every one of those decisions intact.
//
// WHY IT MATTERS: with per-process counters, a limit of 20 becomes an
// effective limit of 20 x (number of instances), and the effective limit
// changes silently when the deployment scales. A shared store is what makes
// the configured number mean what it says.
//
// DEGRADATION: a Redis failure falls through to an in-process MemoryStore
// rather than rejecting or allowing everything. Limits become per-instance
// again - which is exactly the behaviour of a deployment with no Redis at
// all, so the degraded path is the one already in daily use.
class RedisRateLimitStore {
  // `policy` namespaces this store's keys.
  //
  // This is required, not cosmetic. express-rate-limit gives each limiter its
  // own store instance but no identity, and several policies here key by bare
  // user identity - generalLimiter and orderLimiter both produce "user:123"
  // for the same person. Sharing one keyspace would mean a customer browsing
  // shops consumed their order allowance, and the first limiter to fill the
  // bucket would silently cap the others. In-process MemoryStores cannot
  // collide because each instance has its own map; a shared Redis can, so the
  // separation has to be made explicit here.
  constructor(policy) {
    const { MemoryStore } = require("express-rate-limit");
    this.fallback = new MemoryStore();
    this.policy = policy || "default";
    this.windowMs = 60000;
    this.usingFallback = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
    if (this.fallback.init) this.fallback.init(options);
  }

  // Namespaced key for one client under this policy.
  redisKey(rateKey) {
    return "rl:" + this.policy + ":" + rateKey;
  }

  async increment(rateKey) {
    const result = await redisIncrementWindow(this.redisKey(rateKey), this.windowMs);

    if (result === null) {
      if (!this.usingFallback) {
        this.usingFallback = true;
        console.warn("[redis] rate limiting degraded to per-process counters");
      }
      return this.fallback.increment(rateKey);
    }

    if (this.usingFallback) {
      this.usingFallback = false;
      console.log("[redis] rate limiting restored to shared counters");
    }

    return { totalHits: result.count, resetTime: result.resetAt };
  }

  // Used by skipSuccessfulRequests on the pickup-OTP limiter, which refunds
  // an attempt that turned out to be a correct code.
  async decrement(rateKey) {
    const result = await redisDecrement(this.redisKey(rateKey));
    if (result === null) return this.fallback.decrement(rateKey);
  }

  async resetKey(rateKey) {
    const result = await redisDel(this.redisKey(rateKey));
    if (result === null) return this.fallback.resetKey(rateKey);
  }
}

// Returns a store instance, or undefined to let express-rate-limit use its
// own MemoryStore. undefined rather than a disabled wrapper so that a
// deployment without Redis runs the library's own well-tested default path.
function rateLimitStore(policy) {
  if (!redisEnabled()) return undefined;
  return new RedisRateLimitStore(policy);
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

// Round-trips a PING. Used by GET /health/ready, and nowhere in a request
// path - a readiness probe may pay for an actual check, a customer may not.
async function pingRedis() {
  if (!redisEnabled()) return { enabled: false, ok: null };
  const result = await run((redis) => redis.ping());
  return { enabled: true, ok: result !== FAILED };
}

// Never includes the URL, the token, or the key prefix.
function getRedisHealth() {
  return {
    enabled: redisEnabled(),
    ready: clientReady,
    consecutiveFailures: health.consecutiveFailures,
    lastOkAt: health.lastOk ? health.lastOk.toISOString() : null,
    lastErrorAt: health.lastErrorAt ? health.lastErrorAt.toISOString() : null,
  };
}

// Test seam. Lets the suite drive the failure paths without an Upstash
// account, which is what makes "Redis down" a tested scenario rather than an
// asserted one.
function setRedisClientForTests(fake) {
  client = fake;
  clientReady = Boolean(fake);
  loadFailed = false;
  health.consecutiveFailures = 0;
}

module.exports = {
  isRedisEnabled,
  redisGet,
  redisSet,
  redisDel,
  redisSetIfAbsent,
  redisIncrementWindow,
  redisDecrement,
  withLock,
  rateLimitStore,
  RedisRateLimitStore,
  pingRedis,
  getRedisHealth,
  setRedisClientForTests,
};
