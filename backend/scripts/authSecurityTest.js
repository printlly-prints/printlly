// Tests the password policy and JWT revocation.
//
// Runs against the REAL running server and the REAL database, because what
// is under test is the end-to-end behaviour of a bearer token: a unit test of
// the middleware could not show that logging out on one device leaves another
// working, which is the whole point of the design.
//
// Every account it creates is prefixed authtest. and carries this run's
// stamp, and it deletes all of them - plus their sessions - on the way out,
// including when an assertion fails. It never touches an existing user.
//
// PRODUCTION SAFETY: this script only reads or writes users it created
// itself. It performs no migration and revokes nothing belonging to anyone
// else.
//
// Needs the server running on PORT (default 5000).
//
// Run with: node scripts/authSecurityTest.js
require("dotenv").config();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { io: ioClient } = require("socket.io-client");

const User = require("../models/User");
const Session = require("../models/Session");
const {
  validatePassword,
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_BYTES,
} = require("../utils/passwordPolicy");
const { authenticateToken } = require("../middleware/auth");

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const STAMP = Date.now().toString(36);
const GOOD_PASSWORD = "CorrectHorseBattery7";
const NEW_PASSWORD = "AnotherLongPassphrase9";

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};
const section = (title) => console.log(`\n--- ${title} ---`);

const createdUserIds = [];
let phoneCounter = 0;

