// The one place this application decides what must never leave the process.
//
// Three different third parties now receive data about what happened here -
// Sentry (errors), Microsoft Teams (alerts) and PostHog (product analytics) -
// and all three are outside our trust boundary. A field that is safe to log
// to stdout on our own server is not automatically safe to transmit to a
// vendor's storage, so every outbound payload is filtered through this module
// rather than each integration deciding for itself. Three separate denylists
// would drift, and the first one to drift would be the one that leaked.
//
// THE RULE: redact by default, not by exception.
//
// Keys are matched as substrings, case- and separator-insensitively, so
// "password", "password_hash", "passwordHash" and "newPassword" are all
// caught by the single entry "password". A new field whose name contains any
// denied word is redacted the day it is added, without anyone remembering to
// come back here.

// Key fragments that make a value secret. Deliberately broad: the cost of
// over-redacting a debugging aid is an unexplained REDACTED in a stack trace;
// the cost of under-redacting is a credential sitting in a vendor's database.
const DENY_KEY_FRAGMENTS = [
  // Credentials and authentication
  "password",
  "passwd",
  "pwd",
  "secret",
  "token", // access_token, refresh_token, id_token, push token, csrf token
  "jwt",
  "authorization",
  "bearer",
  "credential",
  "apikey",
  "accesskey",
  "privatekey",
  "signature", // Razorpay payment + webhook signatures
  "hash", // password_hash
  "salt",
  "cookie",
  "sessionid",
  "jti", // names a session that can be revoked
  "dsn", // a Sentry DSN is a write credential
  // The pickup OTP is the single secret proving a customer is at the counter.
  "otp",
  "pickupcode",
  // Documents. The URL is as sensitive as the file: a Cloudinary delivery URL
  // is the document, to anyone who has it.
  "document",
  "fileurl",
  "secureurl",
  "publicid", // Cloudinary handle - enough to construct a delivery URL
  // KYC / identity
  "kyc",
  "aadhaar",
  "aadhar",
  "pannumber",
  "gstnumber",
  "accountnumber",
  "ifsc",
  "upi",
  "bank",
  "payout",
  // Direct personal contact details. Ids are kept (they are useful and
  // meaningless outside this database); the things that identify a human
  // off-platform are not.
  "email",
  "phone",
  "mobile",
  "address",
  "latitude",
  "longitude",
  "location",
];

const REDACTED = "[REDACTED]";

