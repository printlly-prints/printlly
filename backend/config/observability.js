// Parses and validates every observability / third-party integration
// setting ONCE, at startup, the same way config/security.js does for CORS,
// trust proxy and rate limiting.
//
// WHY ONE MODULE
//
// Five new third parties (Sentry, Brevo, Teams, PostHog, Upstash) each need
// to answer the same three questions: am I configured, am I enabled, and
// what do I do when the answer is no. Answering those in five places
// produces five different notions of "enabled" and, eventually, one
// integration that throws at request time because nobody validated its URL
// at boot.
//
// THE GOVERNING RULE: every integration here is OPTIONAL and OFF when
// unconfigured.
//
// That is not laziness, it is the failure requirement. Printlly must keep
// taking orders when Sentry, Brevo, Teams, PostHog or Redis is unavailable -
// so a deployment that has not configured them yet must behave exactly like
// a deployment whose provider is down. Both paths run the same code, which
// means the outage path is exercised by every developer every day.
//
// Contrast with config/security.js, which deliberately REFUSES TO START on a
// missing production CORS allowlist, and config/razorpay.js, which refuses on
// a missing production webhook secret. Those are security and money
// controls - running without them is worse than not running. Error reporting
// is not in that category: refusing to boot because Sentry is unconfigured
// would convert a monitoring gap into an outage, which is the exact
// inversion of what monitoring is for.
//
// What IS enforced: a setting that is present but malformed stops the boot.
// A half-configured integration is a configuration bug, and a bug found at
// boot costs a deploy while a bug found at the first real alert costs the
// incident.

const { scrubString } = require("../utils/scrub");

const isProduction = () => process.env.NODE_ENV === "production";

// A tri-state flag: unset means "decide from whether credentials exist",
// "false" means off even if configured, "true" means on if configured.
// The explicit off is what lets a developer silence a provider locally
// without deleting credentials from their .env.
function flagEnabled(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  return String(raw).trim().toLowerCase() === "true";
}

// Validates a URL at boot and returns its parsed form, so a typo in a
// webhook endpoint is a startup error rather than a silent delivery failure
// during an incident - which is precisely when nobody is reading logs.
//
// The error message carries the VARIABLE NAME and never the value: a
// malformed secret is still a secret, and startup logs are widely readable.
function requireHttpsUrl(name, raw, { allowHttp = false } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      name + " is set but is not a valid URL. Expected an https:// endpoint. " +
        "The value is not shown here because it may contain a secret."
    );
  }
  if (url.protocol === "http:" && !allowHttp) {
    throw new Error(
      name + " must use https://. It carries a secret in its path or headers, and http would " +
        "transmit that secret in clear text."
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(name + " must use https:// (got protocol " + url.protocol + ").");
  }
  return url;
}

function looksLikeEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

function numberInRange(raw, fallback, min, max) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

// ---------------------------------------------------------------------------
// Service identity - shared by every integration
// ---------------------------------------------------------------------------
//
// Sentry needs a release to map a stack trace to source, Teams needs to say
// which deployment is broken, and PostHog needs to separate staging traffic
// from real customers. All three read the same values so a card in Teams and
// an issue in Sentry name the same build.
function serviceIdentity(env = process.env) {
  return {
    service: env.SERVICE_NAME || "printlly-backend",
    environment: env.SENTRY_ENVIRONMENT || env.NODE_ENV || "development",
    // Falls back to the backend package version. Not a git SHA, because the
    // repository is not a git checkout in every deployment; a deploy that
    // wants precise release tracking sets APP_VERSION explicitly.
    release: env.APP_RELEASE || env.APP_VERSION || require("../package.json").version,
  };
}