async function api(method, path, { body, token } = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

const uniquePhone = () => `8${String(Date.now()).slice(-6)}${String(phoneCounter++).padStart(3, "0")}`;

async function registerUser(label, password = GOOD_PASSWORD) {
  const email = `authtest.${label}.${STAMP}@example.com`;
  const res = await api("POST", "/auth/register", {
    body: { name: `Auth Test ${label}`, phone: uniquePhone(), email, password, role: "customer" },
  });
  if (res.status !== 201) {
    throw new Error(`could not register ${label}: ${res.status} ${JSON.stringify(res.data)}`);
  }
  createdUserIds.push(res.data.user.id);
  return { email, password, token: res.data.token, userId: res.data.user.id };
}

const loginAs = (email, password) => api("POST", "/auth/login", { body: { email, password } });

// An authenticated endpoint that every role can reach and that changes
// nothing, so it can be called as often as the tests like.
const callAuthenticated = (token) => api("GET", "/notifications", { token });

function connectSocket(token) {
  return new Promise((resolve) => {
    const client = ioClient(BASE_URL, {
      auth: token ? { token } : {},
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });
    const done = (result) => {
      client.close();
      resolve(result);
    };
    client.on("connect", () => done({ connected: true }));
    client.on("connect_error", (error) => done({ connected: false, error: error.message }));
  });
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);

  const health = await fetch(BASE_URL + "/").catch(() => null);
  if (!health || !health.ok) {
    throw new Error(`server is not responding at ${BASE_URL} - start it before running this`);
  }

  // =========================================================================
  section("Password policy (the shared validator)");
  // =========================================================================

  const reject = (password, label, detail) => {
    const result = validatePassword(password);
    check(result.valid === false, label, detail || result.message);
  };
  const accept = (password, label) => {
    const result = validatePassword(password);
    check(result.valid === true, label, result.valid ? "accepted" : result.message);
  };

  reject("", "an empty password is rejected");
  reject("   ", "a whitespace-only password is rejected");
  reject("\t\n ", "tabs and newlines alone are rejected");
  reject(undefined, "a missing password is rejected");
  reject(null, "a null password is rejected");
  reject(12345678901, "a non-string password is rejected");
  reject("a".repeat(MIN_PASSWORD_LENGTH - 1), `${MIN_PASSWORD_LENGTH - 1} characters is too short`);
  accept("a".repeat(MIN_PASSWORD_LENGTH));
  check(
    validatePassword("a".repeat(MIN_PASSWORD_LENGTH)).valid === true,
    `exactly ${MIN_PASSWORD_LENGTH} characters is accepted (the minimum boundary)`
  );
  reject(` ${GOOD_PASSWORD}`, "a leading space is rejected rather than silently trimmed");
  reject(`${GOOD_PASSWORD} `, "a trailing space is rejected rather than silently trimmed");
  accept("two words with spaces inside", "internal spaces are fine - passphrases are the point");

  // The bcrypt boundary. This is the assertion that stops a password being
  // silently truncated at 72 bytes.
  check(
    validatePassword("a".repeat(MAX_PASSWORD_BYTES)).valid === true,
    `exactly ${MAX_PASSWORD_BYTES} bytes is accepted (bcrypt's own limit, the maximum boundary)`
  );
  reject("a".repeat(MAX_PASSWORD_BYTES + 1), `${MAX_PASSWORD_BYTES + 1} bytes is rejected`);
  reject("a".repeat(10000), "a 10,000-character password is rejected before it can reach bcrypt");
  // 30 four-byte emoji = 120 bytes but only 30 characters, so a character
  // count would have let this through to be truncated.
  const emoji = "\u{1F600}".repeat(30);
  check(
    emoji.length < MAX_PASSWORD_BYTES && validatePassword(emoji).valid === false,
    "a 30-character multibyte password over 72 BYTES is rejected (the limit is bytes, not characters)",
    `${emoji.length} chars / ${Buffer.byteLength(emoji, "utf8")} bytes`
  );

  accept(
    "this is a long memorable passphrase about printing documents",
    "a long all-lowercase passphrase is accepted - no composition rules"
  );
  check(
    validatePassword("alllowercaseletters").valid === true &&
      validatePassword("Passw0rd!!").valid === true,
    "neither case, digits nor symbols are required (length is what is enforced)"
  );

  // =========================================================================
  section("Password policy over HTTP");
  // =========================================================================

  const weakEmail = `authtest.weak.${STAMP}@example.com`;
  const weakReg = await api("POST", "/auth/register", {
    body: { name: "Auth Test Weak", phone: uniquePhone(), email: weakEmail, password: "short", role: "customer" },
  });
  check(weakReg.status === 400, "registration with a weak password is refused", `${weakReg.status} ${weakReg.data?.message}`);
  check(
    (await User.countDocuments({ email: weakEmail })) === 0,
    "...and no user row was created by the attempt"
  );

  const spaceReg = await api("POST", "/auth/register", {
    body: { name: "Auth Test Space", phone: uniquePhone(), email: `authtest.space.${STAMP}@example.com`, password: "    ", role: "customer" },
  });
  check(spaceReg.status === 400, "registration with a whitespace-only password is refused", String(spaceReg.status));

  const hugeReg = await api("POST", "/auth/register", {
    body: { name: "Auth Test Huge", phone: uniquePhone(), email: `authtest.huge.${STAMP}@example.com`, password: "a".repeat(5000), role: "customer" },
  });
  check(hugeReg.status === 400, "registration with an oversized password is refused (no hashing performed)", String(hugeReg.status));

  const alice = await registerUser("alice");
  check(Boolean(alice.token), "registration with a valid password succeeds and returns a token");
  check(
    alice.token && !JSON.stringify(await api("POST", "/auth/login", { body: { email: alice.email, password: GOOD_PASSWORD } })).includes(GOOD_PASSWORD),
    "a login response does not echo the password back"
  );

  const regBody = await api("POST", "/auth/register", {
    body: { name: "Auth Test Echo", phone: uniquePhone(), email: `authtest.echo.${STAMP}@example.com`, password: GOOD_PASSWORD, role: "customer" },
  });
  if (regBody.status === 201) createdUserIds.push(regBody.data.user.id);
  const regJson = JSON.stringify(regBody.data);
  check(!regJson.includes(GOOD_PASSWORD), "a registration response contains no password");
  check(!regJson.includes("password_hash") && !regJson.includes("$2a$"), "a registration response contains no password hash", Object.keys(regBody.data?.user || {}).join(","));

  // =========================================================================
  section("JWT verification");
  // =========================================================================

  const valid = await callAuthenticated(alice.token);
  check(valid.status === 200, "a valid token is accepted", String(valid.status));

  const noToken = await callAuthenticated(undefined);
  check(noToken.status === 401, "a missing token is rejected", String(noToken.status));

  const malformed = await callAuthenticated("not.a.jwt");
  check(malformed.status === 401, "a malformed token is rejected", String(malformed.status));

  const wrongSig = jwt.sign({ id: alice.userId, role: "customer" }, "a-different-signing-secret");
  check((await callAuthenticated(wrongSig)).status === 401, "a token signed with the wrong secret is rejected");

  const expired = jwt.sign({ id: alice.userId, role: "customer", jti: "irrelevant" }, process.env.JWT_SECRET, {
    expiresIn: "-10s",
  });
  check((await callAuthenticated(expired)).status === 401, "an expired token is rejected even though it was never explicitly revoked");

  const noRole = jwt.sign({ id: alice.userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
  check((await callAuthenticated(noRole)).status === 401, "a token with no role claim is rejected");

  const noId = jwt.sign({ role: "customer" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  check((await callAuthenticated(noId)).status === 401, "a token with no id claim is rejected");

  const badRole = jwt.sign({ id: alice.userId, role: "superuser" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  check((await callAuthenticated(badRole)).status === 401, "a token with a role outside the known set is rejected");

  const ghostSession = jwt.sign(
    { id: alice.userId, role: "customer", jti: "0".repeat(64) },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  check(
    (await callAuthenticated(ghostSession)).status === 401,
    "a well-formed token whose jti has no session record is rejected (fails closed)"
  );

  // =========================================================================
  section("JWT payload contents");
  // =========================================================================

  const payload = jwt.decode(alice.token);
  check(
    JSON.stringify(Object.keys(payload).sort()) === JSON.stringify(["exp", "iat", "id", "jti", "role"]),
    "the payload carries only id, role, jti and the standard iat/exp",
    Object.keys(payload).sort().join(",")
  );
  for (const forbidden of ["password", "password_hash", "email", "phone", "name", "google_id"]) {
    check(!(forbidden in payload), `the payload does not contain "${forbidden}"`);
  }
  check(
    typeof payload.jti === "string" && /^[0-9a-f]{64}$/.test(payload.jti),
    "the jti is 32 bytes of hex from a cryptographic source",
    `${payload.jti.length} hex chars`
  );
  check(
    jwt.decode(alice.token, { complete: true }).header.alg === "HS256",
    "the signing algorithm is unchanged (HS256), so tokens issued before this change still verify",
    jwt.decode(alice.token, { complete: true }).header.alg
  );
  check(
    payload.exp - payload.iat === 7 * 24 * 60 * 60,
    "the 7-day expiry is unchanged - revocation was added instead of shortening the window",
    `${(payload.exp - payload.iat) / 86400} days`
  );

  // =========================================================================
  section("Multi-session revocation (logout)");
  // =========================================================================

  // Three sessions for one account, as three devices would produce.
  const sessionA = alice.token;
  const sessionB = (await loginAs(alice.email, GOOD_PASSWORD)).data.token;
  const sessionC = (await loginAs(alice.email, GOOD_PASSWORD)).data.token;

  check(
    new Set([sessionA, sessionB, sessionC].map((t) => jwt.decode(t).jti)).size === 3,
    "three logins produce three distinct sessions"
  );
  const abcJtis = [sessionA, sessionB, sessionC].map((t) => jwt.decode(t).jti);
  check(
    (await Session.countDocuments({ _id: { $in: abcJtis }, user_id: alice.userId, revoked_at: null })) === 3,
    "all three have a live, unrevoked session record"
  );
  check(
    (await callAuthenticated(sessionA)).status === 200 &&
      (await callAuthenticated(sessionB)).status === 200 &&
      (await callAuthenticated(sessionC)).status === 200,
    "all three sessions work simultaneously"
  );

  const logoutA = await api("POST", "/auth/logout", { token: sessionA });
  check(logoutA.status === 200, "logout succeeds", `${logoutA.status} ${logoutA.data?.message}`);
  check(
    (await callAuthenticated(sessionA)).status === 401,
    "the logged-out session is rejected immediately afterwards"
  );
  check(
    (await callAuthenticated(sessionB)).status === 200 && (await callAuthenticated(sessionC)).status === 200,
    "sessions B and C are UNAFFECTED - logout is not a global blacklist"
  );

  const logoutB = await api("POST", "/auth/logout", { token: sessionB });
  check(logoutB.status === 200, "a second logout succeeds");
  check((await callAuthenticated(sessionB)).status === 401, "session B is now rejected");
  check((await callAuthenticated(sessionA)).status === 401, "session A remains rejected");
  check((await callAuthenticated(sessionC)).status === 200, "session C is still valid after A and B were revoked");

  const reusedLogout = await api("POST", "/auth/logout", { token: sessionA });
  check(
    reusedLogout.status === 401,
    "logging out again with an already-revoked token is refused by authentication, not treated as a fresh logout",
    String(reusedLogout.status)
  );

  const revokedRecord = await Session.findById(jwt.decode(sessionA).jti).lean();
  check(
    revokedRecord && revokedRecord.revoked_at instanceof Date && revokedRecord.revoked_reason === "logout",
    "the session record is marked revoked with a reason, not deleted",
    revokedRecord?.revoked_reason
  );
  check(
    (await callAuthenticated(sessionA)).status === 401 && (await callAuthenticated(ghostSession)).status === 401,
    "a revoked token and a token that never existed produce the SAME rejection (no information leak)"
  );
  const revokedMsg = (await callAuthenticated(sessionA)).data?.message;
  check(
    revokedMsg === "Invalid or expired token" && !/revok/i.test(revokedMsg || ""),
    "the rejection message does not disclose that the token was revoked",
    revokedMsg
  );

  // =========================================================================
  section("Restart safety");
  // =========================================================================

  // This process is NOT the server process, and it has its own freshly-loaded
  // copy of middleware/auth.js with an empty in-memory state. If revocation
  // lived in process memory, the revoked token would be accepted here. It is
  // rejected because the only source of truth is the Session collection -
  // which is also why a server restart cannot resurrect it.
  check(
    (await authenticateToken(sessionA)) === null,
    "a revoked token is rejected by a separate process with no shared memory (so a restart cannot revive it)"
  );
  const stillLive = await authenticateToken(sessionC);
  check(
    stillLive && stillLive.id === String(alice.userId),
    "...while a live token still authenticates in that same separate process"
  );

  // =========================================================================
  section("Socket.io shares the revocation check");
  // =========================================================================

  const socketValid = await connectSocket(sessionC);
  check(socketValid.connected === true, "a valid token still connects to Socket.io", JSON.stringify(socketValid));

  const socketRevoked = await connectSocket(sessionA);
  check(
    socketRevoked.connected === false,
    "a REVOKED token cannot connect to Socket.io (signing out closes the websocket door too)",
    socketRevoked.error
  );

  const socketExpired = await connectSocket(expired);
  check(socketExpired.connected === false, "an expired token cannot connect", socketExpired.error);

  const socketMalformed = await connectSocket("not.a.jwt");
  check(socketMalformed.connected === false, "a malformed token cannot connect", socketMalformed.error);

  const socketNone = await connectSocket(null);
  check(socketNone.connected === false, "no token cannot connect", socketNone.error);

  // =========================================================================
  section("Password change");
  // =========================================================================

  const bob = await registerUser("bob");
  const bobSession2 = (await loginAs(bob.email, GOOD_PASSWORD)).data.token;
  const bobSession3 = (await loginAs(bob.email, GOOD_PASSWORD)).data.token;

  const wrongCurrent = await api("POST", "/auth/change-password", {
    token: bob.token,
    body: { current_password: "NotTheRightOne1", new_password: NEW_PASSWORD },
  });
  check(wrongCurrent.status === 401, "a password change with the wrong current password is refused", String(wrongCurrent.status));
  check(
    (await callAuthenticated(bob.token)).status === 200,
    "...and that failed attempt did not revoke anything"
  );

  const weakNew = await api("POST", "/auth/change-password", {
    token: bob.token,
    body: { current_password: GOOD_PASSWORD, new_password: "short" },
  });
  check(weakNew.status === 400, "a password change to a weak password is refused", `${weakNew.status} ${weakNew.data?.message}`);
  check(
    (await loginAs(bob.email, GOOD_PASSWORD)).status === 200,
    "...and the old password still works, so a rejected change changed nothing"
  );

  const sameAgain = await api("POST", "/auth/change-password", {
    token: bob.token,
    body: { current_password: GOOD_PASSWORD, new_password: GOOD_PASSWORD },
  });
  check(sameAgain.status === 400, "reusing the current password as the new one is refused", String(sameAgain.status));

  // Snapshotted BEFORE the change. Counting live sessions afterwards would
  // be fragile, because the checks further down log in again and so create
  // new ones - the property that matters is that each session which existed
  // at the moment of the change is now revoked.
  const bobSessionsBefore = (
    await Session.find({ user_id: bob.userId, revoked_at: null }).select("_id").lean()
  ).map((d) => d._id);

  const changed = await api("POST", "/auth/change-password", {
    token: bob.token,
    body: { current_password: GOOD_PASSWORD, new_password: NEW_PASSWORD },
  });
  check(changed.status === 200, "a password change with a valid new password succeeds", String(changed.status));
  check(Boolean(changed.data?.token), "...and returns a fresh token so the current device stays signed in");

  const changedJson = JSON.stringify(changed.data);
  check(
    !changedJson.includes(NEW_PASSWORD) && !changedJson.includes(GOOD_PASSWORD),
    "the password-change response contains neither the old nor the new password"
  );
  check(!changedJson.includes("$2a$") && !changedJson.includes("password_hash"), "...nor the password hash");

  check((await loginAs(bob.email, GOOD_PASSWORD)).status === 401, "the OLD password no longer works");
  const newLogin = await loginAs(bob.email, NEW_PASSWORD);
  check(newLogin.status === 200, "the NEW password works", String(newLogin.status));

  // The documented policy: a password change signs out every other device.
  check(
    (await callAuthenticated(bobSession2)).status === 401 &&
      (await callAuthenticated(bobSession3)).status === 401,
    "every OTHER session is revoked by the password change (the documented policy)"
  );
  check(
    (await callAuthenticated(bob.token)).status === 401,
    "the session that performed the change is revoked too..."
  );
  check(
    (await callAuthenticated(changed.data.token)).status === 200,
    "...but the fresh token it returned works, so that device is not locked out"
  );
  const stillLiveFromBefore = await Session.countDocuments({
    _id: { $in: bobSessionsBefore },
    revoked_at: null,
  });
  const revokedByChange = await Session.countDocuments({
    _id: { $in: bobSessionsBefore },
    revoked_reason: "password_change",
  });
  check(
    bobSessionsBefore.length >= 3 && stillLiveFromBefore === 0 && revokedByChange === bobSessionsBefore.length,
    "EVERY session that existed at the moment of the change is revoked, with password_change as the recorded reason",
    `${bobSessionsBefore.length} before, ${stillLiveFromBefore} still live, ${revokedByChange} marked password_change`
  );
  check(
    (await Session.countDocuments({ _id: jwt.decode(changed.data.token).jti, revoked_at: null })) === 1,
    "...and the token the change returned has its own live session, created after the revocation"
  );
  const bobUser = await User.findById(bob.userId).select("password_changed_at").lean();
  check(bobUser?.password_changed_at instanceof Date, "password_changed_at is stamped on the user");

  // Alice must be untouched by Bob's password change - the revoke-all must be
  // scoped to one user.
  check(
    (await callAuthenticated(sessionC)).status === 200,
    "another user's session is unaffected by this user's password change"
  );

  // =========================================================================
  section("Backward compatibility with pre-revocation tokens");
  // =========================================================================

  // Tokens issued before this change carry no jti. The e2e suite mints
  // exactly this shape for its admin calls, and real users held them at
  // deploy time, so they must keep working until they expire.
  const carol = await registerUser("carol");
  const legacyToken = jwt.sign({ id: carol.userId, role: "customer" }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
  check(
    (await callAuthenticated(legacyToken)).status === 200,
    "a token with no jti (issued before sessions existed) is still accepted"
  );
  check(
    jwt.decode(legacyToken).jti === undefined,
    "...and it genuinely has no jti, so it was accepted by the legacy path"
  );

  const legacyDeleted = jwt.sign(
    { id: "64b000000000000000000fff", role: "customer" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  check(
    (await callAuthenticated(legacyDeleted)).status === 401,
    "a legacy token for a user who no longer exists is rejected"
  );

  // The safety valve: a password change must be able to cut off legacy
  // tokens, which have no session record to revoke.
  const carolChanged = await api("POST", "/auth/change-password", {
    token: carol.token,
    body: { current_password: GOOD_PASSWORD, new_password: NEW_PASSWORD },
  });
  check(carolChanged.status === 200, "that user changes their password");
  check(
    (await callAuthenticated(legacyToken)).status === 401,
    "the legacy token is now REJECTED - password_changed_at reaches tokens with no session record"
  );

  // =========================================================================
  section("Google accounts have no password to change");
  // =========================================================================

  const googleUser = await User.create({
    name: "Auth Test Google",
    email: `authtest.google.${STAMP}@example.com`,
    google_id: `authtest-google-${STAMP}`,
    auth_provider: "google",
    role: "shop_owner",
  });
  createdUserIds.push(googleUser._id.toString());

  const googleToken = jwt.sign(
    { id: googleUser._id, role: "shop_owner" },
    process.env.JWT_SECRET,
    { expiresIn: "1h" }
  );
  const googleChange = await api("POST", "/auth/change-password", {
    token: googleToken,
    body: { current_password: "anything-at-all", new_password: NEW_PASSWORD },
  });
  check(
    googleChange.status === 400 && /Google/i.test(googleChange.data?.message || ""),
    "a Google account is told it has no password to change rather than erroring",
    `${googleChange.status} ${googleChange.data?.message}`
  );

  const googleLogin = await api("POST", "/auth/login", {
    body: { email: googleUser.email, password: "guessing-a-password" },
  });
  check(
    googleLogin.status === 401 && googleLogin.data?.message === "Invalid credentials",
    "logging in to a passwordless Google account gives the generic failure, not a crash or a hint",
    `${googleLogin.status} ${googleLogin.data?.message}`
  );

  // =========================================================================
  section("Session record hygiene");
  // =========================================================================

  const liveRecord = await Session.findById(jwt.decode(sessionC).jti).lean();
  check(Boolean(liveRecord), "a session record exists for a live token");
  // Deliberately an exact match rather than a check for absent fields: the
  // requirement is that this record holds the minimum needed to revoke a
  // session, so a NEW field appearing here should fail this test and be
  // justified, not pass silently.
  check(
    JSON.stringify(Object.keys(liveRecord).sort()) ===
      JSON.stringify(["_id", "created_at", "expires_at", "revoked_at", "revoked_reason", "user_id"]),
    "the record stores only the jti, owner, timestamps and revocation state - no device info, no IP, no __v",
    Object.keys(liveRecord).sort().join(",")
  );
  const recordJson = JSON.stringify(liveRecord);
  check(!recordJson.includes(sessionC), "the raw JWT is NOT stored anywhere in the record");
  check(
    liveRecord._id === jwt.decode(sessionC).jti,
    "the record's primary key IS the token's jti, so the lookup needs no extra index"
  );
  check(
    liveRecord.expires_at instanceof Date && liveRecord.expires_at > new Date(),
    "expires_at is set in the future, which is what the TTL index acts on"
  );
  check(
    Math.abs(liveRecord.expires_at.getTime() - jwt.decode(sessionC).exp * 1000) < 5000,
    "expires_at matches the token's own exp, so a record never outlives its token"
  );

  const indexes = await Session.collection.indexes();
  const ttlIndex = indexes.find((i) => i.expireAfterSeconds !== undefined);
  check(
    Boolean(ttlIndex) && ttlIndex.key.expires_at === 1 && ttlIndex.expireAfterSeconds === 0,
    "a TTL index on expires_at exists, so the collection cannot grow forever without a cron",
    ttlIndex ? `${ttlIndex.name} expireAfterSeconds=${ttlIndex.expireAfterSeconds}` : "MISSING"
  );
  check(
    indexes.some((i) => i.key.user_id === 1),
    "user_id is indexed for the revoke-all-sessions path",
    indexes.map((i) => i.name).join(",")
  );

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function cleanup() {
  section("cleaning up test accounts");
  try {
    const ids = createdUserIds.filter(Boolean);
    const sessions = await Session.deleteMany({ user_id: { $in: ids } });
    const users = await User.deleteMany({ _id: { $in: ids } });
    // Belt and braces: anything this run created is prefixed authtest. and
    // carries this run's stamp, so a user missed by the id list above (a
    // registration that returned 201 after an assertion threw, say) is still
    // removed. Scoped to this stamp so it can never touch another run or a
    // real account.
    const strays = await User.deleteMany({ email: new RegExp(`^authtest\\..*\\.${STAMP}@example\\.com$`) });
    console.log(
      `removed ${users.deletedCount + strays.deletedCount} test user(s) and ${sessions.deletedCount} session record(s)`
    );
  } catch (error) {
    console.error(`cleanup failed: ${error.message}`);
  }
  await mongoose.disconnect();
}

main()
  .catch((error) => {
    console.error("\nauthSecurityTest crashed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    setTimeout(() => process.exit(process.exitCode || 0), 100);
  });
