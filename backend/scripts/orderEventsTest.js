// Tests realtime order events and push notifications: room authorization,
// customer/vendor isolation, event ordering, idempotency, push token handling
// and notification payload safety.
//
// Runs against the REAL running server with REAL socket.io clients, because
// what is under test is who receives what - and that can only be shown by
// connecting several clients as different people and checking which ones hear
// an event.
//
// Push is tested through the transport seam (utils/pushNotifications.js
// setPushTransport), never against Expo's servers: a test that depended on
// real delivery would be slow, flaky, and would send notifications to real
// devices. The transport substitution happens IN THIS PROCESS, so it covers
// the direct sendPushToUser tests; events emitted by the SERVER process use
// the real transport and simply find no registered devices, which is also
// asserted.
//
// Every user, shop, order, notification and device token it touches is one it
// created, stamped with this run's id, and all of it is deleted on the way
// out. It never sends a notification to a real customer.
//
// Run with: node scripts/orderEventsTest.js   (server must be running)
require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { io: ioClient } = require("socket.io-client");

const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const Session = require("../models/Session");
const Notification = require("../models/Notification");
const DeviceToken = require("../models/DeviceToken");
const { sendPushToUser, setPushTransport, fingerprint } = require("../utils/pushNotifications");
const { socketPayload, ORDER_EVENTS } = require("../utils/orderEvents");

