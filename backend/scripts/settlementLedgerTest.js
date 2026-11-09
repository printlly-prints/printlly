// Tests the daily settlement ledger, vendor activity logs and the admin order
// trace over real HTTP routes.
//
// Uses its own local database, which it drops on the way out, and never reads
// backend/.env, so it cannot reach production data. Email is stubbed before
// the routes load.
//
// Run with: node scripts/settlementLedgerTest.js   (local mongod must be running)
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const DB_URI = "mongodb://127.0.0.1:27017/printlly_ledger_test";
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
require("../utils/email").sendTransactionalEmail = async () => ({ outcome: "skipped" });

const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const Session = require("../models/Session");
const Settlement = require("../models/Settlement");
const { markOrderPaid } = require("../utils/paymentConfirmation");

let pass = 0;
let fail = 0;
const check = (ok, label, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail !== "" ? ` -> ${JSON.stringify(detail)}` : ""}`);
};

let baseUrl;
async function api(method, path, { token, body } = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

let seq = 0;
async function makeUser(role) {
  seq += 1;
  const user = await User.create({
    name: `Ledger ${role} ${seq}`,
    email: `ledger.${role}.${seq}@example.com`,
    phone: `20000000${String(seq).padStart(2, "0")}`,
    password_hash: "not-a-real-hash",
    role,
  });
  const jti = crypto.randomBytes(32).toString("hex");
  await Session.create({ _id: jti, user_id: user._id, expires_at: new Date(Date.now() + 3600000) });
  return { user, token: jwt.sign({ id: user._id, role, jti }, process.env.JWT_SECRET, { expiresIn: "1h" }) };
}

const makeShop = (owner, name) =>
  Shop.create({ owner_id: owner._id, shop_name: name, address: "1 Test Street", contact: "9000000000" });

function makeOrder(customer, shop, { vendorAmount = 95, status = "completed", paymentStatus = "paid", pages = 3, copies = 2 } = {}) {
  seq += 1;
  return Order.create({
    customer_id: customer._id,
    shop_id: shop._id,
    documents: [{
      upload_id: new mongoose.Types.ObjectId(),
      original_name: "notes.pdf",
      file_url: "https://res.cloudinary.invalid/notes.pdf",
      page_count: pages,
      color_mode: "bw",
      copies,
      pricing: { base: 95, document_total: 95 },
    }],
    base_subtotal: 95,
    platform_fee: 5,
    total_amount: 100,
    vendor_amount: paymentStatus === "paid" ? vendorAmount : undefined,
    status,
    payment_status: paymentStatus,
    otp: paymentStatus === "paid" ? "739164" : null,
    razorpay_order_id: `order_ledger_${seq}`,
  });
}

const refOf = (order) => `PL${String(order._id).slice(-6).toUpperCase()}`;

async function run() {
  const { user: customer, token: customerToken } = await makeUser("customer");
  const { user: ownerA, token: vendorToken } = await makeUser("shop_owner");
  const { user: ownerB } = await makeUser("shop_owner");
  const { token: adminToken, user: admin } = await makeUser("admin");

  const shopA = await makeShop(ownerA, "Alpha Prints");
  const shopB = await makeShop(ownerB, "Beta Prints");

  const first = await makeOrder(customer, shopA, { vendorAmount: 95 });
  const second = await makeOrder(customer, shopA, { vendorAmount: 45.5 });
  const accepted = await makeOrder(customer, shopA, { vendorAmount: 30, status: "accepted" });
  const unpaid = await makeOrder(customer, shopA, { status: "pending", paymentStatus: "created" });
  const otherShop = await makeOrder(customer, shopB, { vendorAmount: 20 });

  console.log("\n--- access ---");
  check((await api("GET", "/admin/settlements/ledger")).status === 401, "ledger needs a token");
  check((await api("GET", "/admin/settlements/ledger", { token: vendorToken })).status === 403, "vendor cannot read the ledger");
  check((await api("GET", `/admin/orders/${first._id}`, { token: customerToken })).status === 403, "customer cannot trace orders");
  check((await api("GET", "/shops/me/activity", { token: customerToken })).status === 403, "customer has no shop activity");

  console.log("\n--- ledger before settling ---");
  check((await api("GET", "/admin/settlements/ledger?date=not-a-date", { token: adminToken })).status === 400, "bad date refused");
  check((await api("GET", "/admin/settlements/ledger?date=2026-13-45", { token: adminToken })).status === 400, "impossible date refused");
  let ledger = await api("GET", "/admin/settlements/ledger", { token: adminToken });
  let alpha = ledger.data.rows.find((r) => r.shop_name === "Alpha Prints");
  check(ledger.status === 200, "ledger loads");
  check(alpha.pending_amount === 140.5 && alpha.pending_orders === 2, "pending counts only completed paid orders", alpha.pending_amount);
  check(alpha.next_cycle_amount === 30 && alpha.next_cycle_orders === 1, "paid in-progress order is next cycle");
  check(alpha.settled_total === 0, "nothing settled yet");
  check(ledger.data.totals.pending_amount === 160.5, "totals span all vendors", ledger.data.totals);

  console.log("\n--- settle ---");
  const settlePath = `/admin/settlements/shop/${shopA._id}/settle`;
  const notDone = await api("POST", settlePath, { token: adminToken, body: { order_ids: [String(accepted._id)] } });
  check(notDone.status === 400, "unfinished order cannot be settled");
  const wrongShop = await api("POST", settlePath, { token: adminToken, body: { order_ids: [String(otherShop._id)] } });
  check(wrongShop.status === 400, "another shop's order cannot be settled here");

  const settled = await api("POST", settlePath, {
    token: adminToken,
    body: { order_ids: [String(first._id)], reference_note: "UTR123" },
  });
  check(settled.status === 201 && settled.data.settlement.total_amount === 95, "settle records the amount");
  check(settled.data.remaining.pending_amount === 45.5, "remaining balance is reported", settled.data.remaining);
  check(settled.data.remaining.next_cycle_amount === 30, "next cycle is reported");
  const again = await api("POST", settlePath, { token: adminToken, body: { order_ids: [String(first._id)] } });
  check(again.status === 400, "an order cannot be settled twice");

  ledger = await api("GET", "/admin/settlements/ledger", { token: adminToken });
  alpha = ledger.data.rows.find((r) => r.shop_name === "Alpha Prints");
  check(alpha.pending_amount === 45.5 && alpha.pending_orders === 1, "unsettled balance stays pending");
  check(alpha.settled_in_period === 95 && alpha.settled_total === 95, "settled moves to today");
  check(alpha.pending_order_ids.length === 1 && alpha.pending_order_ids[0] === String(second._id), "only the remaining order is queued");

  const old = await api("GET", "/admin/settlements/ledger?date=2020-01-01", { token: adminToken });
  alpha = old.data.rows.find((r) => r.shop_name === "Alpha Prints");
  check(alpha.settled_in_period === 0 && alpha.settled_total === 95, "another date shows nothing settled that day");

  // 23:59 IST on 8 Nov is still 8 Nov, though it is 18:29 UTC.
  await Settlement.create({
    shop_id: shopB._id,
    order_ids: [otherShop._id],
    total_amount: 20,
    settled_by: admin._id,
    settled_at: new Date("2026-11-08T18:29:00Z"),
  });
  const beta = async (date) =>
    (await api("GET", `/admin/settlements/ledger?date=${date}`, { token: adminToken })).data.rows.find((r) => r.shop_name === "Beta Prints");
  check((await beta("2026-11-08")).settled_in_period === 20, "day boundary follows India time");
  check((await beta("2026-11-09")).settled_in_period === 0, "next IST day excludes it");

  console.log("\n--- vendor activity ---");
  const vendor = await api("GET", "/shops/me/activity", { token: vendorToken });
  const vendorJson = JSON.stringify(vendor.data);
  check(vendor.status === 200 && vendor.data.orders.length === 3, "vendor sees only their paid orders", vendor.data.orders?.length);
  check(!vendor.data.orders.some((o) => o._id === String(unpaid._id)), "unpaid attempt is hidden");
  check(!vendor.data.orders.some((o) => o._id === String(otherShop._id)), "another shop's order is hidden");
  check(vendor.data.summary.total_requests === 3 && vendor.data.summary.printouts === 18, "requests and printouts add up", vendor.data.summary);
  check(vendor.data.summary.earned === 140.5, "earned counts completed orders");
  check(!vendorJson.includes("739164") && !vendorJson.includes('"otp"'), "pickup code never appears");
  check(!vendorJson.includes("razorpay") && !vendorJson.includes("platform_fee"), "audit fields are admin only");
  const row = vendor.data.orders.find((o) => o._id === String(first._id));
  check(row.customer.name === customer.name && row.items[0].name === "notes.pdf", "log says who sent what");
  check(row.settlement.reference_note === "UTR123", "vendor sees the payout reference");
  check(row.timeline[0].event === "placed" && row.timeline.at(-1).event === "settled", "order without history falls back to placed", row.timeline.map((e) => e.event));

  console.log("\n--- admin audit ---");
  const audit = await api("GET", `/admin/shops/${shopA._id}/activity`, { token: adminToken });
  const auditJson = JSON.stringify(audit.data);
  check(audit.status === 200 && audit.data.orders.length === 4, "admin also sees unpaid attempts");
  check(audit.data.balance.pending_amount === 45.5, "admin sees the balance");
  check(!auditJson.includes("739164") && !auditJson.includes('"otp"'), "pickup code never reaches admin logs");
  check(!auditJson.includes("password_hash"), "owner's password hash is excluded");
  check((await api("GET", "/admin/shops/nope/activity", { token: adminToken })).status === 400, "bad shop id refused");

  const trace = await api("GET", `/admin/orders/${first._id}`, { token: adminToken });
  check(trace.status === 200 && trace.data.shop.shop_name === "Alpha Prints", "trace names the shop");
  check(trace.data.settlement.settled_by_name === admin.name, "trace says who settled it");
  check(trace.data.razorpay_order_id === first.razorpay_order_id, "trace has the gateway id");
  check((await api("GET", "/admin/orders/nope", { token: adminToken })).status === 400, "bad order id refused");
  check((await api("GET", `/admin/orders/${new mongoose.Types.ObjectId()}`, { token: adminToken })).status === 404, "missing order is a 404");

  const found = await api("GET", `/admin/orders?ref=${refOf(second)}`, { token: adminToken });
  check(found.status === 200 && found.data.length === 1 && found.data[0]._id === String(second._id), "order found by the quoted reference");
  check((await api("GET", "/admin/orders?ref=PL%3B%24", { token: adminToken })).status === 400, "malformed reference refused");

  console.log("\n--- lifecycle events ---");
  await markOrderPaid(unpaid);
  const paid = await Order.findById(unpaid._id).lean();
  check(paid.timeline.some((e) => e.event === "paid" && e.actor === "system"), "payment writes the timeline");
  await markOrderPaid(await Order.findById(unpaid._id));
  const replayed = await Order.findById(unpaid._id).lean();
  check(replayed.timeline.filter((e) => e.event === "paid").length === 1, "a repeated confirmation is not logged twice");
}

(async () => {
  await mongoose.connect(DB_URI);
  await mongoose.connection.dropDatabase();

  const app = express();
  app.use(express.json());
  app.use("/admin", require("../routes/adminRoutes"));
  app.use("/shops", require("../routes/shopRoutes"));
  const server = await new Promise((resolve) => {
    const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    await run();
  } catch (error) {
    fail++;
    console.error(error);
  } finally {
    server.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
