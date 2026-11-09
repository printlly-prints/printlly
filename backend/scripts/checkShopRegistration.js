const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
process.env.JWT_SECRET = crypto.randomBytes(32).toString("hex");
const User = require("../models/User");
const Shop = require("../models/Shop");
const router = require("../routes/shopRoutes");
const { validateShopLocation } = require("../utils/shopLocation");
const {
  mapDetails,
  resolveGoogleMapsLink,
  validGoogleMapsUrl,
  validGoogleMapsEmbedUrl,
} = require("../utils/googleMapsLink");

async function check() {
  const database = `paprout_shop_check_${crypto.randomBytes(8).toString("hex")}`;
  let server,
    calls = 0;
  const nativeFetch = global.fetch;
  const place =
    "https://www.google.com/maps/place/Test+Shop/@1,2,12z/data=!4m2!3d30.25!4d77.95";
  global.fetch = async (url, options) => {
    calls++;
    assert.equal(options.redirect, "manual");
    const location =
      new URL(url).pathname === "/evil" ? "http://127.0.0.1/private" : place;
    return new Response(null, { status: 302, headers: { location } });
  };
  try {
    assert.deepEqual(
      validateShopLocation({ latitude: 0, longitude: 0 }).location.coordinates,
      [0, 0],
    );
    for (const fields of [
      { latitude: "30", longitude: 78 },
      { latitude: 91, longitude: 78 },
      { latitude: 30 },
      { latitude: 30, longitude: Infinity },
      { latitude: 30, longitude: 78, locality: {} },
    ])
      assert(validateShopLocation(fields).error);
    assert.equal(validateShopLocation({}, false).error, undefined);
    assert.equal(mapDetails(place).latitude, 30.25);
    assert.equal(mapDetails(place).longitude, 77.95);
    assert.equal(
      mapDetails("https://www.google.com/maps/place/Camera/@30,78,15z")
        .latitude,
      undefined,
      "Camera center is not an exact shop pin",
    );
    const embed =
      '<iframe src="https://www.google.com/maps/embed?pb=!1m18!2d77.9!3d30.2"></iframe>';
    assert.match(mapDetails(embed).google_maps_embed_url, /maps\/embed/);
    assert.equal(
      mapDetails(embed).latitude,
      undefined,
      "Do not claim an embed viewport is an exact pin",
    );
    for (const value of [
      "https://evil.test/maps",
      "javascript:alert(1)",
      "http://www.google.com/maps",
      "https://www.google.com@evil.test/maps",
      "https://www.google.com/url?q=http://127.0.0.1",
      "https://www.google.com/maps?key=SECRET",
      0,
      embed,
    ])
      assert.equal(validGoogleMapsUrl(value), false);
    assert.equal(validGoogleMapsEmbedUrl(place), false);
    assert.equal(
      validGoogleMapsEmbedUrl(mapDetails(place).google_maps_embed_url),
      true,
    );
    assert.equal(
      (await resolveGoogleMapsLink("https://maps.app.goo.gl/shop")).latitude,
      30.25,
    );
    assert.equal(calls, 1);
    await assert.rejects(resolveGoogleMapsLink("https://maps.app.goo.gl/evil"));
    assert.equal(
      calls,
      2,
      "Do not follow a short-link redirect to a non-Google host",
    );
    await mongoose.connect(`mongodb://127.0.0.1:27017/${database}`);
    const owner = new mongoose.Types.ObjectId(),
      legacyOwner = new mongoose.Types.ObjectId(),
      customer = new mongoose.Types.ObjectId();
    await User.collection.insertMany([
      {
        _id: owner,
        role: "shop_owner",
        name: "Fixture owner",
        email: "owner@shop.test",
      },
      {
        _id: legacyOwner,
        role: "shop_owner",
        name: "Legacy fixture",
        email: "legacy@shop.test",
      },
      {
        _id: customer,
        role: "customer",
        name: "Customer fixture",
        email: "customer@shop.test",
      },
    ]);
    const app = express();
    app.use(express.json());
    app.use("/shops", router);
    server = await new Promise((resolve) => {
      const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    });
    const base = `http://127.0.0.1:${server.address().port}/shops`;
    async function request(
      path,
      method = "GET",
      body,
      identity = owner,
      role = "shop_owner",
    ) {
      const headers = { "Content-Type": "application/json" };
      if (identity)
        headers.Authorization = `Bearer ${jwt.sign({ id: String(identity), role }, process.env.JWT_SECRET, { expiresIn: "5m" })}`;
      const response = await nativeFetch(base + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: response.status, body: await response.json() };
    }
    const lookup = "/google-maps-preview";
    assert.equal(
      (await request(lookup, "POST", { url: place }, null)).status,
      401,
    );
    assert.equal(
      (await request(lookup, "POST", { url: place }, customer, "customer"))
        .status,
      403,
    );
    assert.equal(
      (await request(lookup, "POST", { url: "https://evil.test" })).status,
      400,
    );
    const preview = await request(lookup, "POST", { url: place });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.latitude, 30.25);
    assert.equal(
      preview.body.address,
      "",
      "Do not invent a full street address from a business name",
    );
    const details = {
      shop_name: " Fixture shop ",
      address: "Confirmed street address",
      google_maps_url: preview.body.google_maps_url,
      google_maps_embed_url: preview.body.google_maps_embed_url,
      contact: "9000000000",
      latitude: 0,
      longitude: 0,
      locality: " Test city ",
    };
    assert.equal(
      (await request("", "POST", { ...details, longitude: 181 })).status,
      400,
    );
    assert.equal(
      await Shop.countDocuments({ owner_id: owner }),
      0,
      "Invalid registration must not create a partial shop",
    );
    assert.equal(
      (await request("", "POST", { ...details, shop_name: "   " })).status,
      400,
    );
    const created = await request("", "POST", details);
    assert.equal(created.status, 201);
    assert.deepEqual(created.body.location.coordinates, [0, 0]);
    assert.equal(created.body.address, "Confirmed street address");
    assert.equal(created.body.google_maps_url, place);
    assert.equal(created.body.locality, "Test city");
    await Shop.updateOne({ _id: created.body._id }, { verification_status: 'approved' });
    const publicDetails = await request('/'+created.body._id, 'GET', undefined, customer, 'customer');
    assert.equal(publicDetails.status, 200);
    assert.equal(publicDetails.body.google_maps_url, details.google_maps_url);
    assert.equal(publicDetails.body.google_maps_embed_url, details.google_maps_embed_url);
    assert.equal(publicDetails.body.kyc, undefined);
    assert.equal((await request("", "POST", details)).status, 409);
    const moved = await request("/me/location", "PATCH", {
      latitude: 30,
      longitude: 78,
      address: "New detected address",
      locality: "Area",
    });
    assert.equal(moved.status, 200);
    const saved = await Shop.findOne({ owner_id: owner }).lean();
    assert.deepEqual(saved.location.coordinates, [78, 30]);
    assert.equal(saved.address, "New detected address");
    assert.equal(
      (
        await request("/me/location", "PATCH", {
          latitude: 30,
          longitude: 78,
          address: " ",
        })
      ).status,
      400,
    );
    const legacy = await request(
      "",
      "POST",
      {
        shop_name: "Legacy fixture",
        address: "Existing address flow",
        contact: "9000000001",
      },
      legacyOwner,
    );
    assert.equal(legacy.status, 201);
    assert.equal(legacy.body.location, undefined);
    const wrongLink = await request("/me/location", "PATCH", {
      google_maps_url: "https://evil.test",
      address: "No",
    });
    assert.equal(wrongLink.status, 400);
    const freeLink = await request("/me/location", "PATCH", {
      google_maps_url: place,
      google_maps_embed_url: preview.body.google_maps_embed_url,
      address: "Confirmed Google address",
    });
    assert.equal(freeLink.status, 200);
    const afterLink = await Shop.findOne({ owner_id: owner }).lean();
    assert.equal(
      afterLink.location,
      undefined,
      "An opaque new link must not keep a stale old pin",
    );
    console.log(
      "Shop setup: Google links/embeds, short-link redirect safety, no invented coordinates/address, auth, atomic saves and legacy compatibility passed.",
    );
  } finally {
    global.fetch = nativeFetch;
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      assert.equal(mongoose.connection.name, database);
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
}
check().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
