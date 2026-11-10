const jwt = require("jsonwebtoken");
const Session = require("../models/Session");
const User = require("../models/User");
const { alertP0, ALERT } = require("../utils/alerts");

// The signature/expiry half of authentication, with no database access.
//
// Kept separate because two callers genuinely want only this much: the rate
// limiters (middleware/rateLimit.js), which need a stable identity to bucket
// a request against and must not perform a database read on every request to
// get one, and authenticateToken below, which builds on it.
//
// Returns the decoded payload, or null for a missing, malformed, tampered or
// expired token. It never throws: every caller treats all of those the same
// way, so telling them apart would only invite one of them to get it wrong.
const decodeAuthToken = (token) => {
  if (!token || typeof token !== "string") return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

// Full authentication, and the ONLY place revocation is decided. Both the
// Express middleware below and the Socket.io handshake (config/socket.js)
// call this, so a token that cannot open a REST request cannot open a
// websocket either - without that, signing out would close one door and
// leave the other standing open.
//
// In order:
//   1. verify the signature          (decodeAuthToken)
//   2. verify expiry                 (decodeAuthToken, via jwt.verify)
//   3. validate the required claims  (id and a known role must be present)
//   4. check revocation state        (the session record, or the password
//                                     timestamp for a pre-jti token)
//   5. return the identity
//
// Returns the identity and expiry, or null. The caller turns null into whatever
// rejection suits it; this function does not distinguish "revoked" from
// "never existed" from "signature failed", because a client has no business
// learning which.
const ROLES = ["customer", "shop_owner", "admin"];

async function authenticateToken(token) {
  const decoded = decodeAuthToken(token);
  if (!decoded) return null;

  // A valid signature over a payload missing its claims is still unusable -
  // and without this check a token carrying no role would reach requireRole
  // and be compared against undefined.
  if (!decoded.id || typeof decoded.role !== "string" || !ROLES.includes(decoded.role)) {
    return null;
  }

  if (decoded.jti) {
    // Primary-key lookup: the jti IS the session's _id.
    const session = await Session.findById(decoded.jti).select("revoked_at user_id").lean();

    // No record means the session was never created or has already been
    // removed by the TTL index. Either way there is nothing to authenticate
    // against, so this fails closed.
    if (!session || session.revoked_at) return null;

    // The session must belong to the user the token claims to be. These can
    // only disagree if a token were forged with our signing key, in which
    // case everything is already lost - but the check costs nothing and the
    // lookup is right here.
    if (String(session.user_id) !== String(decoded.id)) return null;

    return { id: String(decoded.id), role: decoded.role, jti: decoded.jti, exp: decoded.exp };
  }

  // ---- Tokens issued before revocation existed ----
  //
  // These carry no jti, so there is no session record to consult. They are
  // accepted until their own exp passes, deliberately: invalidating every
  // token already in the field would have signed out every real user at
  // deploy time to fix a problem none of them caused.
  //
  // They are not, however, beyond reach. A password change stamps
  // password_changed_at on the user, and any token issued before that moment
  // is refused here - so the one action that must be able to cut off existing
  // sessions still can, jti or not. The window closes by itself as these
  // tokens reach their seven-day expiry.
  const user = await User.findById(decoded.id).select("password_changed_at role").lean();
  // The user has been deleted, so a signature-valid token for them is not an
  // identity any more.
  if (!user) return null;

  if (user.password_changed_at) {
    // iat is in seconds; Date.getTime is in milliseconds.
    const issuedAtMs = (decoded.iat || 0) * 1000;
    if (issuedAtMs < new Date(user.password_changed_at).getTime()) return null;
  }

  return { id: String(decoded.id), role: decoded.role, jti: null, exp: decoded.exp };
}

// Verifies the JWT sent in the Authorization header ("Bearer <token>") and
// attaches the authenticated identity to req.user.
//
// Async now, because step 4 above reads the database. Express 4 does not
// catch a rejected promise from middleware, so the whole body sits in
// try/catch - without it, a database blip during authentication would hang
// the request instead of answering it.
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token provided" });
  }

  try {
    const identity = await authenticateToken(authHeader.slice(7));
    if (!identity) {
      // The same message a tampered or expired token has always produced. A
      // revoked token is not called out separately on purpose: "this token
      // was revoked" confirms the token was real and known to us, which is
      // more than a caller holding a stolen token should be told.
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    req.user = identity; // { id, role, jti }
    next();
  } catch (error) {
    // Fail closed. An error here means the revocation state is unknown, and
    // treating unknown as valid would make a database outage into an
    // authentication bypass.
    console.error(`[auth] token verification failed: ${error.message}`);

    // P0. Failing closed is correct, and it is also total: every
    // authenticated route in the product is now answering 503, so nobody can
    // place an order, view a document or run the dashboard. This is
    // indistinguishable from a full outage to every user, and it is almost
    // always MongoDB - the session lookup is the only database call in the
    // authentication path.
    //
    // Deliberately not awaited. This runs inside request-handling middleware,
    // and an alert is already deduplicated, so holding the 503 open to wait
    // for a Teams POST would add latency to every single failing request.
    alertP0({
      reason: ALERT.AUTH_SYSTEM_FAILURE,
      title: "Authentication is failing for everyone",
      summary:
        "Token verification threw, so the authentication middleware is failing closed and returning " +
        "503 on every authenticated route. No user can sign in or use the app. The session lookup is " +
        "the only database call in this path, so check MongoDB availability first - /health/ready will " +
        "confirm.",
      error,
    });

    res.status(503).json({ message: "Could not verify your session. Please try again." });
  }
};

// Restricts a route to specific roles, e.g. requireRole("shop_owner").
// Must be used after verifyToken so req.user is available.
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Access denied for this role" });
    }
    next();
  };
};

module.exports = { verifyToken, requireRole, decodeAuthToken, authenticateToken };
