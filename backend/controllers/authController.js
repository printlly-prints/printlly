const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Session = require("../models/Session");
const { createCode, consumeCode } = require("../utils/oauthCodeStore");
const { validatePassword } = require("../utils/passwordPolicy");
const { sendTransactionalEmail } = require("../utils/email");
const { trackEvent, EVENTS } = require("../utils/analytics");
const { publicUser, validateProfileDetails } = require("../utils/profileDetails");

const TOKEN_TTL_DAYS = 7;
// Unchanged from what every existing hash in the database was created with
// ($2a$10$ across all six of them). Raising the cost would not re-hash
// anything already stored - bcrypt reads the cost back out of each hash when
// verifying - so old passwords would keep working either way; it is left
// alone because changing it is a performance decision with no bearing on
// revocation, which is what this task is about.
const BCRYPT_ROUNDS = 10;

// Issues a JWT and records the session that makes it revocable.
//
// The jti is 32 bytes from crypto.randomBytes - a cryptographically secure
// generator, not Math.random - hex-encoded. It is the session record's _id,
// so the token and the record are tied together by construction.
//
// Async now, where the old generateToken was synchronous: a token cannot be
// handed out before the record that authorises it exists, or a race would
// let a brand-new token be rejected by middleware/auth.js for having no
// session. The write happens first for that reason.
//
// The PAYLOAD is deliberately still just { id, role } plus jti and the
// standard iat/exp. No name, no email, no phone, and above all no
// password_hash: a JWT is signed but not encrypted, so anything in here is
// readable by anyone holding the token. The user's details already travel in
// the response body beside the token, where they belong.
const issueToken = async (user) => {
  const jti = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await Session.create({
    _id: jti,
    user_id: user._id,
    expires_at: expiresAt,
  });

  return jwt.sign({ id: user._id, role: user.role, jti }, process.env.JWT_SECRET, {
    expiresIn: `${TOKEN_TTL_DAYS}d`,
  });
};

// Revokes every live session belonging to one user. Used by the password
// change below; kept as its own function so that the "sign out everywhere"
// rule lives in one place if another caller ever needs it.
//
// Marks rather than deletes, so the records remain visible to an operator
// until the TTL index clears them, and so revoking twice is harmless.
const revokeAllSessionsForUser = async (userId, reason) => {
  const result = await Session.updateMany(
    { user_id: userId, revoked_at: null },
    { $set: { revoked_at: new Date(), revoked_reason: reason } }
  );
  return result.modifiedCount || 0;
};

// Names the field that actually clashed, rather than making someone
// guess which of the two it was - they may well have forgotten an old
// account under one of them. Deliberately says only "another account",
// never which one or whose: whether a given email or number is
// registered here is not something an unauthenticated caller should be
// able to enumerate any more precisely than this.
function duplicateMessage(existing, { email, phone }) {
  const emailClash = existing.email === String(email || "").trim().toLowerCase();
  const phoneClash = existing.phone === String(phone || "").trim();
  if (emailClash && phoneClash) {
    return "This email address and phone number are already registered to another account";
  }
  if (phoneClash) {
    return "This phone number is already registered to another account";
  }
  return "This email address is already registered to another account";
}

