// Isolated contract tests: no database, gateway, email, or production server.
// Run: node --test test/profile.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { validateProfileDetails, publicUser } = require("../utils/profileDetails");
const User = require("../models/User");
const { getProfile, updateProfile } = require("../controllers/profileController");
const { verifyToken } = require("../middleware/auth");

const now = new Date("2026-10-16T12:00:00Z");
const validate = (body) => validateProfileDetails(body, { now });
const user = {
  _id: "caller", name: "Customer", email: "signin@example.com", phone: "9000000000", role: "customer",
  contact_email: "contact@example.com", date_of_birth: "2000-02-29", password_hash: "secret", google_id: "identity",
};
function response() {
  return { statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

test("profile dates preserve calendar dates and accept leap days and explicit clearing", () => {
  assert.deepEqual(validate({ date_of_birth: "2000-02-29" }).updates, { date_of_birth: "2000-02-29" });
  assert.deepEqual(validate({ date_of_birth: "2026-10-16" }).updates, { date_of_birth: "2026-10-16" });
  assert.deepEqual(validate({ date_of_birth: null, contact_email: null }).updates, { date_of_birth: null, contact_email: null });
  const indiaMidnight = new Date("2026-10-15T18:30:00Z");
  assert.equal(validateProfileDetails({ date_of_birth: "2026-10-16" }, { now: indiaMidnight }).error, undefined);
  assert.ok(validateProfileDetails({ date_of_birth: "2026-10-17" }, { now: indiaMidnight }).error);
  assert.ok(validateProfileDetails({ date_of_birth: "2026-10-16" }, { now: new Date("2026-10-15T18:29:59Z") }).error);
});
test("profile dates reject normalization, impossible dates, future dates and nonstrings", () => {
  for (const date_of_birth of ["2025-02-29", "2000-02-30", "2001-04-31", "0000-01-01", "2026-10-17", "2000-2-01", "2000-01-01T00:00:00Z", "", 20000101, {}]) {
    assert.ok(validate({ date_of_birth }).error, String(date_of_birth));
  }
});
test("contact email normalizes but never changes the sign-in email", () => {
  assert.deepEqual(validate({ contact_email: "  CONTACT@Example.COM " }).updates, { contact_email: "contact@example.com" });
  for (const contact_email of ["", "missing-at", "a@b", "two@@example.com", "a b@example.com", {}, 5, "a".repeat(250) + "@example.com"]) {
    assert.ok(validate({ contact_email }).error);
  }
});
test("mass assignment and malformed bodies are rejected as a whole", () => {
  for (const key of ["email", "role", "password_hash", "google_id", "auth_provider", "id", "name", "phone", "$set", "__proto__"]) {
    const body = JSON.parse(JSON.stringify({ contact_email: "ok@example.com", [key]: "attacker" }));
    assert.ok(validate(body).error, key);
  }
  for (const body of [null, undefined, [], "email"]) assert.ok(validate(body).error);
});
test("registration accepts only validated optional profile values alongside existing fields", () => {
  assert.deepEqual(validateProfileDetails({ email: "signin@example.com", role: "customer", contact_email: " INFO@EXAMPLE.COM ", date_of_birth: "2000-01-01" }, { now, allowOtherFields: true }).updates,
    { contact_email: "info@example.com", date_of_birth: "2000-01-01" });
  assert.ok(validateProfileDetails({ email: "signin@example.com", date_of_birth: "2025-02-29" }, { now, allowOtherFields: true }).error);
});
test("canonical public profile is additive and never returns identity secrets", () => {
  assert.deepEqual(publicUser(user), { id: "caller", name: "Customer", email: "signin@example.com", phone: "9000000000", role: "customer", contact_email: "contact@example.com", date_of_birth: "2000-02-29" });
  assert.equal(publicUser({ ...user, contact_email: undefined, date_of_birth: undefined }).date_of_birth, null);
});
test("Mongoose enforces optional profile validation without a database", () => {
  const valid = { name: "Customer", phone: "9000000000", email: "signin@example.com", password_hash: "hash" };
  assert.equal(new User({ ...valid, contact_email: "contact@example.com", date_of_birth: "2000-02-29" }).validateSync(), undefined);
  const invalid = new User({ ...valid, contact_email: "bad", date_of_birth: "2025-02-29" }).validateSync();
  assert.ok(invalid.errors.contact_email);
  assert.ok(invalid.errors.date_of_birth);
});
test("GET reads only the authenticated caller and returns safe fields", async () => {
  const original = User.findById;
  try {
    User.findById = (id) => { assert.equal(id, "caller"); return { select: () => Promise.resolve(user) }; };
    const res = response();
    await getProfile({ user: { id: "caller" }, query: { id: "victim" } }, res);
    assert.equal(res.body.user.id, "caller");
    assert.equal(res.body.user.password_hash, undefined);
  } finally { User.findById = original; }
});
test("PATCH atomically updates only requested contact fields on the authenticated caller", async () => {
  const original = User.findByIdAndUpdate;
  try {
    User.findByIdAndUpdate = (id, update, options) => {
      assert.equal(id, "caller");
      assert.deepEqual(update, { $set: { contact_email: "new@example.com" } });
      assert.deepEqual(options, { new: true, runValidators: true });
      return { select: () => Promise.resolve({ ...user, ...update.$set }) };
    };
    const res = response();
    await updateProfile({ user: { id: "caller" }, body: { contact_email: " NEW@EXAMPLE.COM " } }, res);
    assert.equal(res.body.user.email, "signin@example.com");
    assert.equal(res.body.user.contact_email, "new@example.com");
    assert.equal(res.body.user.date_of_birth, "2000-02-29");
  } finally { User.findByIdAndUpdate = original; }
});
test("PATCH rejects invalid, empty or privilege-changing requests before any write", async () => {
  const original = User.findByIdAndUpdate;
  try {
    User.findByIdAndUpdate = () => { throw new Error("must not write"); };
    for (const body of [{}, { email: "takeover@example.com" }, { role: "admin", date_of_birth: null }, { date_of_birth: "2025-02-29" }]) {
      const res = response();
      await updateProfile({ user: { id: "caller" }, body }, res);
      assert.equal(res.statusCode, 400);
    }
  } finally { User.findByIdAndUpdate = original; }
});
test("missing users and database failures return explicit failures, never fake success", async () => {
  const getOriginal = User.findById, patchOriginal = User.findByIdAndUpdate;
  try {
    for (const failure of [null, new Error("db unavailable")]) {
      const query = () => ({ select: () => failure instanceof Error ? Promise.reject(failure) : Promise.resolve(failure) });
      User.findById = query; User.findByIdAndUpdate = query;
      for (const handler of [getProfile, updateProfile]) {
        const res = response();
        await handler({ user: { id: "caller" }, body: { date_of_birth: null } }, res);
        assert.equal(res.statusCode, failure ? 500 : 401);
        assert.equal(res.body.user, undefined);
      }
    }
  } finally { User.findById = getOriginal; User.findByIdAndUpdate = patchOriginal; }
});
test("existing token middleware rejects unauthenticated access before handler execution", async () => {
  const res = response();
  let called = false;
  await verifyToken({ headers: {} }, res, () => { called = true; });
  assert.equal(res.statusCode, 401);
  assert.equal(called, false);
});
