const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const sharp = require("sharp");
const { PDFDocument } = require("pdf-lib");

process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.NODE_ENV = "development";
process.env.LOCAL_DOCUMENTS = "true";
const User = require("../models/User");
const Shop = require("../models/Shop");
const Upload = require("../models/Upload");
const { deleteUploadDocument } = require("../utils/documentCleanup");
const {
  localDocumentsEnabled,
  readLocalDocument,
} = require("../utils/localDocuments");
const database = "paprout_doc_check_" + crypto.randomBytes(6).toString("hex");
let server, directory;

async function check() {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "paprout-doc-check-"));
  process.env.LOCAL_DOCUMENT_DIR = directory;
  process.env.NODE_ENV = "production";
  assert.equal(localDocumentsEnabled(), false);
  process.env.NODE_ENV = "development";
  await mongoose.connect("mongodb://127.0.0.1:27017/" + database);
  const account = async (label, role, phone) =>
    User.create({
      name: label,
      email: label + "@example.test",
      role,
      phone,
      password_hash: "fixture-only",
    });
  const [customer, other, vendor] = await Promise.all([
    account("customer", "customer", "9000000010"),
    account("other", "customer", "9000000011"),
    account("owner", "shop_owner", "9000000012"),
  ]);
  const shop = await Shop.create({
    owner_id: vendor._id,
    shop_name: "Fixture only",
    address: "Fixture address",
    contact: vendor.phone,
    verification_status: "approved",
    is_open: true,
  });
  const token = (user) =>
    jwt.sign(
      { id: String(user._id), role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "5m" },
    );
  const app = express();
  app.use(express.json());
  app.use("/upload", require("../routes/uploadRoutes"));
  app.use("/orders", require("../routes/orderRoutes"));
  app.use("/auth", require("../routes/authRoutes"));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const request = (route, { user, method = "GET", body } = {}) =>
    fetch(base + route, {
      method,
      headers: {
        ...(user ? { Authorization: "Bearer " + token(user) } : {}),
        ...(body && !(body instanceof FormData)
          ? { "Content-Type": "application/json" }
          : {}),
      },
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
  const pdf = await PDFDocument.create();
  pdf.addPage();
  pdf.addPage();
  const jpg = await sharp({
    create: { width: 120, height: 80, channels: 3, background: "#007c9c" },
  })
    .jpeg()
    .toBuffer();
  const png = await sharp(jpg).png().toBuffer();
  const form = new FormData();
  for (const [bytes, mime, name] of [
    [await pdf.save(), "application/pdf", "two-pages.pdf"],
    [jpg, "image/jpeg", "photo.jpg"],
    [jpg, "image/jpeg", "photo.jpeg"],
    [png, "image/png", "image.png"],
    [Buffer.from("invalid"), "image/jpeg", "fake.jpg"],
  ])
    form.append("documents", new Blob([bytes], { type: mime }), name);
  assert.equal(
    (await request("/upload", { method: "POST", body: form })).status,
    401,
  );
  const upload = await request("/upload", {
    user: customer,
    method: "POST",
    body: form,
  });
  assert.equal(upload.status, 201);
  const { succeeded, failed } = await upload.json();
  assert.deepEqual(
    succeeded.map((item) => item.page_count),
    [2, 1, 1, 1],
  );
  assert.equal(failed.length, 1);
  assert.equal((await fs.readdir(directory)).length, 4);
  await assert.rejects(readLocalDocument("local-document:../unauthorized.pdf"));
  const orderResponse = await request("/orders", {
    user: customer,
    method: "POST",
    body: {
      shop_id: String(shop._id),
      documents: succeeded.map((item) => ({
        upload_id: item.upload_id,
        page_count: 99,
        copies: 1,
        color_mode: "bw",
        paper_size: "A4",
        sides: "single",
        services: [],
      })),
    },
  });
  const order = await orderResponse.json();
  assert.equal(orderResponse.status, 201, order.message);
  assert.deepEqual(
    order.documents.map((item) => item.page_count),
    [2, 1, 1, 1],
  );
  const view = "/orders/" + order._id + "/documents/1/view";
  assert.equal((await request(view)).status, 401);
  assert.equal((await request(view, { user: other })).status, 403);
  const preview = await request(view, { user: vendor });
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get("cache-control"), "private, no-store");
  assert.equal(
    (await PDFDocument.load(await preview.arrayBuffer())).getPageCount(),
    1,
  );
  const profile = await request("/auth/me", {
    user: customer,
    method: "PATCH",
    body: { name: "Updated fixture", gender: "female", role: "admin" },
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).user.role, "customer");
  assert.equal((await User.findById(customer._id)).gender, "female");
  assert.equal(
    (
      await request("/auth/me", {
        user: vendor,
        method: "PATCH",
        body: { name: "Fixture", gender: "male" },
      })
    ).status,
    403,
  );
  for (const item of succeeded)
    assert.equal(await deleteUploadDocument(item.upload_id), "deleted");
  assert.equal(await Upload.countDocuments(), 0);
  assert.equal((await fs.readdir(directory)).length, 0);
  assert.equal((await request(view, { user: vendor })).status, 410);
  console.log(
    "Local print checks passed for mixed PDFs and images, private viewing, pricing page counts, cleanup and customer profile saving.",
  );
}

check()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
    if (directory) {
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
      assert(path.basename(directory).startsWith("paprout-doc-check-"));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