// POST /auth/register
// Creates a new user (customer or shop_owner) with a hashed password.
const register = async (req, res) => {
  try {
    const { name, phone, email, password, role } = req.body;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const profile = validateProfileDetails(req.body, { allowOtherFields: true });
    if (profile.error) return res.status(400).json({ message: profile.error });

    // Checked before the duplicate lookup and before bcrypt: a password that
    // will be refused should not cost a database round trip or a hash.
    const policy = validatePassword(password);
    if (!policy.valid) {
      return res.status(400).json({ message: policy.message });
    }

    // Both are unique across EVERY account, regardless of role - one
    // phone number and one email address belong to one person, whether
    // they signed up as a customer or a shop owner. Mongoose casts this
    // filter through the schema (email lowercased, phone trimmed) exactly
    // as it does on save, so "SAME@X.com" and " 99999 " are caught here
    // and not left to the unique index below.
    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(409).json({ message: duplicateMessage(existingUser, { email, phone }) });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const password_hash = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      phone,
      email,
      password_hash,
      role: role === "shop_owner" ? "shop_owner" : "customer",
      ...profile.updates,
    });

    const token = await issueToken(user);

    // Responded to FIRST, then notified. Both calls below are deliberately
    // after the response is sent, because neither is part of registering:
    // the account exists and is usable the moment User.create resolved, and
    // making the customer wait on Brevo - or fail if Brevo is down - would
    // put a third party in the signup path.
    res.status(201).json({ token, user: publicUser(user) });

    // A welcome email for print partners only. A customer gets nothing: they
    // signed up to place an order and will receive the order confirmation in
    // a few minutes, and a welcome email in between is noise. A vendor, by
    // contrast, has several steps left before they can trade - shop details,
    // pricing, verification documents - and the email is where that is
    // explained.
    if (user.role === "shop_owner") {
      sendTransactionalEmail({
        event: "vendor_welcome",
        userId: user._id,
        params: { vendorName: user.name },
        dedupeId: String(user._id),
      });
    }

    trackEvent({
      event: EVENTS.SIGNUP_COMPLETED,
      userId: user._id,
      properties: { role: user.role, auth_provider: "local", source: "backend" },
    });
  } catch (error) {
    // The findOne above is not a lock: two registrations for the same
    // email or phone arriving together both pass it, and whichever loses
    // the race hits the unique index instead. That is the index doing its
    // job - the duplicate was never written - so it is a 409, not the
    // "Registration failed" 500 this used to return.
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0];
      return res.status(409).json({
        message:
          field === "phone"
            ? "This phone number is already registered to another account"
            : field === "email"
              ? "This email address is already registered to another account"
              : "User with this email or phone already exists",
      });
    }
    console.error(`Registration failed: ${error.message}`);
    res.status(500).json({ message: "Registration failed" });
  }
};

// POST /auth/login
// Verifies email + password, returns a JWT on success.
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // A Google-created account has no password_hash (config/passport.js), and
    // bcrypt.compare against undefined throws. Same generic message as a
    // wrong password, so this does not reveal which accounts use Google.
    if (!user.password_hash) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = await issueToken(user);

    res.status(200).json({ token, user: publicUser(user) });

    // Vendor sign-ins only, because that is the one the product has a
    // question about: whether partners come back to the dashboard. Customer
    // logins are not tracked here - app_opened is emitted by the app itself
    // and is the more meaningful customer-engagement signal, since a
    // customer stays signed in for months and rarely sees a login screen.
    if (user.role === "shop_owner") {
      trackEvent({
        event: EVENTS.VENDOR_LOGIN,
        userId: user._id,
        properties: { role: user.role, auth_provider: user.auth_provider || "local", source: "backend" },
      });
    }
  } catch (error) {
    console.error(`Login failed: ${error.message}`);
    res.status(500).json({ message: "Login failed" });
  }
};

// GET /auth/google/callback (handler run after passport's Google strategy
// succeeds - see routes/authRoutes.js for the passport.authenticate call).
// req.user is the User document resolved by config/passport.js's verify
// callback (find-or-create by google_id, then email).
//
// The JWT is not put directly in the redirect URL - instead we stash it
// behind a short-lived one-time code and send the browser only that code,
// so the token never ends up in browser history or server access logs.
const googleCallback = async (req, res) => {
  const user = req.user;
  const token = await issueToken(user);

  const code = createCode({ token, user: publicUser(user) });

  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  res.redirect(`${frontendUrl}/auth/callback?code=${code}`);
};

// POST /auth/exchange-code
// The shop owner dashboard calls this immediately after landing on
// /auth/callback?code=... to trade that one-time code for the real JWT.
// The code is deleted on first use and expires after 60 seconds either way.
const exchangeCode = (req, res) => {
  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ message: "code is required" });
  }

  const payload = consumeCode(code);
  if (!payload) {
    return res.status(400).json({ message: "Invalid or expired code" });
  }

  res.status(200).json(payload);
};

