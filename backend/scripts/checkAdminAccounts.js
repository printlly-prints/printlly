// Uses a temporary, isolated local database; never the application's database.
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const express = require("express");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
const User = require("../models/User");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const adminRouter = require("../routes/adminRoutes");

async function check() {
  const database = `paprout_account_check_${crypto.randomBytes(8).toString("hex")}`;
  let server;
  try {
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`, { serverSelectionTimeoutMS: 5000 });
    const id = () => new mongoose.Types.ObjectId();
    const admin = { _id: id(), role: "admin", name: "Test admin", email: "admin@accounts.test" };
    const vendors = [
      { _id: id(), role: "shop_owner", name: "Studio (North)", email: "north@accounts.test", phone: "9000000001" },
      { _id: id(), role: "shop_owner", name: "New owner", email: "new@accounts.test", phone: "9000000002" },
    ];
    const users = Array.from({ length: 27 }, (_, i) => ({ _id: id(), role: "customer", name: `Customer ${i}`, email: `user${i}@accounts.test`, phone: `910000${String(i).padStart(4, "0")}` }));
    await User.collection.insertMany([admin, ...vendors, ...users].map((row) => ({
      ...row, auth_provider: "local", createdAt: new Date(), password_hash: "PRIVATE_HASH", google_id: `PRIVATE_${row._id}`,
    })));
    await Shop.collection.insertOne({ _id: id(), owner_id: vendors[0]._id, shop_name: "North printing", address: "Test address", verification_status: "pending", is_active: true, payout: { bank_account_number: "PRIVATE_BANK" }, kyc: { id_proof_url: "PRIVATE_KYC" } });
    await Order.collection.insertMany([
      { _id: id(), customer_id: users[0]._id, status: "completed" },
      { _id: id(), customer_id: users[0]._id, status: "cancelled" },
    ]);

    const app = express();
    app.use("/admin", adminRouter);
    server = await new Promise((resolve) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
    const base = `http://127.0.0.1:${server.address().port}/admin/accounts`;
    const token = (account) => jwt.sign({ id: String(account._id), role: account.role }, process.env.JWT_SECRET, { expiresIn: "5m" });
    async function request(query, account = admin) {
      const response = await fetch(base + query, { headers: account ? { Authorization: `Bearer ${token(account)}` } : {} });
      return { status: response.status, body: await response.json() };
    }
    assert.equal((await request("?role=customer", null)).status, 401);
    assert.equal((await request("?role=customer", users[0])).status, 403);
    assert.equal((await request("?role=shop_owner", vendors[0])).status, 403);
    for (const query of ["", "?role=admin", "?role[$ne]=admin", "?role=customer&search[$ne]=x", `?role=customer&search=${"x".repeat(121)}`]) {
      assert.equal((await request(query)).status, 400, query);
    }

    const first = await request("?role=customer&limit=25");
    assert.equal(first.status, 200);
    assert.equal(first.body.total, 27);
    assert.equal(first.body.accounts.length, 25);
    assert(first.body.accounts.every((row) => row.role === "customer"));
    const second = (await request("?role=customer&limit=25&skip=25")).body;
    assert.equal(second.accounts.length, 2);
    assert(!second.accounts.some((row) => first.body.accounts.some((other) => other._id === row._id)));
    assert.equal((await request("?role=customer&limit=1000")).body.limit, 100);
    const empty = (await request("?role=customer&skip=999")).body;
    assert.equal(empty.total, 27);
    assert.deepEqual(empty.accounts, []);

    const orders = (await request("?role=customer&search=user0%40accounts.test")).body;
    assert.equal(orders.accounts.length, 1);
    assert.equal(orders.accounts[0].order_count, 2);
    const noOrders = (await request("?role=customer&search=user1%40accounts.test")).body;
    assert.equal(noOrders.accounts[0].order_count, 0);
    const phone = (await request("?role=shop_owner&search=9000000002")).body;
    assert.equal(phone.accounts.length, 1);
    assert.equal(phone.accounts[0].shop, null);
    const literal = (await request("?role=shop_owner&search=%28")).body;
    assert.equal(literal.accounts.length, 1);
    assert.equal(literal.accounts[0].name, "Studio (North)");
    assert.equal(literal.accounts[0].shop.shop_name, "North printing");
    assert.equal((await request("?role=shop_owner&search=NORTH%40ACCOUNTS.TEST")).body.total, 1);
    const vendorList = (await request("?role=shop_owner")).body;
    assert.equal(vendorList.total, 2);
    for (const row of [...first.body.accounts, ...second.accounts, ...vendorList.accounts]) {
      assert.deepEqual(Object.keys(row).sort(), ["_id", "auth_provider", "createdAt", "email", "name", "phone", "role", row.role === "customer" ? "order_count" : "shop"].sort());
      if (row.shop) assert.deepEqual(Object.keys(row.shop).sort(), ["_id", "owner_id", "shop_name", "address", "verification_status", "is_active"].sort());
    }
    console.log("Admin directories: access control, role isolation, literal search, pagination, order counts and private-field exclusion passed.");
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
}

check().catch((error) => { console.error(error); process.exitCode = 1; });
