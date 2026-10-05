const Settings = require("../models/Settings");

// Settings is a singleton - there should only ever be one document. This
// creates it with schema defaults the first time anything asks for it, so
// there is no separate seed script to run.
//
// Settings' rate_per_page_bw/color, paper_size_rates, sides_extra_rate
// and service_rates are no longer read by any order pricing calculation -
// pricing is now per-shop (see Shop.pricing in models/Shop.js). Those
// fields still exist here for exactly one purpose: seeding a new shop's
// own pricing at POST /shops (see createShop in shopController.js), after
// which the two are completely independent. platform_fee_type/value are
// the only fields from this document still used directly in an order's
// price - see computePlatformFee below.
//
// CACHED, because this one document is read on nearly every pricing path
// (POST /orders, POST /shops/compare-pricing - once per request, not per
// shop - GET /pricing-config, and every queue/rush lookup via
// utils/queue.js's rushLevelFor thresholds) while changing approximately
// never: nothing in this codebase writes Settings at all. There is no
// admin route for it, by design - the only way it changes today is a
// human editing the document directly in the database, which is exactly
// why this is a short TTL rather than a cache-forever, and why there is
// no invalidate-on-write hook to add (there are no writes to hook).
//
// A stale window of up to TTL seconds means a hand-edited platform fee
// takes at most that long to take effect. That is an acceptable trade for
// dropping a database round-trip from every order placed; anything
// longer would make manual tuning genuinely confusing to test.
const SETTINGS_CACHE_TTL_MS = 60 * 1000;
let cachedSettings = null;
let cachedSettingsAt = 0;

async function getPricingSettings() {
  if (cachedSettings && Date.now() - cachedSettingsAt < SETTINGS_CACHE_TTL_MS) {
    return cachedSettings;
  }

  let settings = await Settings.findOne();
  if (!settings) {
    settings = await Settings.create({});
  }

  cachedSettings = settings;
  cachedSettingsAt = Date.now();
  return settings;
}

// Drops the cache above. Nothing in the app calls this today (nothing
// writes Settings - see the comment above); it exists so that whenever a
// real admin route for editing Settings does get built, the one-line fix
// is already here and obvious, rather than that route silently serving
// its own stale values for a minute after saving.
function invalidatePricingSettingsCache() {
  cachedSettings = null;
  cachedSettingsAt = 0;
}

// Every charge below is computed for ONE document, from that document's
// own settings - print settings are per-document, not per-order (see
// utils/orderDocuments.js). The order-level totals are the sums of these,
// never a separate calculation, so a bill always adds up to its own line
// items.

// base = this document's pages x its copies x the rate for ITS colour
// mode, using the ORDERING SHOP's own pricing (shop.pricing), not the
// global Settings document.
function computeDocumentBase({ pageCount, copies, colorMode, shopPricing }) {
  const ratePerPage = colorMode === "color" ? shopPricing.rate_per_page_color : shopPricing.rate_per_page_bw;
  return pageCount * copies * ratePerPage;
}

// Paper size surcharge scales the same way base does - per physical
// sheet printed (pages x copies) - since a bigger sheet costs more
// regardless of colour mode. A4 defaults to 0 (no surcharge).
function computeDocumentPaperCharge({ pageCount, copies, paperSize, shopPricing }) {
  const rate = shopPricing.paper_size_rates?.[paperSize] ?? 0;
  return pageCount * copies * rate;
}

// Double-sided scales per physical page printed (pages x copies), the
// same way the paper size charge does, at the flat rate this shop set.
//
// It used to be a percentage of this document's base, which coupled two
// prices that have nothing to do with each other: printing a colour page
// duplex is not four times the extra work of a B&W one, yet at 20% of
// base it was charged as though it were. A flat per-page amount is what
// the vendor can actually reason about, and it no longer moves when they
// change their per-page rate.
//
// Note it no longer depends on `base` at all - colour mode does not
// affect it.
function computeDocumentSidesCharge({ pageCount, copies, sides, shopPricing }) {
  if (sides !== "double") return 0;
  return round2(pageCount * copies * (shopPricing.sides_extra_rate ?? 0));
}

// Finishing services are flat per DOCUMENT - counted once each for the
// document that asked for them, regardless of its page count or copies.
// Two documents that each want binding are two things to bind, and are
// charged twice.
//
// `services` is the RESOLVED snapshot array - [{ service_id, name, rate }]
// already matched against this shop's own service list by
// utils/shopServices.js. The rate summed here therefore always came from
// the shop's own pricing at resolve time, never from client input: a
// caller that hands this function a client-supplied rate has skipped the
// resolution step, which is the bug, not this sum.
function computeDocumentServicesCharge({ services }) {
  if (!Array.isArray(services)) return 0;
  return services.reduce((total, service) => total + (service.rate || 0), 0);
}

