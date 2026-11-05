// FIRST, before anything else is required. Sentry instruments Express,
// Mongoose and http by patching them as they load, so a module already in the
// require cache when Sentry starts is never instrumented. See instrument.js -
// it also loads dotenv, which is why the usual dotenv call below is now
// redundant but kept for clarity.
require("./instrument");

require("dotenv").config();
const http = require("http");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const connectDB = require("./config/db");
const { passport } = require("./config/passport");
const {
  buildCorsOptions,
  buildHelmetOptions,
  resolveTrustProxy,
  resolveAllowedOrigins,
  rateLimitEnabled,
} = require("./config/security");
const {
  authLimiter,
  uploadLimiter,
  orderLimiter,
  generalLimiter,
  adminLimiter,
  webhookLimiter,
} = require("./middleware/rateLimit");
const { startAbandonedOrderCleanup } = require("./cron/cleanupAbandonedOrders");
const { startDocumentCleanup } = require("./cron/cleanupDocuments");
const { startEmailRetries } = require("./cron/retryEmails");
const { logObservabilityPosture } = require("./config/observability");
const {
  captureError,
  setupExpressErrorHandler,
  flushSentry,
  isSentryActive,
} = require("./utils/sentry");
const { alertP0, alertP1, ALERT, recordServerError } = require("./utils/alerts");
const { initAnalytics, shutdownAnalytics } = require("./utils/analytics");