// POST /auth/logout  (authenticated)
// Revokes the session this request authenticated with, and nothing else.
//
// Signing out of a phone must not sign the same person out of the shop
// counter's browser, so this touches exactly one session. Revoking every
// session on logout would be a different product behaviour, and not one this
// app has ever had.
//
// Idempotent: logging out with an already-revoked token cannot reach here,
// because verifyToken rejects it first, and a token with no jti simply has
// no session to revoke.
const logout = async (req, res) => {
  try {
    if (req.user.jti) {
      await Session.updateOne(
        { _id: req.user.jti, revoked_at: null },
        { $set: { revoked_at: new Date(), revoked_reason: "logout" } }
      );
    }

    // Always 200, whether or not a record was modified. A caller learns only
    // that they are signed out - which is true either way - and never
    // whether their token was one we had a record of.
    res.status(200).json({ message: "Signed out" });
  } catch (error) {
    console.error(`Logout failed: ${error.message}`);
    res.status(500).json({ message: "Could not sign out" });
  }
};

// POST /auth/change-password  (authenticated)
// Body: { current_password, new_password }
//
// SESSION POLICY, stated plainly because it is a choice and not a default:
// changing a password revokes EVERY session for that user, including the one
// that made this request, and the response carries a fresh token so the
// caller stays signed in. The reason is that the main reason anyone changes a
// password is that they think someone else has it - and a change that left
// the intruder's session running would do nothing about the thing that
// prompted it.
//
// password_changed_at is stamped in the same operation, which is what also
// invalidates any older token that has no jti (see middleware/auth.js).
const changePassword = async (req, res) => {
  try {
    const { current_password, new_password } = req.body || {};

    if (!current_password || !new_password) {
      return res
        .status(400)
        .json({ message: "current_password and new_password are required" });
    }

    const user = await User.findById(req.user.id).select("password_hash role name");
    if (!user) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    // Google accounts never set a password here, so there is nothing to
    // change and no current password to confirm against.
    if (!user.password_hash) {
      return res.status(400).json({
        message: "This account signs in with Google and has no password to change",
      });
    }

    const currentMatches = await bcrypt.compare(current_password, user.password_hash);
    if (!currentMatches) {
      // Confirming the current password is what stops a stolen token from
      // being upgraded into a permanent takeover.
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const policy = validatePassword(new_password);
    if (!policy.valid) {
      return res.status(400).json({ message: policy.message });
    }

    if (new_password === current_password) {
      return res
        .status(400)
        .json({ message: "New password must be different from the current one" });
    }

    const changedAt = new Date();
    user.password_hash = await bcrypt.hash(new_password, await bcrypt.genSalt(BCRYPT_ROUNDS));
    user.password_changed_at = changedAt;
    await user.save();

    // Everything first, including this request's own session...
    const revoked = await revokeAllSessionsForUser(user._id, "password_change");
    // ...then a new session, so the device that just changed the password is
    // not the one locked out by it.
    const token = await issueToken(user);

    res.status(200).json({
      message: "Password changed. Other devices have been signed out.",
      sessions_revoked: revoked,
      token,
    });

    // A security notification, sent after the response for the same reason as
    // the registration email - the password is already changed and the
    // sessions already revoked.
    //
    // This is the email that makes an account takeover visible. Someone who
    // has stolen a session and changed the password has locked the real owner
    // out silently; this is the one message that still reaches them, because
    // it goes to the address on the account rather than to whoever is holding
    // the session. It is the reason this email exists even though there is no
    // password-reset flow to support.
    //
    // dedupeId is the change timestamp, not the user id: a second genuine
    // password change must send a second email, and keying on the user would
    // suppress it forever after the first.
    sendTransactionalEmail({
      event: "password_changed",
      userId: user._id,
      params: { customerName: user.name || "there" },
      dedupeId: String(user._id) + ":" + changedAt.getTime(),
    });
  } catch (error) {
    // Note what is NOT in here: the message carries no password material, and
    // neither does any log line in this file. A password only ever reaches
    // bcrypt.
    console.error(`Password change failed for user ${req.user?.id}: ${error.message}`);
    res.status(500).json({ message: "Could not change password" });
  }
};

module.exports = {
  register,
  login,
  issueToken,
  revokeAllSessionsForUser,
  googleCallback,
  exchangeCode,
  logout,
  changePassword,
};