const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
const STAMP = Date.now().toString(36);
const PASSWORD = "OrderEventsPass42";

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` -> ${detail}` : ""}`);
};
const section = (title) => console.log(`\n--- ${title} ---`);

const made = { users: [], shops: [], orders: [], sessions: [], tokens: [] };
let phoneSeq = 0;
const phone = () => `2${String(Date.now()).slice(-6)}${String(phoneSeq++).padStart(3, "0")}`;

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
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

// Mints a real session so the token passes the session-backed handshake.
async function tokenFor(user) {
  const jti = crypto.randomBytes(32).toString("hex");
  await Session.create({ _id: jti, user_id: user._id, expires_at: new Date(Date.now() + 3600000) });
  made.sessions.push(jti);
  return jwt.sign({ id: user._id, role: user.role, jti }, process.env.JWT_SECRET, { expiresIn: "1h" });
}

async function makeUser(role, label) {
  const user = await User.create({
    name: `OE ${role} ${label}`,
    email: `oetest.${role}.${label}.${STAMP}@example.com`,
    phone: phone(),
    password_hash: await bcrypt.hash(PASSWORD, 10),
    role,
  });
  made.users.push(user._id);
  return user;
}

async function makeShop(owner, label) {
  const shop = await Shop.create({
    owner_id: owner._id,
    shop_name: `OE Shop ${label} ${STAMP}`,
    address: "1 Test Street",
    contact: "9000000000",
    is_verified: true,
    verification_status: "approved",
  });
  made.shops.push(shop._id);
  return shop;
}

async function makeOrder(customer, shop, { total = 100, status = "pending", paymentStatus = "created" } = {}) {
  const fee = 5;
  const order = await Order.create({
    customer_id: customer._id,
    shop_id: shop._id,
    documents: [{
      upload_id: new mongoose.Types.ObjectId(),
      original_name: "secret-medical-report.pdf",
      file_url: "https://res.cloudinary.invalid/print_orders/secret.pdf",
      page_count: 1, color_mode: "bw", copies: 1, paper_size: "A4", sides: "single", services: [],
      pricing: { base: total - fee, paper_charge: 0, sides_charge: 0, services_charge: 0, document_total: total - fee },
    }],
    base_subtotal: total - fee,
    platform_fee: fee,
    total_amount: total,
    status,
    payment_status: paymentStatus,
    razorpay_order_id: `order_OE${STAMP}${Math.floor(Math.random() * 100000)}`,
  });
  made.orders.push(order._id);
  return order;
}

// A connected socket that records every order:event it receives.
function connect(token) {
  return new Promise((resolve) => {
    const socket = ioClient(BASE_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      timeout: 5000,
    });
    const events = [];
    socket.on("order:event", (e) => events.push(e));
    socket.on("connect", () => resolve({ ok: true, socket, events }));
    socket.on("connect_error", (error) => resolve({ ok: false, error: error.message, socket, events }));
  });
}

// Socket delivery is asynchronous; give it a moment to arrive. Short because
// everything is on localhost.
const settle = (ms = 400) => new Promise((r) => setTimeout(r, ms));

const subscribe = (socket, orderId) =>
  new Promise((resolve) => socket.emit("order:subscribe", { orderId }, resolve));

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const health = await fetch(`${BASE_URL}/`).catch(() => null);
  if (!health || !health.ok) throw new Error(`server not responding at ${BASE_URL}`);
  console.log(`Order events + push tests ${STAMP}`);
  console.log("NOTE: push is exercised through a mock transport; no real notification is sent.\n");

  const custA = await makeUser("customer", "a");
  const custB = await makeUser("customer", "b");
  const ownA = await makeUser("shop_owner", "a");
  const ownB = await makeUser("shop_owner", "b");
  const shopA = await makeShop(ownA, "a");
  const shopB = await makeShop(ownB, "b");

  const tokA = await tokenFor(custA);
  const tokB = await tokenFor(custB);
  const tokOwnA = await tokenFor(ownA);
  const tokOwnB = await tokenFor(ownB);

  // =========================================================================
  section("Socket authentication (unchanged semantics)");
  // =========================================================================

  const connA = await connect(tokA);
  check(connA.ok === true, "a valid session-backed JWT connects", connA.error || "connected");

  const expired = jwt.sign({ id: custA._id, role: "customer", jti: "x" }, process.env.JWT_SECRET, { expiresIn: "-10s" });
  check((await connect(expired)).ok === false, "an expired JWT is rejected");
  check((await connect("not.a.jwt")).ok === false, "a malformed JWT is rejected");
  check((await connect(null)).ok === false, "no token is rejected");
  const wrongSecret = jwt.sign({ id: custA._id, role: "customer" }, "another-secret", { expiresIn: "1h" });
  check((await connect(wrongSecret)).ok === false, "a JWT signed with the wrong secret is rejected");

  // Revocation must still close the websocket door (Step 8 behaviour).
  const revokeMe = await makeUser("customer", "rev");
  const revokedToken = await tokenFor(revokeMe);
  const beforeRevoke = await connect(revokedToken);
  check(beforeRevoke.ok === true, "a live session connects before revocation");
  const loggedOut = await api("POST", "/auth/logout", { token: revokedToken });
  await settle();
  check(loggedOut.status === 200 && !beforeRevoke.socket.connected, "logout closes the live socket for that session");
  check((await connect(revokedToken)).ok === false, "a REVOKED session can no longer connect");
  check(connA.socket.connected, "logout leaves other sessions connected");

  // =========================================================================
  section("Customer isolation");
  // =========================================================================

  const connB = await connect(tokB);
  const orderA = await makeOrder(custA, shopA, { total: 100 });

  // Emitted through the real HTTP lifecycle below; here, drive the vendor
  // acceptance that the customer should hear about.
  await Order.updateOne({ _id: orderA._id }, { $set: { payment_status: "paid", status: "pending", vendor_amount: 95, otp: "123456" } });
  const acceptA = await api("PATCH", `/orders/${orderA._id}/accept`, { token: tokOwnA });
  check(acceptA.status === 200, "vendor A accepts order A over the real API", String(acceptA.status));
  await settle();

  const aGotAccepted = connA.events.filter((e) => e.event === "ORDER_ACCEPTED" && e.orderId === String(orderA._id));
  check(aGotAccepted.length === 1, "customer A received their own ORDER_ACCEPTED exactly once", `${aGotAccepted.length} event(s)`);
  check(
    connB.events.filter((e) => e.orderId === String(orderA._id)).length === 0,
    "customer B received NOTHING about customer A's order"
  );

  // =========================================================================
  section("Vendor isolation");
  // =========================================================================

  const connOwnA = await connect(tokOwnA);
  const connOwnB = await connect(tokOwnB);
  check(connOwnA.ok && connOwnB.ok, "both vendors connect");

  const orderForA = await makeOrder(custA, shopA, { total: 150 });
  await Order.updateOne({ _id: orderForA._id }, { $set: { razorpay_order_id: `order_OEVEND${STAMP}` } });
  // Payment confirmation is the vendor's "new paid order" signal.
  const { markOrderPaid } = require("../utils/paymentConfirmation");
  const freshOrder = await Order.findById(orderForA._id);
  await markOrderPaid(freshOrder, { razorpayPaymentId: `pay_OE${STAMP}` });
  await settle();

  // NOTE: markOrderPaid ran in THIS process, which has its own socket module
  // with no io instance - so the emit is a no-op here. The authoritative
  // check is therefore the database state plus the HTTP-driven events above
  // and below. Verified explicitly:
  check(
    (await Order.findById(orderForA._id).lean()).payment_status === "paid",
    "payment confirmation committed to the database"
  );
  check(
    (await Notification.countDocuments({ order_id: orderForA._id, type: "payment_success" })) === 1,
    "...and created exactly one payment_success notification"
  );
  const paidOrderNotice = (await api("GET", "/notifications", { token: tokOwnA })).data
    .filter((item) => item.type === "vendor_new_order" && item.order_id === String(orderForA._id));
  check(paidOrderNotice.length === 1 && !paidOrderNotice[0].read, "the receiving vendor can recover one unread new order alert");
  const otherVendorInbox = (await api("GET", "/notifications", { token: tokOwnB })).data;
  check(!otherVendorInbox.some((item) => item.order_id === String(orderForA._id)), "other vendors cannot read that order alert");
  await require("../utils/orderEvents").emitOrderEvent(freshOrder, ORDER_EVENTS.PAYMENT_CONFIRMED);
  check(
    (await Notification.countDocuments({ order_id: orderForA._id, type: "vendor_new_order" })) === 1,
    "replaying a payment event does not create another vendor alert"
  );

  // Vendor isolation over the real HTTP path: ready + complete on shop A's
  // order must not reach vendor B.
  await api("PATCH", `/orders/${orderA._id}/ready`, { token: tokOwnA });
  await settle();
  const readyEvents = connA.events.filter((e) => e.event === "ORDER_READY_FOR_PICKUP" && e.orderId === String(orderA._id));
  check(readyEvents.length === 1, "customer A received ORDER_READY_FOR_PICKUP exactly once", `${readyEvents.length}`);
  check(
    connOwnB.events.filter((e) => e.orderId === String(orderA._id)).length === 0,
    "vendor B received NOTHING about shop A's order"
  );

  const completed = await api("PATCH", `/orders/${orderA._id}/complete`, { token: tokOwnA, body: { otp: "123456" } });
  check(completed.status === 200, "vendor A completes the order", String(completed.status));
  await settle();
  const completeEvents = connA.events.filter((e) => e.event === "ORDER_COMPLETED" && e.orderId === String(orderA._id));
  check(completeEvents.length === 1, "customer A received ORDER_COMPLETED exactly once", `${completeEvents.length}`);
  // The shop is told too, because its queue shrank.
  const ownACompleted = connOwnA.events.filter((e) => e.event === "ORDER_COMPLETED" && e.orderId === String(orderA._id));
  check(ownACompleted.length === 1, "vendor A received ORDER_COMPLETED for their own shop", `${ownACompleted.length}`);
  check(
    connOwnB.events.filter((e) => e.event === "ORDER_COMPLETED").length === 0,
    "vendor B still received nothing"
  );
  check(
    connB.events.length === 0,
    "customer B received no events at all across the whole lifecycle",
    `${connB.events.length} event(s)`
  );

  // =========================================================================
  section("Order room authorization");
  // =========================================================================

  const orderB = await makeOrder(custB, shopB, { total: 90 });

  const ownSub = await subscribe(connA.socket, String(orderA._id));
  check(ownSub?.ok === true, "customer A may subscribe to their OWN order room", JSON.stringify(ownSub));

  const foreignSub = await subscribe(connA.socket, String(orderB._id));
  check(foreignSub?.ok === false, "customer A may NOT subscribe to customer B's order", JSON.stringify(foreignSub));

  const vendorForeign = await subscribe(connOwnA.socket, String(orderB._id));
  check(vendorForeign?.ok === false, "vendor A may NOT subscribe to an order belonging to shop B", JSON.stringify(vendorForeign));

  const vendorOwn = await subscribe(connOwnA.socket, String(orderA._id));
  check(vendorOwn?.ok === true, "vendor A MAY subscribe to an order for their own shop", JSON.stringify(vendorOwn));

  const bogus = await subscribe(connA.socket, "not-an-object-id");
  check(bogus?.ok === false, "a malformed order id is refused");
  const missing = await subscribe(connA.socket, new mongoose.Types.ObjectId().toString());
  check(missing?.ok === false, "a non-existent order id is refused");
  check(
    missing?.message === foreignSub?.message,
    "a non-existent order and someone else's order give the SAME message (no enumeration)",
    missing?.message
  );
  check((await subscribe(connA.socket, undefined))?.ok === false, "a missing order id is refused");

  // =========================================================================
  section("Event payload safety");
  // =========================================================================

  const sample = connA.events.find((e) => e.event === "ORDER_COMPLETED");
  check(
    JSON.stringify(Object.keys(sample).sort()) ===
      JSON.stringify(["event", "orderId", "paymentStatus", "status", "timestamp"]),
    "the payload carries only event, orderId, status, paymentStatus and timestamp",
    Object.keys(sample).sort().join(",")
  );
  const allEventsJson = JSON.stringify(connA.events);
  check(!allEventsJson.includes("cloudinary.invalid"), "no event contains a document URL");
  check(!allEventsJson.includes("secret-medical-report"), "no event contains a document filename");
  check(!allEventsJson.includes("123456"), "no event contains the pickup OTP");
  check(!allEventsJson.includes("documents"), "no event contains the documents array");
  check(!/razorpay|vendor_amount|total_amount|platform_fee/.test(allEventsJson), "no event contains payment identifiers or amounts");
  check(!allEventsJson.includes(custA.phone), "no event contains the customer's phone number");

  // =========================================================================
  section("In-app notifications");
  // =========================================================================

  const notifs = await Notification.find({ order_id: orderA._id }).lean();
  const types = notifs.map((n) => n.type).sort();
  check(
    types.join(",") === "order_accepted,order_completed,order_ready",
    "one notification per lifecycle event, for the right order",
    types.join(",")
  );
  check(
    notifs.every((n) => String(n.user_id) === String(custA._id)),
    "every notification went to the customer, not the vendor"
  );
  check(notifs.every((n) => n.read === false), "notifications are created unread");
  const notifJson = JSON.stringify(notifs);
  check(!notifJson.includes("123456"), "no notification body contains the pickup OTP");
  check(!notifJson.includes("cloudinary.invalid") && !notifJson.includes("secret-medical-report"), "no notification contains a document URL or filename");
  check(!/razorpay|rzp_/.test(notifJson), "no notification contains payment secrets or identifiers");

  // The polling route must still work - it is the fallback for everything the
  // socket misses.
  const polled = await api("GET", "/notifications", { token: tokA });
  check(polled.status === 200 && Array.isArray(polled.data), "GET /notifications still works (the fallback path)", String(polled.status));
  check(
    polled.data.some((n) => String(n.order_id) === String(orderA._id) && n.type === "order_completed"),
    "...and returns the events delivered over the socket, so a missed event is recoverable"
  );

  // Idempotency, enforced by the unique index rather than a check.
  const dupe = await Notification.create({
    user_id: custA._id, title: "dup", body: "dup", type: "order_completed", order_id: orderA._id,
  }).then(() => "created").catch((e) => (e.code === 11000 ? "rejected" : `error:${e.code}`));
  check(dupe === "rejected", "a duplicate (order, type) notification is rejected by the database", dupe);

  const { emitOrderEvent } = require("../utils/orderEvents");
  const completedOrder = await Order.findById(orderA._id);
  const replay = await emitOrderEvent(completedOrder, ORDER_EVENTS.ORDER_COMPLETED);
  check(replay.notified === false, "re-emitting the same event creates NO second notification", JSON.stringify(replay.notified));
  check(
    (await Notification.countDocuments({ order_id: orderA._id, type: "order_completed" })) === 1,
    "...and the count is still exactly one"
  );
  check(replay.pushed === null, "...and no push is attempted on a replay (the phone is not buzzed twice)");

  // =========================================================================
  section("Push token registration");
  // =========================================================================

  const tokenA1 = `ExponentPushToken[oe${STAMP}aaaaaaaaaaaaaaa]`;
  const tokenA2 = `ExponentPushToken[oe${STAMP}bbbbbbbbbbbbbbb]`;
  made.tokens.push(tokenA1, tokenA2);

  const reg = await api("POST", "/notifications/device-token", { token: tokA, body: { token: tokenA1, platform: "android" } });
  check(reg.status === 200, "a device registers successfully", String(reg.status));
  check(!JSON.stringify(reg.data).includes(tokenA1), "the response does not echo the push token back");

  const unauth = await api("POST", "/notifications/device-token", { body: { token: tokenA2, platform: "ios" } });
  check(unauth.status === 401, "registration without a JWT is refused", String(unauth.status));

  const bad = await api("POST", "/notifications/device-token", { token: tokA, body: { token: "not-a-push-token", platform: "android" } });
  check(bad.status === 400, "an invalid push token is refused", `${bad.status} ${bad.data?.message}`);
  const badPlatform = await api("POST", "/notifications/device-token", { token: tokA, body: { token: tokenA2, platform: "windows" } });
  check(badPlatform.status === 400, "an unknown platform is refused", String(badPlatform.status));

  // Re-registering the same token must update, not duplicate.
  await api("POST", "/notifications/device-token", { token: tokA, body: { token: tokenA1, platform: "android" } });
  check(
    (await DeviceToken.countDocuments({ token: tokenA1 })) === 1,
    "re-registering the same device does NOT create a second row"
  );

  // Multiple devices for one user.
  await api("POST", "/notifications/device-token", { token: tokA, body: { token: tokenA2, platform: "ios" } });
  check(
    (await DeviceToken.countDocuments({ user_id: custA._id, active: true })) === 2,
    "a user can have several active devices",
    String(await DeviceToken.countDocuments({ user_id: custA._id, active: true }))
  );

  // Identity comes from the JWT, never the body.
  const spoof = await api("POST", "/notifications/device-token", {
    token: tokB,
    body: { token: tokenA1, platform: "android", user_id: String(custA._id) },
  });
  check(spoof.status === 200, "customer B registers the same device token (a handed-on phone)");
  const moved = await DeviceToken.findOne({ token: tokenA1 }).lean();
  check(
    String(moved.user_id) === String(custB._id),
    "...and the device now belongs to B, not A - ownership follows the JWT, not the body",
    String(moved.user_id) === String(custB._id) ? "moved to B" : "still A"
  );
  check(
    (await DeviceToken.countDocuments({ token: tokenA1 })) === 1,
    "...with still exactly one row for that device (so A can no longer receive B's notifications)"
  );

  // Deactivation is scoped to the caller's own devices.
  const foreignUnreg = await api("DELETE", "/notifications/device-token", { token: tokA, body: { token: tokenA1 } });
  check(foreignUnreg.status === 200, "unregistering someone else's device returns 200 (no information leak)", String(foreignUnreg.status));
  check(
    (await DeviceToken.findOne({ token: tokenA1 }).lean()).active === true,
    "...but did NOT deactivate it, because it is not that caller's device"
  );

  await api("DELETE", "/notifications/device-token", { token: tokA, body: { token: tokenA2 } });
  check((await DeviceToken.findOne({ token: tokenA2 }).lean()).active === false, "a user CAN deactivate their own device");

  // =========================================================================
  section("Push delivery (mock transport)");
  // =========================================================================

  const pushUser = await makeUser("customer", "push");
  const pushTokens = [
    `ExponentPushToken[oe${STAMP}ccccccccccccccc]`,
    `ExponentPushToken[oe${STAMP}ddddddddddddddd]`,
  ];
  made.tokens.push(...pushTokens);
  await DeviceToken.create([
    { user_id: pushUser._id, token: pushTokens[0], platform: "android" },
    { user_id: pushUser._id, token: pushTokens[1], platform: "ios" },
  ]);

  let captured = [];
  let restore = setPushTransport({
    async send(messages) {
      captured = messages;
      return messages.map(() => ({ status: "ok", id: "ticket" }));
    },
  });
  const ok = await sendPushToUser(pushUser._id, { title: "T", body: "B", data: { orderId: "x" } });
  restore();
  check(ok.sent === 2 && ok.failed === 0, "a push reaches every active device", JSON.stringify(ok));
  check(captured.length === 2, "one message per device was built", String(captured.length));
  check(
    captured.every((m) => m.title === "T" && m.body === "B"),
    "the message carries the title and body"
  );
  const capturedJson = JSON.stringify(captured);
  check(!/otp|123456/i.test(capturedJson), "no push payload contains an OTP");
  check(!capturedJson.includes("cloudinary.invalid"), "no push payload contains a document URL");

  // Provider failure must be survivable and must NOT deactivate tokens.
  restore = setPushTransport({
    async send() {
      throw new Error("Expo is unavailable");
    },
  });
  const outage = await sendPushToUser(pushUser._id, { title: "T", body: "B" });
  restore();
  check(outage.failed === 1 && outage.deactivated === 0, "a provider outage is survived without deactivating any token", JSON.stringify(outage));
  check(
    (await DeviceToken.countDocuments({ user_id: pushUser._id, active: true })) === 2,
    "...both devices are still active after the outage"
  );

  // A permanently dead token is deactivated; the sibling is not.
  restore = setPushTransport({
    async send(messages) {
      return messages.map((m, i) =>
        i === 0
          ? { status: "error", message: "not registered", details: { error: "DeviceNotRegistered" } }
          : { status: "ok", id: "t" }
      );
    },
  });
  const mixed = await sendPushToUser(pushUser._id, { title: "T", body: "B" });
  restore();
  check(mixed.sent === 1 && mixed.deactivated === 1, "a DeviceNotRegistered token is deactivated", JSON.stringify(mixed));
  check(
    (await DeviceToken.countDocuments({ user_id: pushUser._id, active: true })) === 1,
    "...and the user's OTHER device is left active"
  );

  // Repeated sends must not keep trying the dead one.
  restore = setPushTransport({
    async send(messages) {
      captured = messages;
      return messages.map(() => ({ status: "ok", id: "t" }));
    },
  });
  await sendPushToUser(pushUser._id, { title: "T", body: "B" });
  restore();
  check(captured.length === 1, "a later send skips the permanently dead token", `${captured.length} message(s)`);

  const noDevices = await sendPushToUser((await makeUser("customer", "nodev"))._id, { title: "T", body: "B" });
  check(noDevices.skipped === 1 && noDevices.sent === 0, "a user with no registered device is skipped quietly", JSON.stringify(noDevices));

  check(
    !fingerprint(pushTokens[0]).includes(pushTokens[0].slice(18, 30)) || fingerprint(pushTokens[0]).length < 20,
    "the log fingerprint is far shorter than the token itself",
    `${fingerprint(pushTokens[0])} (token is ${pushTokens[0].length} chars)`
  );

  // =========================================================================
  section("Delivery is downstream of the database");
  // =========================================================================

  // A push failure must not undo a state change. Driven through the real HTTP
  // lifecycle with the server's own transport, which has no devices to reach.
  const robustOrder = await makeOrder(custA, shopA, { total: 75, paymentStatus: "paid", status: "pending" });
  await Order.updateOne({ _id: robustOrder._id }, { $set: { otp: "654321", vendor_amount: 70 } });
  const acceptDespite = await api("PATCH", `/orders/${robustOrder._id}/accept`, { token: tokOwnA });
  check(acceptDespite.status === 200, "an order is accepted even though no device can be pushed to", String(acceptDespite.status));
  check(
    (await Order.findById(robustOrder._id).lean()).status === "accepted",
    "...and the database state is correct regardless of notification delivery"
  );

  // A failed state transition must emit no success event.
  const eventsBefore = connA.events.length;
  const badTransition = await api("PATCH", `/orders/${robustOrder._id}/complete`, { token: tokOwnA, body: { otp: "000000" } });
  await settle();
  check(badTransition.status === 400, "completing with the wrong OTP is refused", String(badTransition.status));
  check(
    connA.events.length === eventsBefore,
    "...and NO event was emitted for the transition that did not happen",
    `${connA.events.length - eventsBefore} new event(s)`
  );
  check(
    (await Order.findById(robustOrder._id).lean()).status === "accepted",
    "...and the order is still accepted, not completed"
  );
  check(
    (await Notification.countDocuments({ order_id: robustOrder._id, type: "order_completed" })) === 0,
    "...and no completion notification was created"
  );

  // =========================================================================
  section("Support chat still works");
  // =========================================================================

  const supportResult = await new Promise((resolve) => {
    const s = ioClient(BASE_URL, { auth: { token: tokA }, transports: ["websocket"], reconnection: false, timeout: 5000 });
    s.on("connect", () => {
      s.emit("support:send", { text: `order events regression check ${STAMP}` }, (ack) => {
        s.close();
        resolve(ack);
      });
    });
    s.on("connect_error", (e) => { s.close(); resolve({ ok: false, message: e.message }); });
  });
  check(supportResult?.ok === true, "the existing support chat socket path is unaffected", JSON.stringify(supportResult));

  for (const c of [connA, connB, connOwnA, connOwnB]) c.socket?.close();

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

async function cleanup() {
  section("cleaning up test data");
  try {
    // Email-delivery records too. Order events now also dispatch
    // transactional email (utils/orderEvents.js), and each attempt writes a
    // durable dedupe record keyed on the order - including when Brevo is
    // unconfigured, where the record is written as "skipped" precisely so an
    // operator can see which emails a deployment did not send. Deleting the
    // order and the user without these left records pointing at rows that no
    // longer exist.
    const EmailDelivery = require("../models/EmailDelivery");
    const ed = await EmailDelivery.deleteMany({
      $or: [{ order_id: { $in: made.orders } }, { user_id: { $in: made.users } }],
    });
    const n = await Notification.deleteMany({ order_id: { $in: made.orders } });
    const o = await Order.deleteMany({ _id: { $in: made.orders } });
    const s = await Shop.deleteMany({ _id: { $in: made.shops } });
    const d = await DeviceToken.deleteMany({ token: { $in: made.tokens } });
    await Session.deleteMany({ _id: { $in: made.sessions } });
    // Support conversations created by the regression check above.
    const Conversation = require("../models/Conversation");
    const Message = require("../models/Message");
    const convos = await Conversation.find({ customer_id: { $in: made.users } }).select("_id").lean();
    await Message.deleteMany({ conversation_id: { $in: convos.map((c) => c._id) } });
    await Conversation.deleteMany({ _id: { $in: convos.map((c) => c._id) } });
    await Notification.deleteMany({ user_id: { $in: made.users } });
    const u = await User.deleteMany({ _id: { $in: made.users } });
    console.log(
      `removed ${o.deletedCount} order(s), ${s.deletedCount} shop(s), ${u.deletedCount} user(s), ${n.deletedCount}+ notification(s), ${d.deletedCount} device token(s), ${ed.deletedCount} email record(s)`
    );
  } catch (error) {
    console.error(`cleanup failed: ${error.message}`);
  }
  await mongoose.disconnect();
}

main()
  .catch((error) => {
    console.error("\norderEventsTest crashed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await cleanup();
    setTimeout(() => process.exit(process.exitCode || 0), 150);
  });