// One document's complete breakdown. Returned per document (stored on the
// order for display) as well as summed into the order totals.
function computeDocumentPricing({ pageCount, settings, shopPricing }) {
  const base = computeDocumentBase({
    pageCount,
    copies: settings.copies,
    colorMode: settings.color_mode,
    shopPricing,
  });
  const paper_charge = computeDocumentPaperCharge({
    pageCount,
    copies: settings.copies,
    paperSize: settings.paper_size,
    shopPricing,
  });
  const sides_charge = computeDocumentSidesCharge({
    pageCount,
    copies: settings.copies,
    sides: settings.sides,
    shopPricing,
  });
  const services_charge = computeDocumentServicesCharge({ services: settings.services });

  return {
    base,
    paper_charge,
    sides_charge,
    services_charge,
    document_total: round2(base + paper_charge + sides_charge + services_charge),
  };
}

// Rounds to 2 decimal places. Still needed after the move off
// percentages: a flat rate can be fractional too (0.4 x 3 pages is
// 1.2000000000000002 in binary floating point), and the platform fee can
// still be a percentage.
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Flat fee is a fixed rupee amount; percentage fee is a % of whatever
// pre-fee amount is passed in, rounded to 2 decimal places to avoid
// floating-point cents. Callers pass the FULL pre-fee total (base
// subtotal + paper size + sides + services), not just the page-based
// subtotal alone, so the platform's percentage cut scales with the whole
// order rather than shrinking as a proportion once add-ons are involved.
//
// This is the ONE price component still read from the global Settings
// document, deliberately - platform_fee is the platform's own commission,
// not a per-shop decision, so it stays out of Shop.pricing entirely (no
// vendor route can read or set it).
function computePlatformFee(preFeeTotal, settings) {
  if (settings.platform_fee_type === "percentage") {
    return Math.round(preFeeTotal * (settings.platform_fee_value / 100) * 100) / 100;
  }
  return settings.platform_fee_value;
}

// Full order price breakdown in one call - shared by POST /orders
// (orderController.js) and POST /shops/compare-pricing
// (shopController.js) so the two can never drift apart.
//
// `documents` is [{ page_count, ...normalized settings }] - each priced
// on its own, then summed. The order-level figures keep the exact names
// and meaning they had when settings were order-wide (base_subtotal,
// paper_size_charge, sides_charge, services_charge, platform_fee,
// total_amount), so every existing consumer of an order's bill still
// works; they are now sums across documents rather than one calculation.
//
// `documents` in the RESULT carries each document's own breakdown, for
// showing an itemized-per-file bill.
//
// Every rate comes from `shopPricing` (the specific shop being priced)
// except platform_fee, which alone still comes from the global Settings
// document (`settings`) - see computePlatformFee's own comment for why.
//
// Callers are expected to have already checked
// findUnsupportedDocumentService themselves (the right response differs
// by caller) - this function doesn't re-check, it just charges the shop's
// rate for whatever each document says to charge.
function computeOrderPricing({ documents, shopPricing, settings }) {
  const priced = documents.map((doc) => ({
    ...doc,
    pricing: computeDocumentPricing({ pageCount: doc.page_count, settings: doc, shopPricing }),
  }));

  const base_subtotal = round2(priced.reduce((sum, d) => sum + d.pricing.base, 0));
  const paper_size_charge = round2(priced.reduce((sum, d) => sum + d.pricing.paper_charge, 0));
  const sides_charge = round2(priced.reduce((sum, d) => sum + d.pricing.sides_charge, 0));
  const services_charge = round2(priced.reduce((sum, d) => sum + d.pricing.services_charge, 0));

  // The platform fee (when percentage-based) is taken on the whole
  // pre-fee amount, not just base_subtotal, so it scales with the full
  // order rather than shrinking as a proportion once add-ons are involved.
  const preFeeTotal = round2(base_subtotal + paper_size_charge + sides_charge + services_charge);
  const platform_fee = computePlatformFee(preFeeTotal, settings);
  const total_amount = round2(preFeeTotal + platform_fee);

  return {
    documents: priced,
    base_subtotal,
    paper_size_charge,
    sides_charge,
    services_charge,
    platform_fee,
    total_amount,
  };
}

module.exports = {
  getPricingSettings,
  invalidatePricingSettingsCache,
  computeDocumentPricing,
  computePlatformFee,
  computeOrderPricing,
};