// ---------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------
function sentryConfig(env = process.env) {
  const dsn = (env.SENTRY_DSN || "").trim();
  const explicit = flagEnabled(env.SENTRY_ENABLED);

  if (dsn) {
    // A DSN is a write credential for a Sentry project. Validate its shape
    // so a truncated paste fails at boot rather than silently dropping every
    // error for the life of the deployment.
    requireHttpsUrl("SENTRY_DSN", dsn);
  }

  const identity = serviceIdentity(env);

  return {
    dsn,
    configured: Boolean(dsn),
    enabled: Boolean(dsn) && explicit !== false,
    ...identity,
    // Performance tracing, off by default. Tracing every request on a paid
    // plan is the fastest way to exhaust a quota, and this application's
    // performance questions are answerable from MongoDB Atlas metrics.
    tracesSampleRate: numberInRange(env.SENTRY_TRACES_SAMPLE_RATE, 0, 0, 1),
    // Error sampling. 1.0 by default: errors are rare and each one matters.
    sampleRate: numberInRange(env.SENTRY_SAMPLE_RATE, 1, 0, 1),
  };
}

// ---------------------------------------------------------------------------
// Brevo (transactional email)
// ---------------------------------------------------------------------------
//
// Requires all three of key, sender address and sender name together.
// Partial configuration is rejected rather than defaulted: Brevo refuses a
// send from an unverified sender, so a guessed default would produce a
// provider error on every single email instead of an obvious startup
// failure.
function brevoConfig(env = process.env) {
  const apiKey = (env.BREVO_API_KEY || "").trim();
  const senderEmail = (env.BREVO_SENDER_EMAIL || "").trim();
  const senderName = (env.BREVO_SENDER_NAME || "").trim();
  const explicit = flagEnabled(env.BREVO_ENABLED);

  const anyPresent = Boolean(apiKey || senderEmail || senderName);
  const allPresent = Boolean(apiKey && senderEmail && senderName);

  if (anyPresent && !allPresent) {
    const missing = [];
    if (!apiKey) missing.push("BREVO_API_KEY");
    if (!senderEmail) missing.push("BREVO_SENDER_EMAIL");
    if (!senderName) missing.push("BREVO_SENDER_NAME");
    throw new Error(
      "Brevo is partially configured: " + missing.join(", ") + " missing. " +
        "Set all three or none - Brevo rejects a send from an unverified sender, so a partial " +
        "configuration would fail on every email rather than at startup."
    );
  }

  if (senderEmail && !looksLikeEmail(senderEmail)) {
    throw new Error("BREVO_SENDER_EMAIL is not a valid email address.");
  }

  const replyTo = (env.EMAIL_REPLY_TO || "").trim();
  if (replyTo && !looksLikeEmail(replyTo)) {
    throw new Error("EMAIL_REPLY_TO is not a valid email address.");
  }

  return {
    apiKey,
    senderEmail,
    senderName,
    replyTo: replyTo || senderEmail,
    configured: allPresent,
    enabled: allPresent && explicit !== false,
    apiUrl: env.BREVO_API_URL || "https://api.brevo.com/v3/smtp/email",
    timeoutMs: numberInRange(env.BREVO_TIMEOUT_MS, 8000, 1000, 30000),
  };
}

// ---------------------------------------------------------------------------
// Microsoft Teams (alert destination)
// ---------------------------------------------------------------------------
//
// Teams is an alert DESTINATION, not a monitoring system: nothing decides
// whether something is wrong by asking Teams. It receives a card when a
// human needs to act now.
//
// SEVERITY, and why it is enforced in configuration rather than at each call
// site:
//
//   P0 - Teams immediately + Sentry. Printlly is broken or losing money.
//   P1 - Teams + Sentry. Degraded; someone should look today.
//   P2 - Sentry only. A real error, handled, worth a trend.
//   P3 - logs only. Expected-but-notable.
//
// The threshold is one setting because the failure mode of alerting is
// fatigue: a channel that pages on every ordinary 500 gets muted, and then
// P0 goes unseen. ALERT_MIN_SEVERITY exists so that an on-call team can
// tighten the channel without editing call sites.
const SEVERITIES = ["P0", "P1", "P2", "P3"];