// Normalises a key for matching, so snake_case, camelCase and kebab-case all
// collapse to the same comparable form.
function normaliseKey(key) {
  return String(key).toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Key fragments, pre-normalised once rather than per field.
const DENY_NORMALISED = DENY_KEY_FRAGMENTS.map(normaliseKey);

function isDeniedKey(key) {
  const normalised = normaliseKey(key);
  return DENY_NORMALISED.some((fragment) => normalised.includes(fragment));
}

// Value-shaped detection, for data that arrives under an innocent key.
//
// A denylist of key names only works when the sender names things honestly.
// These catch the cases where it does not: a JWT passed as `t`, a Cloudinary
// URL inside a free-text error message, a raw "Bearer ..." header value.
const VALUE_PATTERNS = [
  // A JWT: three base64url segments. Matched anywhere in the string.
  [/eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}/g, "[JWT_REDACTED]"],
  // An Authorization header value.
  [/Bearer\s+[A-Za-z0-9._~+/=-]{10,}/gi, "Bearer [REDACTED]"],
  // Any Cloudinary URL - a customer's document, a shop photo, a KYC file.
  [/https?:\/\/[^\s"'<>]*cloudinary[^\s"'<>]*/gi, "[DOCUMENT_URL_REDACTED]"],
  // A Cloudinary delivery path, even without the host.
  [/\/(image|raw|video)\/upload\/[^\s"'<>]+/gi, "[DOCUMENT_URL_REDACTED]"],
  // A MongoDB connection string, which carries its own password.
  [/mongodb(\+srv)?:\/\/[^\s"'<>]+/gi, "[MONGODB_URI_REDACTED]"],
  // A Teams / Slack style incoming-webhook URL.
  [/https?:\/\/[^\s"'<>]*(webhook|hooks\.)[^\s"'<>]*/gi, "[WEBHOOK_URL_REDACTED]"],
  // Razorpay, Brevo and Sentry key shapes, in case one reaches a message.
  [/rzp_(live|test)_[A-Za-z0-9]+/g, "[RAZORPAY_KEY_REDACTED]"],
  [/xkeysib-[A-Za-z0-9-]+/g, "[BREVO_KEY_REDACTED]"],
  [/https?:\/\/[0-9a-f]{16,}@[^\s"'<>]*ingest[^\s"'<>]*/gi, "[SENTRY_DSN_REDACTED]"],
];

// Caps. An error object can carry an arbitrarily large body, and shipping a
// 10MB string to Sentry on every failure is its own outage.
const MAX_STRING = 500;
const MAX_DEPTH = 6;
const MAX_ARRAY = 20;
const MAX_KEYS = 50;

function scrubString(value) {
  let out = value;
  for (const [pattern, replacement] of VALUE_PATTERNS) {
    out = out.replace(pattern, replacement);
  }
  if (out.length > MAX_STRING) {
    out = out.slice(0, MAX_STRING) + "...[truncated " + (out.length - MAX_STRING) + " chars]";
  }
  return out;
}

// Recursively redacts a value. Cycle-safe, depth-limited, and never throws -
// a sanitiser that can throw would turn an error report into a second error.
function scrub(value, depth = 0, seen = new WeakSet()) {
  try {
    if (value === null || value === undefined) return value;

    const type = typeof value;
    if (type === "string") return scrubString(value);
    if (type === "number" || type === "boolean") return value;
    if (type === "bigint") return String(value);
    if (type === "function" || type === "symbol") return "[" + type + "]";

    if (depth >= MAX_DEPTH) return "[MAX_DEPTH]";

    // A Buffer is almost always a raw body or a file; its size is the only
    // part worth reporting.
    if (Buffer.isBuffer(value)) return "[Buffer " + value.length + " bytes]";
    if (value instanceof Date) return value.toISOString();
    if (value instanceof Error) {
      return { name: value.name, message: scrubString(value.message || "") };
    }

    if (seen.has(value)) return "[Circular]";
    seen.add(value);

    if (Array.isArray(value)) {
      const items = value.slice(0, MAX_ARRAY).map((item) => scrub(item, depth + 1, seen));
      if (value.length > MAX_ARRAY) items.push("...[" + (value.length - MAX_ARRAY) + " more]");
      return items;
    }

    if (type === "object") {
      // A Mongoose document would otherwise serialise its entire internal
      // state. Reduce it to the plain object first.
      const source = typeof value.toObject === "function" ? value.toObject() : value;
      const out = {};
      let count = 0;
      const keys = Object.keys(source);
      for (const key of keys) {
        if (count >= MAX_KEYS) {
          out["..."] = "[" + (keys.length - MAX_KEYS) + " more keys]";
          break;
        }
        count += 1;
        out[key] = isDeniedKey(key) ? REDACTED : scrub(source[key], depth + 1, seen);
      }
      return out;
    }

    return "[unknown]";
  } catch {
    return "[UNSERIALISABLE]";
  }
}

// Request headers, by ALLOWLIST rather than denylist.
//
// Headers are the one place an allowlist is both practical and clearly
// correct: the set worth having is small and known, while the set that must
// never be sent includes Authorization, Cookie and anything a proxy chose to
// add. With a denylist, a new header added by a future CDN would be forwarded
// by default; with this, it is dropped by default.
const HEADER_ALLOWLIST = [
  "content-type",
  "content-length",
  "user-agent",
  "accept",
  "accept-language",
  "x-razorpay-event-id", // names a webhook delivery; not a secret
];

function scrubHeaders(headers) {
  if (!headers || typeof headers !== "object") return {};
  const out = {};
  for (const name of HEADER_ALLOWLIST) {
    const value = headers[name];
    if (typeof value === "string") out[name] = scrubString(value);
  }
  // Record that credentials were present without recording them. Knowing a
  // failing request was authenticated is useful; the token is not.
  if (headers.authorization) out.authorization = "[PRESENT]";
  if (headers.cookie) out.cookie = "[PRESENT]";
  if (headers["x-razorpay-signature"]) out["x-razorpay-signature"] = "[PRESENT]";
  return out;
}

// A URL with every query-string VALUE removed but its parameter names kept.
// "?token=abc&page=2" becomes "?token=[REDACTED]&page=[REDACTED]": knowing
// which parameters were supplied helps diagnose a 400, and no value is worth
// the risk of guessing which ones are safe.
function scrubUrl(url) {
  if (typeof url !== "string") return "";
  const parts = url.split("?");
  const path = parts[0];
  const query = parts[1];
  if (!query) return scrubString(path);
  const names = query
    .split("&")
    .map((pair) => pair.split("=")[0])
    .filter(Boolean)
    .map((name) => name + "=" + REDACTED);
  return scrubString(path) + "?" + names.join("&");
}

// The only user shape that may be attached to an outbound event.
//
// Id and role, nothing else. The id is what makes a report actionable - it
// answers "which account hit this" and can be looked up by someone with
// legitimate database access - while carrying no meaning to anyone who
// obtains it from a third-party dashboard. Name, email and phone would make
// Sentry and PostHog into copies of the user table.
function safeUser(user) {
  if (!user || typeof user !== "object") return null;
  const id = user.id || user._id;
  if (!id) return null;
  const out = { id: String(id) };
  if (typeof user.role === "string") out.role = user.role;
  return out;
}

// The safe description of an Express request, for attaching to an error.
function safeRequest(req) {
  if (!req || typeof req !== "object") return null;
  return {
    method: req.method,
    // The matched route pattern ("/orders/:id") when Express has resolved
    // one, which groups errors correctly instead of producing a separate
    // issue per order id.
    route: (req.route && req.route.path) || req.baseUrl || undefined,
    url: scrubUrl(req.originalUrl || req.url || ""),
    headers: scrubHeaders(req.headers),
    // Bodies go through the same recursive scrub as everything else. Not
    // omitted entirely because the shape of a rejected payload is often the
    // whole diagnosis, and every sensitive key within it is redacted.
    body: req.body && typeof req.body === "object" ? scrub(req.body) : undefined,
    query: req.query && typeof req.query === "object" ? scrub(req.query) : undefined,
    user: safeUser(req.user),
  };
}

module.exports = {
  scrub,
  scrubString,
  scrubHeaders,
  scrubUrl,
  safeUser,
  safeRequest,
  isDeniedKey,
  REDACTED,
  DENY_KEY_FRAGMENTS,
  HEADER_ALLOWLIST,
};
