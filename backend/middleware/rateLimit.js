// Rate limiters, one policy per kind of abuse rather than one global cap.
//
// A single global limit cannot be set correctly: whatever number lets a
// vendor refresh their order list all morning is far too high to stop
// someone grinding through a six-digit pickup OTP, and whatever number
// stops the OTP grinder would break the dashboard. So each limiter below
// is sized for what it is protecting.
//
// IDENTITY (the part that matters most here)
//
// Keying purely by IP is wrong for this application. Customers are on
// mobile networks, where thousands of handsets share one carrier NAT
// address; a per-IP limit strict enough to be useful would lock out an
// entire mobile operator the moment two real customers were busy. So every
// limiter keys by authenticated user id when there is one, and falls back
// to IP only for genuinely anonymous traffic (login, register).
//
// The user id is read by verifying the same JWT the real auth middleware
// verifies, through the same decodeAuthToken function (middleware/auth.js),
// so a limiter can never bucket a request as a user that verifyToken would
// then reject. That shared call is also why these limiters can be mounted
// in server.js ahead of the routers and still see user identity - they do
// not depend on verifyToken having run first.
//
// WHERE THE COUNTERS LIVE
//
// By default, in this process's memory. When Upstash Redis is configured,
// in Redis instead - see utils/redis.js RedisRateLimitStore.
//
// That swap matters more than it looks. With per-process counters, a limit of
// 20 becomes an effective limit of 20 x (number of instances), and the
// effective limit changes silently whenever the deployment scales. The
// configured number only means what it says when the counter is shared.
//
// Only the STORE changes. Every policy below - the sizing, the identity
// keying, the 429 shape, the successful-request refund on the OTP limiter -
// is untouched by it, and a Redis outage degrades back to per-process
// counters rather than failing open or closed.
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");
const { decodeAuthToken } = require("./auth");
const { rateLimitPolicy, rateLimitEnabled } = require("../config/security");
const { rateLimitStore } = require("../utils/redis");

// Pulls the user id out of the Authorization header without trusting
// anything unverified. A token that fails verification is deliberately NOT
// given a user bucket - it falls through to the IP key, so someone cannot
// mint junk tokens to get a fresh allowance each time.
function identityKey(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    const decoded = decodeAuthToken(header.slice(7));
    if (decoded && decoded.id) return `user:${decoded.id}`;
  }
  // ipKeyGenerator normalises IPv6 (it collapses a /56 so that one host
  // cannot walk through its own address space to get unlimited attempts).
  // express-rate-limit v8 requires custom key generators to use it.
  return `ip:${ipKeyGenerator(req.ip)}`;
}

// 429 body. Includes the retry delay in the payload as well as in the
// Retry-After header, because the mobile app reads JSON far more
// comfortably than it reads headers, and a client that cannot tell how
// long to wait will simply retry immediately.
function limitHandler(req, res, _next, options) {
  const retryAfterSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
  const resetAt = req.rateLimit?.resetTime;
  const seconds = resetAt
    ? Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))
    : retryAfterSeconds;

  res.setHeader("Retry-After", String(seconds));
  res.status(options.statusCode).json({
    message: options.message,
    retry_after_seconds: seconds,
  });
}