function teamsConfig(env = process.env) {
  const webhookUrl = (env.TEAMS_WEBHOOK_URL || "").trim();
  const explicit = flagEnabled(env.TEAMS_ALERTS_ENABLED);

  if (webhookUrl) {
    // An incoming-webhook URL IS the credential - anyone holding it can post
    // to the channel - which is why it must be https and must never be sent
    // to a client. utils/scrub.js also redacts anything URL-shaped
    // containing "webhook" so it cannot reach Sentry in an error message.
    requireHttpsUrl("TEAMS_WEBHOOK_URL", webhookUrl);
  }

  const minSeverity = (env.ALERT_MIN_SEVERITY || "P1").trim().toUpperCase();
  if (!SEVERITIES.includes(minSeverity)) {
    throw new Error(
      "ALERT_MIN_SEVERITY must be one of " + SEVERITIES.join(", ") + ' (got "' + minSeverity + '").'
    );
  }

  return {
    webhookUrl,
    configured: Boolean(webhookUrl),
    enabled: Boolean(webhookUrl) && explicit !== false,
    minSeverity,
    timeoutMs: numberInRange(env.TEAMS_TIMEOUT_MS, 5000, 1000, 20000),
    // How long the same alert key is suppressed after being sent. Without
    // this, one failing dependency produces one card per failed request -
    // which is how an alert channel becomes unreadable during exactly the
    // incident it exists for.
    dedupeWindowMs: numberInRange(env.ALERT_DEDUPE_WINDOW_MS, 10 * 60 * 1000, 0, 60 * 60 * 1000),
  };
}

// ---------------------------------------------------------------------------
// PostHog (product analytics)
// ---------------------------------------------------------------------------
//
// Product analytics only. Technical errors go to Sentry, and the division is
// kept strict on purpose: an error is a thing to fix, an event is a thing to
// measure, and a tool asked to do both does neither well. Nothing in this
// application makes a decision based on PostHog.
function posthogConfig(env = process.env) {
  const apiKey = (env.POSTHOG_API_KEY || "").trim();
  const explicit = flagEnabled(env.POSTHOG_ENABLED);
  const host = (env.POSTHOG_HOST || "https://eu.i.posthog.com").trim();

  if (apiKey) requireHttpsUrl("POSTHOG_HOST", host);

  return {
    apiKey,
    host,
    configured: Boolean(apiKey),
    enabled: Boolean(apiKey) && explicit !== false,
    // Batched rather than per-event: analytics must never add latency to a
    // customer's request.
    flushAt: numberInRange(env.POSTHOG_FLUSH_AT, 20, 1, 500),
    flushIntervalMs: numberInRange(env.POSTHOG_FLUSH_INTERVAL_MS, 10000, 1000, 60000),
  };
}

// ---------------------------------------------------------------------------
// Upstash Redis (shared ephemeral state)
// ---------------------------------------------------------------------------
//
// Upstash is addressed over its REST API rather than the Redis wire
// protocol. That is the right choice here for one concrete reason: the REST
// interface is stateless, so there is no connection pool to exhaust, no
// reconnect storm after a network blip, and no socket held open by a process
// that is otherwise idle. The cost is a little latency per command, which
// does not matter for counters and locks.
//
// MongoDB remains the source of truth for everything that must survive.
// Redis holds only state that may be lost without a correctness problem:
// rate-limit counters, caches, and locks. See utils/redis.js for the
// fail-open / fail-closed split.
function redisConfig(env = process.env) {
  // Both Upstash's own variable names and a generic REDIS_REST_URL are
  // accepted, because Upstash's dashboard copies one pair and other tooling
  // expects the other.
  const url = (env.UPSTASH_REDIS_REST_URL || env.REDIS_REST_URL || "").trim();
  const token = (env.UPSTASH_REDIS_REST_TOKEN || env.REDIS_REST_TOKEN || "").trim();
  const explicit = flagEnabled(env.REDIS_ENABLED);

  const anyPresent = Boolean(url || token);
  const allPresent = Boolean(url && token);

  if (anyPresent && !allPresent) {
    throw new Error(
      "Upstash Redis is partially configured: " +
        (url ? "UPSTASH_REDIS_REST_TOKEN" : "UPSTASH_REDIS_REST_URL") +
        " is missing. Set both or neither."
    );
  }

  if (url) requireHttpsUrl("UPSTASH_REDIS_REST_URL", url);

  // A legacy redis:// URL is explicitly rejected rather than ignored: a
  // deployment that sets it is expecting distributed rate limiting, and
  // silently running with per-process counters instead would be a security
  // regression discovered only under load.
  const tcpUrl = (env.REDIS_URL || "").trim();
  if (tcpUrl && !allPresent) {
    throw new Error(
      "REDIS_URL is set but this application talks to Upstash over its REST API, not the Redis " +
        "wire protocol. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN instead (Upstash " +
        "console > your database > REST API). Leaving REDIS_URL set alone would silently fall back " +
        "to per-process rate-limit counters."
    );
  }

  return {
    url,
    token,
    configured: allPresent,
    enabled: allPresent && explicit !== false,
    // Short on purpose. Redis is in the request path for rate limiting, so a
    // slow Redis must degrade to "no shared counter" quickly rather than
    // holding every request open.
    timeoutMs: numberInRange(env.REDIS_TIMEOUT_MS, 1500, 200, 10000),
    keyPrefix: (env.REDIS_KEY_PREFIX || "printlly").trim(),
  };
}

