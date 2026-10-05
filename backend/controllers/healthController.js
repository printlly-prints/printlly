const mongoose = require("mongoose");
const { observabilityConfig } = require("../config/observability");
const { pingRedis } = require("../utils/redis");
const { captureMessage } = require("../utils/sentry");

// Health and readiness, for an external uptime monitor (UptimeRobot) and for
// any platform that gates traffic on a readiness probe.
//
// TWO ENDPOINTS, BECAUSE THEY ANSWER DIFFERENT QUESTIONS
//
//   GET /health        Is this process alive and serving HTTP?
//                      Touches nothing. Always 200 if the event loop is
//                      turning. This is what an uptime monitor should watch,
//                      because it goes red only when the server is genuinely
//                      unreachable.
//
//   GET /health/ready  Can this process actually do its job right now?
//                      Checks the dependencies without which every request
//                      would fail anyway. 503 when it cannot.
//
// Conflating them is a common and expensive mistake. A single endpoint that
// checks the database will report the SERVER as down during a database
// blip, so the alert says "Printlly is offline" when the truth is "MongoDB
// is unreachable" - and the first ten minutes of the incident are spent
// looking at the wrong system. Worse, a platform that restarts containers on
// a failed liveness check will cycle every instance during a database
// outage, turning a recoverable dependency failure into a total one.
//
// WHAT THESE RESPONSES DELIBERATELY DO NOT CONTAIN
//
// Both endpoints are unauthenticated - they have to be, an uptime monitor
// has no credentials - so the response body is treated as public. No
// hostnames, no connection strings, no driver error text, no stack traces, no
// version numbers, no dependency names beyond the fact that a check failed.
//
// An attacker learning "the database is down" from a 503 is unavoidable and
// harmless; learning the cluster hostname from a driver error message is
// neither. The detail an operator needs goes to the application log and to
// Sentry, both of which are already authenticated.

// How long a dependency check may take before it is treated as failed.
// Short on purpose: a readiness probe that hangs is indistinguishable from a
// dead server to the thing polling it, and a monitor timing out produces a
// less useful alert than an honest 503.
const CHECK_TIMEOUT_MS = 2500;

function withTimeout(promise, timeoutMs, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label + " check timed out")), timeoutMs)
    ),
  ]);
}

// Is MongoDB actually answering?
//
// readyState alone is not enough. Mongoose reports 1 ("connected") based on
// its own view of the socket, which can lag reality - a cluster failover or a
// silently dropped connection leaves readyState at 1 while every query hangs.
// A ping is the only answer that means the database is really there.
async function checkMongo() {
  if (mongoose.connection.readyState !== 1) {
    return { ok: false, detail: "readyState=" + mongoose.connection.readyState };
  }
  try {
    await withTimeout(mongoose.connection.db.admin().ping(), CHECK_TIMEOUT_MS, "mongodb");
    return { ok: true };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

// Configuration this application cannot function without, regardless of
// whether any dependency is reachable.
//
// Only genuinely required values. The optional integrations (Sentry, Brevo,
// Teams, PostHog, Redis) are NOT checked here: a deployment is perfectly
// ready to serve orders without them, and reporting not-ready because an
// analytics key is missing would take a working server out of the load
// balancer.
function checkConfiguration() {
  const missing = [];
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
  if (!process.env.JWT_SECRET) missing.push("JWT_SECRET");
  if (!process.env.CLOUDINARY_CLOUD_NAME) missing.push("CLOUDINARY_CLOUD_NAME");
  if (!process.env.CLOUDINARY_API_KEY) missing.push("CLOUDINARY_API_KEY");
  if (!process.env.CLOUDINARY_API_SECRET) missing.push("CLOUDINARY_API_SECRET");
  return { ok: missing.length === 0, detail: missing.join(", ") };
}

// GET /health
//
// Liveness. Deliberately trivial: if this handler runs, the process is up and
// Express is routing. It makes no outbound call, so it cannot be made to fail
// by a dependency and cannot be used to generate load against one.
const health = (req, res) => {
  res.status(200).json({ status: "ok" });
};

// GET /health/ready
//
// Readiness. 200 only when every hard dependency answered.
const ready = async (req, res) => {
  const config = observabilityConfig();

  const [mongo, redis] = await Promise.all([
    checkMongo(),
    // Checked only when configured. An unconfigured Redis is a supported
    // deployment (rate limits become per-process), not a failure, so it must
    // never make a server not-ready.
    config.redis.enabled
      ? withTimeout(pingRedis(), CHECK_TIMEOUT_MS, "redis").catch(() => ({ enabled: true, ok: false }))
      : Promise.resolve({ enabled: false, ok: null }),
  ]);

  const configuration = checkConfiguration();

  // Redis is NOT a hard dependency, and that is a deliberate judgement.
  // Losing it degrades rate limiting to per-process counters - the same
  // behaviour as a deployment that never configured it - which is a
  // reduction in protection, not an inability to serve. Taking every
  // instance out of the load balancer because a counter store is unreachable
  // would be a self-inflicted outage.
  const hardFailures = [];
  if (!mongo.ok) hardFailures.push("database");
  if (!configuration.ok) hardFailures.push("configuration");

  const degraded = [];
  if (redis.enabled && !redis.ok) degraded.push("cache");

  if (hardFailures.length > 0) {
    // The detail goes to the log and to Sentry, never to the response.
    console.error(
      "[health] not ready: " +
        JSON.stringify({
          failed: hardFailures,
          mongodb: mongo.ok ? "ok" : mongo.detail,
          configuration: configuration.ok ? "ok" : "missing " + configuration.detail,
          timestamp: new Date().toISOString(),
        })
    );
    captureMessage("Readiness check failed", {
      tags: { feature: "health" },
      failed: hardFailures.join(","),
    });

    // 503 with a fixed body. No reasons, no names, no counts - an
    // unauthenticated caller learns only that this instance should not
    // receive traffic, which is all a load balancer needs.
    return res.status(503).json({ status: "not_ready" });
  }

  // "degraded" is reported because it is useful to an operator watching the
  // endpoint and reveals nothing: it names a category, not a provider, a
  // host or an error. The status stays "ok" because the instance can serve.
  if (degraded.length > 0) {
    return res.status(200).json({ status: "ok", degraded });
  }

  return res.status(200).json({ status: "ok" });
};

module.exports = { health, ready, checkMongo, checkConfiguration, CHECK_TIMEOUT_MS };
