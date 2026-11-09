const assert = require("node:assert/strict"),
  fs = require("node:fs/promises"),
  os = require("node:os"),
  path = require("node:path"),
  crypto = require("node:crypto");
const express = require("express"),
  mongoose = require("mongoose"),
  jwt = require("jsonwebtoken");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
process.env.LOCAL_SHOP_PHOTOS = "true";
process.env.NODE_ENV = "development";
const {
  mountLocalShopPhotos,
  localShopPhotosEnabled,
} = require("../utils/localShopPhotos");
const Shop = require("../models/Shop"),
  User = require("../models/User"),
  router = require("../routes/shopRoutes");
const database = "paprout_photo_check_" + crypto.randomBytes(6).toString("hex");
let server, directory;
(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "paprout-photo-check-"));
  process.env.LOCAL_SHOP_PHOTO_DIR = directory;
  process.env.NODE_ENV = "production";
  assert.equal(localShopPhotosEnabled(), false);
  process.env.NODE_ENV = "development";
  await mongoose.connect("mongodb://127.0.0.1:27017/" + database);
  const owner = (
    await User.create({
      name: "Fixture owner",
      email: "photo@example.test",
      phone: "9000000000",
      password_hash: "fixture-only",
      role: "shop_owner",
    })
  )._id;
  const shop = await Shop.create({
    owner_id: owner,
    shop_name: "Fixture only",
    contact: "9000000000",
    address: "Fixture address",
  });
  const token = jwt.sign(
    { id: String(owner), role: "shop_owner" },
    process.env.JWT_SECRET,
  );
  const app = express();
  mountLocalShopPhotos(app);
  app.use("/shops", router);
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=",
    "base64",
  );
  async function upload(files, auth = token) {
    const body = new FormData();
    for (const [field, bytes] of files)
      body.append(
        field,
        new Blob([bytes], { type: "image/png" }),
        "../../original.png",
      );
    const r = await fetch(base + "/shops/me/photos", {
      method: "POST",
      headers: auth ? { Authorization: "Bearer " + auth } : {},
      body,
    });
    return { status: r.status, body: await r.json() };
  }
  assert.equal((await upload([["shop_photo", png]], null)).status, 401);
  assert.equal(
    (await upload([["shop_photo", Buffer.from("<script>bad</script>")]]))
      .status,
    400,
  );
  const first = await upload([["shop_photo", png]]);
  assert.equal(first.status, 200);
  assert.match(
    first.body.shop_photo_url,
    /\/media\/shops\/[a-f0-9-]{36}\.png$/,
  );
  const photo = await fetch(first.body.shop_photo_url);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get("content-type"), "image/png");
  assert.equal(
    photo.headers.get("cross-origin-resource-policy"),
    "cross-origin",
  );
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  assert.equal(
    (
      await upload([
        ["owner_photo", png],
        ["shop_photo", Buffer.from("bad")],
      ])
    ).status,
    400,
  );
  assert.equal(
    (await Shop.findById(shop._id)).shop_photo_url,
    first.body.shop_photo_url,
  );
  assert.equal((await fs.readdir(directory)).length, 1);
  const second = await upload([["shop_photo", png]]);
  assert.equal(second.status, 200);
  assert.equal((await fetch(first.body.shop_photo_url)).status, 404);
  assert.equal((await fetch(second.body.shop_photo_url)).status, 200);
  assert.equal((await fs.readdir(directory)).length, 1);
  assert.equal((await fetch(base + "/media/shops/package.json")).status, 404);
  console.log(
    "Local shop-photo checks passed: authenticated upload, PNG content validation, public image response, safe filenames, replacement cleanup, rollback and production disabled.",
  );
})()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (server) await new Promise((r) => server.close(r));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
    if (directory) {
      assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
      assert(path.basename(directory).startsWith("paprout-photo-check-"));
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