// ---------------------------------------------------------------------------
// The whole picture, resolved once
// ---------------------------------------------------------------------------
let cached = null;

// `fresh: true` re-reads the environment AND replaces the cache, so that a
// caller which has just changed a setting sees the change everywhere - not
// only in its own return value. Nothing in the running application passes
// it; it exists for the test suite, which changes a timeout or a severity
// threshold and then drives the real code path that reads it. A fresh read
// that left the cache stale would silently test the old value.
function observabilityConfig(env = process.env, { fresh = false } = {}) {
  if (cached && !fresh) return cached;
  const resolved = {
    identity: serviceIdentity(env),
    sentry: sentryConfig(env),
    brevo: brevoConfig(env),
    teams: teamsConfig(env),
    posthog: posthogConfig(env),
    redis: redisConfig(env),
  };
  cached = resolved;
  return resolved;
}

// Says out loud what is actually on, in the first lines of the log, in the
// same style as the existing [security] / [payments] startup lines.
//
// Prints names and states only - never a DSN, key, token or webhook URL.
// A startup log is one of the most frequently pasted artefacts in support
// threads, so it is treated as public.
function logObservabilityPosture(config = observabilityConfig()) {
  const state = (c) => (c.enabled ? "enabled" : c.configured ? "configured but DISABLED" : "not configured");

  console.log(
    "[observability] service: " + config.identity.service +
      " | environment: " + config.identity.environment +
      " | release: " + config.identity.release
  );
  console.log(
    "[observability] sentry: " + state(config.sentry) +
      " | traces: " + config.sentry.tracesSampleRate +
      " | brevo email: " + state(config.brevo) +
      " | posthog: " + state(config.posthog)
  );
  console.log(
    "[observability] teams alerts: " + state(config.teams) +
      " (min severity " + config.teams.minSeverity + ")" +
      " | redis: " + state(config.redis) +
      (config.redis.enabled ? " (distributed rate limiting)" : " (per-process rate limiting)")
  );

  // Production gaps are warned about loudly but do NOT stop the boot - see
  // the note at the top of this file for why monitoring must never be able
  // to cause an outage.
  if (isProduction()) {
    const gaps = [];
    if (!config.sentry.enabled) gaps.push("Sentry (no error reporting)");
    if (!config.teams.enabled) gaps.push("Teams (no critical alerting)");
    if (!config.brevo.enabled) gaps.push("Brevo (no transactional email will be sent)");
    if (!config.redis.enabled) gaps.push("Redis (rate limits are per-process, so they multiply by instance count)");
    if (gaps.length > 0) {
      console.warn(
        "[observability] WARNING: NODE_ENV=production with these integrations inactive: " +
          gaps.join("; ") +
          ". Printlly will run normally, but these failures will be invisible."
      );
    }
  }
}

module.exports = {
  observabilityConfig,
  logObservabilityPosture,
  serviceIdentity,
  sentryConfig,
  brevoConfig,
  teamsConfig,
  posthogConfig,
  redisConfig,
  requireHttpsUrl,
  looksLikeEmail,
  flagEnabled,
  isProduction,
  SEVERITIES,
  // Re-exported so an integration never reaches for its own sanitiser.
  scrubString,
};
