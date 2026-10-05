const Shop = require("../models/Shop");

// Shared by GET /shops and POST /shops/compare-pricing, so a customer's
// text search and "near me" sort behave identically on both screens.

// A search box is user input: an unescaped "(" or "*" would otherwise throw
// a regex parse error, or with a pathological pattern burn CPU.
function escapeRegex(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Case-insensitive substring match on the three fields a customer would
// type ("Graphic Era" matches a locality of "Near Graphic Era University").
// A plain regex rather than a $text index: $text matches whole words only,
// so "Graph" wouldn't find "Graphic", and $text can't be combined with
// $geoNear in the same query anyway.
function buildSearchFilter(search) {
  const trimmed = typeof search === "string" ? search.trim() : "";
  if (!trimmed) return {};
  const regex = { $regex: escapeRegex(trimmed), $options: "i" };
  return { $or: [{ shop_name: regex }, { address: regex }, { locality: regex }] };
}

// Parses an optional lat/lng pair. Returns:
//   { point: null }                - neither given (no distance sorting)
//   { point: { lat, lng } }        - both given and in range
//   { error: "..." }               - only one given, or not valid numbers
// Accepts numbers or numeric strings, since GET /shops receives them as
// query-string text and POST /shops/compare-pricing as JSON.
function parseGeoPoint(latInput, lngInput) {
  const latMissing = latInput === undefined || latInput === null || latInput === "";
  const lngMissing = lngInput === undefined || lngInput === null || lngInput === "";
  if (latMissing && lngMissing) return { point: null };
  if (latMissing || lngMissing) return { error: "lat and lng must be provided together" };

  const lat = Number(latInput);
  const lng = Number(lngInput);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return { error: "lat must be a number between -90 and 90" };
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return { error: "lng must be a number between -180 and 180" };
  }
  return { point: { lat, lng } };
}

function toKm(meters) {
  return Math.round(meters / 100) / 10; // one decimal place
}

// Great-circle distance for a single already-loaded shop, rounded the same
// way as $geoNear results. For routes that can't use $geoNear (e.g. GET
// /saved-shops, which starts from SavedShop, not Shop). null when the shop
// has no location.
const EARTH_RADIUS_M = 6378137; // the radius MongoDB's spherical $geoNear uses

function distanceKmTo(point, shop) {
  const coordinates = shop?.location?.coordinates;
  if (!point || !Array.isArray(coordinates) || coordinates.length !== 2) return null;
  const [lng, lat] = coordinates;
  const rad = (deg) => (deg * Math.PI) / 180;
  const dLat = rad(lat - point.lat);
  const dLng = rad(lng - point.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(point.lat)) * Math.cos(rad(lat)) * Math.sin(dLng / 2) ** 2;
  return toKm(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
}

// Loads the shops matching `filter`, with only the `select` fields.
//
// Without a point: a plain find(), in the default order - exactly the
// behaviour GET /shops had before. Each entry's distance_km is undefined.
//
// With a point: shops that have a location come first, nearest first, via
// $geoNear; shops that never set a location follow, in default order, with
// distance_km null. They're appended rather than dropped - hiding a shop
// just because its vendor hasn't pinned it yet would make it vanish from
// search the moment a customer allows location access.
//
// Always returns HYDRATED Shop documents (Shop.hydrate on the aggregation
// output), never raw aggregation objects: legacy shop documents rely on
// Mongoose schema defaults (is_open, pricing - see models/Shop.js), which
// raw aggregation results don't get.
async function findListedShops({ filter, select, point }) {
  if (!point) {
    const shops = await Shop.find(filter).select(select);
    return shops.map((shop) => ({ shop, distance_km: undefined }));
  }

  const fieldProjection = { _id: 1 };
  for (const field of select.split(/\s+/).filter(Boolean)) fieldProjection[field] = 1;
  const projection = { ...fieldProjection, distance_m: 1 };

  const nearby = await Shop.aggregate([
    {
      // Must be the first stage. `query` applies the same filter a plain
      // find() would, so search + geo sort combine correctly.
      $geoNear: {
        near: { type: "Point", coordinates: [point.lng, point.lat] },
        key: "location",
        distanceField: "distance_m",
        spherical: true,
        query: filter,
      },
    },
    { $project: projection },
  ]);

  const located = nearby.map(({ distance_m, ...raw }) => ({
    // The projection argument makes hydrate behave like find().select():
    // defaults are only backfilled for the selected paths, so unselected
    // ones (verification_status, kyc...) don't appear with default values.
    shop: Shop.hydrate(raw, fieldProjection),
    distance_km: toKm(distance_m),
  }));

  const unlocated = await Shop.find({ ...filter, "location.coordinates": { $exists: false } }).select(select);

  return [...located, ...unlocated.map((shop) => ({ shop, distance_km: null }))];
}

module.exports = { escapeRegex, buildSearchFilter, parseGeoPoint, findListedShops, distanceKmTo };