// Shared across every policy below so that header behaviour, the 429 shape
// and the identity rule cannot drift apart between limiters.
function makeLimiter({ name, defaults, message, keyGenerator = identityKey, countOnlyFailures = false }) {
  const policy = rateLimitPolicy(name, defaults);

  return rateLimit({
    windowMs: policy.windowMs,
    limit: policy.max,
    // Shared counters when Redis is configured, express-rate-limit's own
    // MemoryStore when it is not (undefined leaves the library's default in
    // place rather than wrapping it). Namespaced by policy name, because
    // several policies key by bare user identity and would otherwise share
    // one bucket in Redis - see RedisRateLimitStore's constructor.
    store: rateLimitStore(name),
    // Refunds the attempt when the response was a success. Used by the OTP
    // limiter: the budget should be spent by wrong guesses, not by a shop
    // completing pickups correctly all day. Evaluated after the handler has
    // run, which is why it cannot be expressed through `skip` below - that
    // is consulted before the route, when the status is still 200.
    skipSuccessfulRequests: countOnlyFailures,
    // draft-7 RateLimit / RateLimit-Policy headers, plus Retry-After on a
    // 429. The deprecated X-RateLimit-* headers are left off.
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message,
    keyGenerator,
    handler: limitHandler,
    skip: (req) => {
      if (!rateLimitEnabled()) return true;
      // Preflights carry no credentials and cannot do anything by
      // themselves; counting them would mean a cross-origin dashboard
      // burned two of its allowance per real request.
      return req.method === "OPTIONS";
    },
    // Named so the warning text names the limiter when a validation check
    // (e.g. a forged X-Forwarded-For arriving while trust proxy is off)
    // fires.
    validate: { trustProxy: true, xForwardedForHeader: true },
  });
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

// Login / register / OAuth code exchange. Strict, and keyed by IP plus the
// email being targeted, so that a password-spray against one account is
// stopped even if the attacker rotates addresses, and a shared office NAT
// cannot lock everybody out of their own accounts at once.
//
// 20 per 15 minutes per (IP, account): far above a human who has forgotten
// which password they used, far below anything that could work through a
// password list.
const authLimiter = makeLimiter({
  name: "AUTH",
  defaults: { windowMs: 15 * 60 * 1000, max: 20 },
  message: "Too many sign-in attempts. Please wait a few minutes and try again.",
  keyGenerator(req) {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `auth:${ipKeyGenerator(req.ip)}:${email}`;
  },
});

// Pickup OTP verification - PATCH /orders/:id/complete.
//
// This is the most brute-forceable surface in the product: a 6-digit code
// (utils/otp.js) that releases a customer's printed documents, checked by a
// handler that returns a different message for a wrong code. Without a
// limit, the shop owner holding the order could walk the whole 000000-999999
// space and complete a pickup the customer never authorised, which defeats
// the single guarantee the OTP exists to provide.
//
// Keyed by order id as well as user, so the budget is per order: a busy shop
// completing many legitimate pickups is unaffected, while attempts against
// any one order run out after 10 wrong guesses in 15 minutes. At that rate
// exhausting a million codes takes about 28 years.
const otpVerifyLimiter = makeLimiter({
  name: "OTP",
  defaults: { windowMs: 15 * 60 * 1000, max: 10 },
  message: "Too many incorrect pickup codes for this order. Please wait before trying again.",
  keyGenerator(req) {
    return `otp:${identityKey(req)}:${req.params.id || "none"}`;
  },
  // Only failures count - the limit protects against guessing, which is by
  // definition a sequence of wrong answers.
  countOnlyFailures: true,
});

// Document upload (POST /upload, shop photos, KYC). Moderate: these are
// multipart requests of up to 10 files x 10MB that each cost a Cloudinary
// round trip and a pdf-parse page count, so they are the most expensive
// thing an authenticated user can ask for. Keyed per user.
const uploadLimiter = makeLimiter({
  name: "UPLOAD",
  defaults: { windowMs: 15 * 60 * 1000, max: 40 },
  message: "Too many uploads in a short time. Please wait a moment before uploading again.",
});

// Order creation and payment calls. Moderate, per user. Sized well above a
// customer placing several orders in a sitting, but low enough that a
// scripted loop cannot create thousands of pending orders (each of which
// holds a queue position and an OTP).
const orderLimiter = makeLimiter({
  name: "ORDER",
  defaults: { windowMs: 15 * 60 * 1000, max: 60 },
  message: "Too many order or payment requests. Please wait a moment and try again.",
});

// General read/write traffic: shop discovery, pricing, notifications, saved
// shops, support chat, the vendor dashboard's own calls. Per user, and
// generous - the dashboard polls, and a customer browsing shops with
// pricing comparisons makes a lot of small calls. This is the backstop that
// stops an unauthenticated address from scraping the shop list, not a
// usage meter.
const generalLimiter = makeLimiter({
  name: "GENERAL",
  defaults: { windowMs: 15 * 60 * 1000, max: 600 },
  message: "Too many requests. Please slow down and try again shortly.",
});

// Admin API. Still limited - an admin token is the most valuable thing on
// the platform, and a limit is what turns a stolen admin token from "export
// the entire database in a minute" into something slow enough to notice -
// but set high, because the panel's list views fan out into several calls
// per page and an admin working through settlements is legitimately busy.
const adminLimiter = makeLimiter({
  name: "ADMIN",
  defaults: { windowMs: 15 * 60 * 1000, max: 1000 },
  message: "Too many admin requests. Please slow down and try again shortly.",
});

// Razorpay's webhook deliveries. Keyed by IP, because Razorpay has no user
// identity - and sized generously for that reason: every confirmation for
// every customer arrives from Razorpay's own small set of addresses, plus
// retries. A limit tuned as if it were one user would throttle real payment
// confirmations on a busy evening, and a dropped confirmation means a
// customer charged for an order that never becomes paid.
//
// Still limited rather than left open: the endpoint is publicly reachable and
// does an HMAC plus a database lookup per request, so an unbounded flood
// should not be free. Signature verification rejects anything unsigned long
// before it reaches an order.
const webhookLimiter = makeLimiter({
  name: "WEBHOOK",
  defaults: { windowMs: 15 * 60 * 1000, max: 2000 },
  message: "Too many webhook deliveries. Please retry shortly.",
  keyGenerator: (req) => `webhook:${ipKeyGenerator(req.ip)}`,
});

module.exports = {
  authLimiter,
  webhookLimiter,
  otpVerifyLimiter,
  uploadLimiter,
  orderLimiter,
  generalLimiter,
  adminLimiter,
  identityKey,
};
