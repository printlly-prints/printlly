const crypto = require("crypto");

// In-memory, single-use handoff for the Google OAuth redirect.
//
// The JWT itself is never put in the redirect URL (that would leak it into
// browser history, server access logs, etc). Instead GET /auth/google/callback
// stashes { token, user } here behind a random code and redirects with just
// that code; POST /auth/exchange-code trades the code for the real payload.
//
// KNOWN LIMITATION: this is a plain in-memory Map, so it only works with a
// single server process and does not survive a restart. Fine for a college
// project; a real multi-instance deployment would use Redis or a
// TTL-indexed Mongo collection instead.
const CODE_TTL_MS = 60 * 1000;
const codes = new Map();

// Stores payload behind a fresh random code, auto-expiring after 60s.
function createCode(payload) {
  const code = crypto.randomBytes(32).toString("hex");
  const timer = setTimeout(() => codes.delete(code), CODE_TTL_MS);
  timer.unref?.(); // don't keep the process alive just for this timer
  codes.set(code, { payload, timer });
  return code;
}

// Looks up and immediately deletes the code, so it can only ever be
// exchanged once. Returns null if the code is unknown or already expired.
function consumeCode(code) {
  const entry = codes.get(code);
  if (!entry) return null;
  clearTimeout(entry.timer);
  codes.delete(code);
  return entry.payload;
}

module.exports = { createCode, consumeCode };
