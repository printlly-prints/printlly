const mongoose = require("mongoose");

// One record per issued JWT, which is what makes a token revocable.
//
// WHY A RECORD AT ALL
//
// A JWT is, by design, a thing the server can verify without asking anyone -
// which also means that on its own it cannot be taken back. Signing out
// previously only deleted the token from localStorage (vendor-website/src/context/
// AuthContext.jsx); the token itself stayed valid for the rest of its seven
// days, so anyone who had copied it kept access. Shortening the expiry would
// have narrowed that window without closing it, which is why this is a
// record and not a smaller number.
//
// WHAT IS STORED, AND WHAT IS NOT
//
// The _id IS the token's jti - the random identifier carried in the JWT - so
// the lookup is a primary-key hit and there is no second index to maintain.
//
// The raw JWT is NOT stored. It never needs to be: the signature proves the
// token is ours, and the jti is enough to decide whether it is still live.
// Storing bearer tokens would turn this collection into a set of working
// credentials, so that a database leak became an account takeover rather
// than a disclosure of which sessions existed.
//
// No IP address, no user agent, no device name. None of it is needed to
// revoke a session, and each would be personal information retained for no
// purpose. If a "your active sessions" screen is ever built, that is the
// point to decide what is worth collecting - not before.
const sessionSchema = new mongoose.Schema(
  {
    // The jti claim from the JWT: 32 random bytes from crypto.randomBytes,
    // hex-encoded. Used as the primary key, so a duplicate is impossible by
    // construction rather than by a uniqueness check.
    _id: {
      type: String,
      required: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      // Indexed for the revoke-all path: a password change has to reach
      // every session belonging to one user in a single update.
      index: true,
    },
    // Mirrors the JWT's own exp. Drives the TTL index below, so a session
      // record never outlives the token it describes.
    expires_at: {
      type: Date,
      required: true,
    },
    // Null while the session is live. Set - never deleted - when the session
    // is revoked, so that an operator can tell "signed out" from "expired"
    // while the record lasts. A client cannot tell the difference: both
    // produce the same 401 (see middleware/auth.js).
    revoked_at: {
      type: Date,
      default: null,
    },
    // Why the session ended, for operational visibility only. Never returned
    // to a client.
    revoked_reason: {
      type: String,
      enum: ["logout", "password_change", null],
      default: null,
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: false },
    // No __v. The version key exists to detect concurrent edits to arrays in
    // a document, and this schema has no arrays and no field that is ever
    // edited twice - a session is created once and revoked once. Storing it
    // would be one more byte per session for nothing.
    versionKey: false,
  }
);

// MongoDB deletes each record once expires_at passes, so this collection
// stays roughly the size of the number of live sessions instead of growing
// forever. expireAfterSeconds: 0 means "expire AT the date in this field"
// rather than that many seconds after it.
//
// This is why there is no cleanup cron: the database already does it, and a
// job that duplicated it would be one more thing to run and get wrong.
//
// Worth knowing about the timing: the TTL monitor runs about once a minute,
// so a record can outlive expires_at briefly. That is harmless here -
// authentication rejects the token on its own exp before ever consulting
// this record, so a late deletion can never extend a session.
sessionSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Session", sessionSchema);
