// Sentry: technical error reporting.
//
// Sentry answers "what broke and where". It is deliberately NOT the alerting
// system (that is utils/alerts.js -> Teams) and NOT the analytics system
// (that is utils/analytics.js -> PostHog). Keeping those three apart is what
// makes each one readable: an error channel that also carries product events
// is a channel nobody reads.
//
// TWO HARD RULES
//
// 1. Nothing here may ever throw into a caller. An error reporter that can
//    fail an order is worse than no error reporter - it converts a logged
//    warning into a customer-visible failure. Every exported function
//    swallows its own errors.
//
// 2. Nothing leaves without passing through utils/scrub.js. Sentry stores
//    what it is sent, indefinitely, outside our infrastructure, readable by
//    anyone with dashboard access. A customer's document URL or pickup OTP
//    arriving in an issue is a data breach regardless of how it got there,
//    so the filter is applied in beforeSend - the single chokepoint every
//    event passes through - rather than trusted to each call site.

const Sentry = require("@sentry/node");
const { observabilityConfig } = require("../config/observability");
const { scrub, scrubHeaders, scrubUrl, safeUser, safeRequest } = require("./scrub");

let initialised = false;
let active = false;

// Rebuilds an outbound event from only the fields known to be safe.
//
// This is an allowlist, not a cleanup pass, and that distinction is the whole
// point. Sentry's own integrations attach request data, local variables and
// breadcrumbs; a denylist would have to anticipate every field any current or
// future integration might add. Instead the event is reduced to the fields
// below and everything else is dropped, so a new Sentry feature cannot start
// shipping data we never agreed to send.
function sanitiseEvent(event) {
  try {
    // Request data: discard whatever Sentry collected and substitute our own
    // scrubbed version. Sentry's requestDataIntegration would otherwise
    // include headers (Authorization) and the full query string.
    if (event.request) {
      const request = event.request;
      event.request = {
        method: request.method,
        url: scrubUrl(request.url || ""),
        headers: scrubHeaders(request.headers || {}),
        query_string: undefined,
        cookies: undefined,
        data: request.data ? scrub(request.data) : undefined,
      };
    }

    // The user: id and role only. Sentry defaults to attaching ip_address,
    // which is personal data we have no need for.
    event.user = event.user ? safeUser(event.user) || undefined : undefined;

    if (event.extra) event.extra = scrub(event.extra);
    if (event.tags) event.tags = scrub(event.tags);

    // Exception messages themselves get the value-pattern pass, because a
    // Mongoose validation error or a Cloudinary failure quotes the offending
    // value in its message - which is how a document URL ends up in a title.
    if (event.exception && Array.isArray(event.exception.values)) {
      for (const value of event.exception.values) {
        if (typeof value.value === "string") {
          value.value = scrub(value.value);
        }
      }
    }
    if (typeof event.message === "string") event.message = scrub(event.message);

    // Breadcrumbs carry HTTP requests Sentry observed, including URLs with
    // query strings and bodies.
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.slice(-20).map((crumb) => ({
        type: crumb.type,
        category: crumb.category,
        level: crumb.level,
        timestamp: crumb.timestamp,
        message: typeof crumb.message === "string" ? scrub(crumb.message) : undefined,
        data: crumb.data ? scrub(crumb.data) : undefined,
      }));
    }

    // Local variables from stack frames. Enormously useful and completely
    // unfiltered - a frame inside the login controller holds the plaintext
    // password - so they are removed wholesale.
    if (event.exception && Array.isArray(event.exception.values)) {
      for (const value of event.exception.values) {
        const frames = value.stacktrace && value.stacktrace.frames;
        if (Array.isArray(frames)) {
          for (const frame of frames) {
            delete frame.vars;
          }
        }
      }
    }

    return event;
  } catch {
    // A sanitiser that throws must drop the event rather than let an
    // unsanitised one through.
    return null;
  }
}

