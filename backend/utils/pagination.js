// Shared limit/skip parsing for every list route that can grow without
// bound: the customer's own orders, a vendor's shop orders
// (controllers/orderController.js) and the platform-wide admin lists
// (controllers/adminController.js).
//
// Deliberately kept as optional ?limit/?skip query params over a plain
// array response rather than an envelope like { orders, total, page }:
// every existing caller (both frontends, and scripts/e2eTest.js) reads
// these responses as arrays, and changing that shape would be a contract
// break. A client that sends nothing still gets an array, just a capped
// one.
//
// DEFAULT_LIMIT is high enough that no realistic current caller notices
// it, while still bounding a query that would otherwise return an entire
// collection on every request. MAX_LIMIT stops a client asking for
// everything in one go.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parsePagination(query) {
  const rawLimit = Number.parseInt(query.limit, 10);
  const rawSkip = Number.parseInt(query.skip, 10);

  // NaN (absent or non-numeric) falls back to the default rather than
  // erroring - these are optional refinements to a working request, not
  // required parameters, so a junk value shouldn't fail the whole call.
  const limit = Number.isNaN(rawLimit) ? DEFAULT_LIMIT : Math.min(Math.max(rawLimit, 1), MAX_LIMIT);
  const skip = Number.isNaN(rawSkip) || rawSkip < 0 ? 0 : rawSkip;

  return { limit, skip };
}

module.exports = { parsePagination, DEFAULT_LIMIT, MAX_LIMIT };