const authRoutes = require("./routes/authRoutes");
const shopRoutes = require("./routes/shopRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const paymentWebhookRoutes = require("./routes/paymentWebhookRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const pricingRoutes = require("./routes/pricingRoutes");
const savedShopRoutes = require("./routes/savedShopRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const adminRoutes = require("./routes/adminRoutes");
const supportRoutes = require("./routes/supportRoutes");
const healthRoutes = require("./routes/healthRoutes");
const { initSocket } = require("./config/socket");

const app = express();

// How to work out the client's real IP. Off unless TRUST_PROXY says
// otherwise - see config/security.js for why this must not default to
// trusting everything: on a server with no proxy in front of it, trusting
// X-Forwarded-For lets any caller forge an address and so reset their own
// rate limit at will.
const trustProxy = resolveTrustProxy();
app.set("trust proxy", trustProxy);

// Security response headers, FIRST in the chain so that every response
// carries them - not just the ones that reach a route handler. Mounted ahead
// of the CORS middleware and the rate limiters on purpose: a 429 from a
// limiter and a cross-origin request that gets refused are both still
// responses this server sent, and both should be hardened. See
// config/security.js for why several of helmet's defaults are overridden -
// its defaults assume a server that returns HTML, and this one does not.
app.use(helmet(buildHelmetOptions()));

// Cross-origin access, from an explicit allowlist (CORS_ALLOWED_ORIGINS,
// plus FRONTEND_URL, plus localhost outside production). Validated at
// startup, so a malformed or missing production allowlist stops the boot
// instead of quietly serving everybody. Requests with no Origin header -
// the Expo app, the e2e suite, curl - are unaffected; they are not browser
// cross-origin requests and are guarded by the JWT on every route.
app.use(cors(buildCorsOptions()));

// Health and readiness probes, mounted HERE - after the security headers so
// their responses are hardened like any other, but ahead of every rate
// limiter and every body parser.
//
// Ahead of the limiters for the same reason the "/" check further down is
// unmetered: an uptime monitor polls from one address on a fixed interval
// forever, so metering it would eventually return a 429 - and a 429 is not a
// 200, so the monitor would declare a healthy server down. A probe that
// triggers the alert it exists to prevent is worse than no probe.
//
// Ahead of express.json() because neither route reads a body, and there is no
// reason to parse one for a request that arrives every sixty seconds.
app.use("/health", healthRoutes);

// The Razorpay webhook, mounted BEFORE express.json() because its signature
// is an HMAC over the exact bytes Razorpay sent. Parsing the JSON and
// re-serialising it to verify would not reliably reproduce those bytes - key
// order, whitespace and number formatting can all differ - and one byte of
// difference changes the hash.
//
// express.raw() hands the handler a Buffer and marks the body as read, so the
// express.json() below skips this request rather than fighting over it. Every
// other route is unaffected and still gets ordinary parsed JSON.
//
// Mounted ahead of the "/payments" line further down so that this path gets
// webhookLimiter instead of the per-user orderLimiter - Razorpay has no user
// identity to limit by. See routes/paymentWebhookRoutes.js.
app.use(
  "/payments/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
  webhookLimiter,
  paymentWebhookRoutes
);

// Body parsing BEFORE the limiters: the auth limiter keys partly on the
// email being targeted, which it can only see once the JSON body is parsed.
app.use(express.json());

// No express-session / passport.session() - Google OAuth uses session:
// false throughout (see routes/authRoutes.js), so req.user is only ever
// set for the duration of that one callback request. initialize() is
// still required for passport.authenticate() to work at all.
app.use(passport.initialize());

// Mount feature routes under their respective base paths, each behind the
// rate-limit policy that fits what it protects (see middleware/rateLimit.js
// for the sizing of each one). Mounted per prefix rather than globally so
// that the health check below stays unmetered, and so one noisy category
// cannot consume another's allowance.
//
// The limiters read user identity straight from the JWT, so mounting them
// out here - ahead of each router's own verifyToken - still buckets per
// user rather than per IP.
// Profile reads/edits are normal authenticated activity, not sign-in attempts.
// They must not consume the much smaller login budget for the shared IP.
app.use("/auth", (req, res, next) => {
  const isProfile = /^\/profile\/?$/i.test(req.path) && ["GET", "HEAD", "PATCH"].includes(req.method);
  return (isProfile ? generalLimiter : authLimiter)(req, res, next);
}, authRoutes);
app.use("/shops", generalLimiter, shopRoutes);
app.use("/orders", orderLimiter, orderRoutes);
app.use("/payments", orderLimiter, paymentRoutes);
app.use("/upload", uploadLimiter, uploadRoutes);
app.use("/pricing-config", generalLimiter, pricingRoutes);
app.use("/saved-shops", generalLimiter, savedShopRoutes);
app.use("/notifications", generalLimiter, notificationRoutes);
// Admin panel API. Every route under here is admin-only, enforced once at
// the router level - see routes/adminRoutes.js.
app.use("/admin", adminLimiter, adminRoutes);
// Customer support chat, customer side. The admin side lives under
// /admin/support (see routes/adminRoutes.js), and the live half of the
// same feature runs over Socket.io on this same port - see below.
app.use("/support", generalLimiter, supportRoutes);

// Simple health check endpoint. Deliberately NOT behind a limiter: a
// platform health probe hits this every few seconds from one address, and
// metering it would eventually mark a healthy server as down.
app.get("/", (req, res) => {
  res.json({ message: "Print marketplace API is running" });
});

// ---------------------------------------------------------------------------
// Error handling - LAST, after every route
// ---------------------------------------------------------------------------
//
// Express only treats a middleware as an error handler if it is registered
// after the routes it should catch for, which is why this block cannot move.
//
// Sentry's handler goes first and only observes: it reports the error and
// calls next(), so the response is still decided by our own handler below.
// Configured to report 5xx only - a 400 or a 404 is the API working
// correctly, and reporting those would bury real defects under validation
// noise. See utils/sentry.js.
setupExpressErrorHandler(app);

// The application's own handler. Three jobs, in order of importance:
//
//   1. Never leak internals. A stack trace in a response body tells an
//      attacker the framework, the file layout and often the query that
//      failed. Mongoose and Multer errors are especially talkative.
//   2. Notice a PATTERN. One 500 is a bug; thirty in a minute is an
//      incident, and only the second deserves to interrupt someone.
//   3. Answer the client something it can act on.
app.use((error, req, res, next) => {
  const status = error.status || error.statusCode || 500;

  // Client errors pass through with their own message. These are deliberate
  // responses from validation code, not failures.
  if (status < 500) {
    return res.status(status).json({ message: error.message || "Request could not be processed" });
  }

  // Logged in full on OUR side, where the detail belongs.
  console.error(
    `[error] ${JSON.stringify({
      method: req.method,
      path: req.originalUrl ? req.originalUrl.split("?")[0] : req.url,
      status,
      error: error.message,
      timestamp: new Date().toISOString(),
    })}`
  );
  if (error.stack) console.error(error.stack);

  // Sentry's handler above has already reported this one, so capturing it
  // again here would double-count the issue. It is captured only when Sentry
  // is not mounted - which is the case when Sentry is disabled, where
  // captureError is itself a no-op, so this is simply harmless.
  if (!isSentryActive()) {
    captureError(error, { tags: { feature: "http" }, request: req });
  }

  // Error-rate tracking. A single 500 reaches Sentry and no further; a burst
  // means something systemic, and that is the thing worth a card.
  const rate = recordServerError();
  if (rate.exceeded) {
    alertP1({
      reason: ALERT.SERVER_ERROR_RATE,
      title: "Elevated 5xx rate",
      summary:
        `${rate.count} server errors in the last ${Math.round(rate.windowMs / 1000)} seconds. ` +
        "Something systemic is failing rather than one bad request. Check Sentry for the grouped " +
        "issue and /health/ready for dependency state.",
      facts: { errors_in_window: rate.count, window_seconds: Math.round(rate.windowMs / 1000) },
    });
  }

  // A fixed, uninformative body. The client cannot do anything with the
  // detail, and anyone who can is reading the log.
  res.status(500).json({ message: "Something went wrong. Please try again." });
});

const PORT = process.env.PORT || 5000;

// Express no longer creates its own listener: the HTTP server is made
// explicitly so Socket.io can attach to the SAME one. app.listen() would
// build a server internally and hand back no usable reference, leaving
// sockets to run on a second port - a second CORS configuration, a
// second URL for every client to hold, and a second thing to get wrong
// in deployment, for no benefit.
const httpServer = http.createServer(app);
initSocket(httpServer);

// Say out loud what the security posture actually is, so a misconfigured
// deployment is visible in the first lines of the log rather than inferred
// later from a support ticket.
const allowedOrigins = resolveAllowedOrigins();
console.log(
  `[security] CORS allowlist: ${allowedOrigins.length > 0 ? allowedOrigins.join(", ") : "(none configured)"}${
    process.env.NODE_ENV === "production" ? "" : " + localhost/Expo (development only)"
  }`
);
console.log(
  `[security] security headers: helmet enabled | HSTS: ${
    process.env.NODE_ENV === "production" ? "on (production)" : "off (non-production)"
  }`
);
console.log(
  `[payments] razorpay: ${require("./config/razorpay").isRazorpayConfigured ? "configured" : "NOT configured"} | webhook signature verification: ${
    require("./config/razorpay").isWebhookConfigured ? "enabled" : "DISABLED (RAZORPAY_WEBHOOK_SECRET unset)"
  }`
);
console.log(
  `[security] rate limiting: ${rateLimitEnabled() ? "enabled" : "DISABLED (RATE_LIMIT_ENABLED=false)"} | trust proxy: ${JSON.stringify(trustProxy)}`
);

// Which third-party integrations are actually active. Names and states only -
// never a DSN, key, token or webhook URL. A startup log is one of the most
// frequently pasted artefacts in a support thread, so it is treated as
// public. See config/observability.js.
logObservabilityPosture();

// PostHog's batching client. Started here rather than lazily so the first
// tracked event does not pay for initialisation, and so a misconfiguration
// is reported at boot alongside everything else.
initAnalytics();

// ---------------------------------------------------------------------------
// Process-level safety net
// ---------------------------------------------------------------------------
//
// An error that escapes every handler - thrown in a timer, in an event
// emitter, or in a promise nobody awaited - never reaches Express, so without
// these it would be invisible. Node's default for an uncaught exception is to
// print and exit, which in production means a container restarting with no
// record of why.
//
// The deliberate asymmetry: an uncaught exception EXITS, an unhandled
// rejection does NOT.
//
// After an uncaught exception the process is in an unknown state - a
// half-finished handler may have left a Mongoose session or a file descriptor
// open, and continuing risks serving wrong answers rather than no answers.
// Exiting lets the platform restart a clean process. An unhandled rejection
// is usually a forgotten `.catch()` on something peripheral, and killing a
// server that is otherwise serving orders correctly would be a worse outcome
// than the bug itself.
let shuttingDown = false;

async function reportAndExit(error, kind) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.error(`[fatal] ${kind}: ${error && error.message}`);
  if (error && error.stack) console.error(error.stack);

  // Awaited, with a timeout, because the process is about to end: an
  // unflushed report is a lost one, and this is the error most worth having.
  await Promise.race([
    alertP0({
      reason: ALERT.UNCAUGHT_EXCEPTION,
      title: "Backend crashed: " + kind,
      summary:
        "An error escaped every handler and the process is exiting. If the platform restarts it " +
        "automatically, service should resume within seconds; if not, the backend is down. The stack " +
        "trace is in Sentry.",
      facts: { kind },
      error,
    }),
    new Promise((resolve) => setTimeout(resolve, 4000)),
  ]);

  await flushSentry(2000);
  process.exit(1);
}

process.on("uncaughtException", (error) => {
  reportAndExit(error, "uncaughtException");
});

process.on("unhandledRejection", (reason) => {
  const error = reason instanceof Error ? reason : new Error("Unhandled rejection: " + String(reason));
  console.error(`[fatal] unhandledRejection: ${error.message}`);
  if (error.stack) console.error(error.stack);

  // Reported, not fatal - see above.
  alertP1({
    reason: ALERT.UNCAUGHT_EXCEPTION,
    title: "Unhandled promise rejection",
    summary:
      "A promise rejected with nothing to catch it. The server is still running and still serving " +
      "requests, but whatever operation this belonged to did not complete.",
    facts: { kind: "unhandledRejection" },
    error,
  });
});

// Graceful shutdown. A platform sends SIGTERM and then kills the process a
// short time later, so this is the only window in which buffered analytics
// events and queued Sentry reports can still be sent. Without it, the last
// few seconds before every deploy are silently lost - including, often, the
// error that prompted the deploy.
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received, closing down`);

  httpServer.close();
  await Promise.race([
    Promise.all([shutdownAnalytics(), flushSentry(2000)]),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

connectDB().then(() => {
  httpServer.listen(PORT, () => console.log(`Server running on port ${PORT} (HTTP + Socket.io)`));
  startAbandonedOrderCleanup();
  // Retries document deletions that failed, and removes uploads that were
  // never ordered - see cron/cleanupDocuments.js.
  startDocumentCleanup();
  // Retries transactional emails that hit a transient provider failure.
  // No-ops when Brevo is not configured.
  startEmailRetries();
});
