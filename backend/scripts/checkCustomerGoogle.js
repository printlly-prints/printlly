const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const express = require("express");
const { OAuth2Client } = require("google-auth-library");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
const User = require("../models/User");
const Session = require("../models/Session");
const {
  customerGoogleLogin,
} = require("../controllers/customerGoogleController");
const { verifyToken } = require("../middleware/auth");
const database =
  "paprout_google_check_" + crypto.randomBytes(6).toString("hex");
const originalVerify = OAuth2Client.prototype.verifyIdToken;
let server, profile;
(async () => {
  await mongoose.connect("mongodb://127.0.0.1:27017/" + database);
  const app = express();
  app.use(express.json());
  app.post("/google", customerGoogleLogin);
  app.get("/me", verifyToken, (req, res) => res.json(req.user));
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const login = async (body = { id_token: "verified-test-token" }) => {
    const r = await fetch(base + "/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  };
  delete process.env.GOOGLE_CUSTOMER_WEB_CLIENT_ID;
  assert.equal((await login()).status, 501);
  process.env.GOOGLE_CUSTOMER_WEB_CLIENT_ID = "expected-web-client";
  OAuth2Client.prototype.verifyIdToken = async function (options) {
    assert.equal(options.audience, "expected-web-client");
    if (options.idToken !== "verified-test-token")
      throw Error("Invalid Google signature");
    return { getPayload: () => profile };
  };
  assert.equal((await login({ id_token: 5 })).status, 400);
  assert.equal((await login({ id_token: "forged" })).status, 401);
  profile = {
    sub: "google-customer",
    email: "customer@gmail.com",
    email_verified: false,
  };
  assert.equal((await login()).status, 401);
  profile.email_verified = true;
  profile.name = "Customer";
  const first = await login({
    id_token: "verified-test-token",
    role: "admin",
    email: "spoof@example.test",
  });
  assert.equal(first.status, 200);
  assert.equal(first.body.user.role, "customer");
  assert.equal(first.body.user.email, profile.email);
  assert(!first.body.user.password_hash);
  assert.equal(await User.countDocuments(), 1);
  await login();
  assert.equal(await User.countDocuments(), 1);
  assert.equal(await Session.countDocuments(), 2);
  assert.equal(
    (
      await fetch(base + "/me", {
        headers: { Authorization: "Bearer " + first.body.token },
      })
    ).status,
    200,
  );
  const vendor = await User.create({
    name: "Vendor",
    email: "vendor@gmail.com",
    auth_provider: "google",
    google_id: "google-vendor",
    role: "shop_owner",
  });
  profile = { sub: "google-vendor", email: vendor.email, email_verified: true };
  assert.equal((await login()).status, 403);
  profile.sub = "different-vendor-id";
  assert.equal((await login()).status, 403);
  assert.equal((await User.findById(vendor._id)).google_id, "google-vendor");
  const local = await User.create({
    name: "Existing",
    email: "local@gmail.com",
    phone: "9000000000",
    password_hash: "preserved-password-hash",
    role: "customer",
  });
  profile = { sub: "google-local", email: local.email, email_verified: true };
  assert.equal((await login()).status, 200);
  assert.equal(
    (await User.findById(local._id)).password_hash,
    "preserved-password-hash",
  );
  const external = await User.create({
    name: "External",
    email: "person@example.test",
    phone: "9000000001",
    password_hash: "preserved",
    role: "customer",
  });
  profile = { sub: "external-id", email: external.email, email_verified: true };
  assert.equal((await login()).status, 403);
  assert.equal((await User.findById(external._id)).google_id, undefined);
  console.log(
    "Customer Google checks passed: config, input, rejected tokens, verified identity, role isolation, safe linking, revocable sessions and no duplicate accounts. Google verification transport mocked; no external sign-in performed.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    OAuth2Client.prototype.verifyIdToken = originalVerify;
    if (server) await new Promise((r) => server.close(r));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  });