// Starts Sentry, at most once. Safe to call when unconfigured: it simply
// does nothing and every helper below becomes a no-op, which is the same
// code path a Sentry outage takes.
function initSentry() {
  if (initialised) return active;
  initialised = true;

  let config;
  try {
    config = observabilityConfig().sentry;
  } catch (error) {
    // A malformed SENTRY_DSN throws from config validation. That must not
    // stop the server - it is a monitoring misconfiguration, not a security
    // one - so it is reported and Sentry stays off.
    console.error("[sentry] disabled: " + error.message);
    return false;
  }

  if (!config.enabled) return false;

  try {
    Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.service + "@" + config.release,
      sampleRate: config.sampleRate,
      tracesSampleRate: config.tracesSampleRate,
      // The master switch for Sentry's own PII collection: IP addresses,
      // cookies, request headers and user identity inferred from the
      // request. Off. Everything we DO want attached is attached explicitly
      // and scrubbed first.
      sendDefaultPii: false,
      // Local variables per stack frame. Off for the reason in sanitiseEvent
      // above - the plaintext password in a login frame is the clearest
      // example, but every frame in every controller has the same exposure.
      includeLocalVariables: false,
      // Sentry's SDK logs its own transport failures. Silenced because a
      // Sentry outage would otherwise fill the application log with noise
      // about Sentry at exactly the moment the application log matters.
      debug: false,
      beforeSend(event) {
        return sanitiseEvent(event);
      },
      beforeSendTransaction(event) {
        return sanitiseEvent(event);
      },
      initialScope: {
        tags: { service: config.service },
      },
    });

    active = true;
    return true;
  } catch (error) {
    console.error("[sentry] initialisation failed, continuing without it: " + error.message);
    active = false;
    return false;
  }
}

const isSentryActive = () => active;

// Reports an error with safe context attached.
//
// `context` is free-form and goes through the recursive scrub, so a call site
// may pass whatever helps diagnosis without having to know which of its own
// fields are sensitive. The convention used throughout this codebase is
// { feature, order_id, user_id, ... } - ids rather than records.
//
// Returns the Sentry event id, or null. Never throws.
function captureError(error, context = {}) {
  try {
    if (!active) return null;

    const { level = "error", tags = {}, user = null, request = null, ...extra } = context;

    return Sentry.withScope((scope) => {
      scope.setLevel(level);
      // Tags are indexed and searchable in Sentry, so the small set that
      // identifies WHERE something broke goes here, and the detail goes in
      // extra. A high-cardinality value (an order id) must never be a tag -
      // it would create one tag value per order.
      for (const [key, value] of Object.entries(tags)) {
        if (value !== undefined && value !== null) scope.setTag(key, String(value));
      }
      if (user) scope.setUser(safeUser(user));
      if (request) scope.setExtra("request", safeRequest(request));
      if (Object.keys(extra).length > 0) scope.setExtras(scrub(extra));

      return error instanceof Error
        ? Sentry.captureException(error)
        : Sentry.captureMessage(String(error), level);
    });
  } catch {
    return null;
  }
}

// A message with no exception attached - for an anomaly that is not a thrown
// error but still needs recording, such as a webhook reporting an amount that
// does not match our own total.
function captureMessage(message, context = {}) {
  try {
    if (!active) return null;
    return captureError(message, { level: "warning", ...context });
  } catch {
    return null;
  }
}

// Mounts Sentry's Express error handler.
//
// MUST be called after all routes and before this application's own error
// handler, which is where server.js calls it. Harmless when Sentry is off.
function setupExpressErrorHandler(app) {
  try {
    if (!active) return false;
    Sentry.setupExpressErrorHandler(app, {
      // Report 5xx only. A 400 or a 404 is the API working correctly - a
      // client sent something wrong - and reporting those would bury real
      // defects under validation noise.
      shouldHandleError(error) {
        const status = error.status || error.statusCode || 500;
        return status >= 500;
      },
    });
    return true;
  } catch (error) {
    console.error("[sentry] could not mount express error handler: " + error.message);
    return false;
  }
}

// Waits for queued events to be transmitted. Called on shutdown, so that the
// crash which caused the shutdown is actually reported rather than lost with
// the process.
async function flushSentry(timeoutMs = 2000) {
  try {
    if (!active) return true;
    return await Sentry.flush(timeoutMs);
  } catch {
    return false;
  }
}

module.exports = {
  initSentry,
  isSentryActive,
  captureError,
  captureMessage,
  setupExpressErrorHandler,
  flushSentry,
  sanitiseEvent,
  Sentry,
};
