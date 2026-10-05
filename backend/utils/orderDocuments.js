
// Print settings live PER DOCUMENT, not per order: one order can bundle a
// 40-page B&W handout printed single-sided with a 2-page colour A3 poster
// that needs laminating. Everything in here is the shared shape of one
// such document's settings, used identically by POST /orders
// (orderController.js) and POST /shops/compare-pricing
// (shopController.js) so a quoted price and a placed order can never
// disagree about what was asked for.

const COLOR_MODES = ["bw", "color"];
const PAPER_SIZES = ["A4", "A3"];
const SIDES = ["single", "double"];
// A document asking for more finishing services than a shop could
// plausibly list is a client bug, not a real order.
const MAX_SERVICES_PER_DOCUMENT = 20;

// Validates and normalizes ONE document's settings from client input.
// Returns { settings } or { error } - a message naming the document by
// its 1-based position, since "documents[1].copies must be..." means
// nothing to someone looking at a list of files.
//
// Only the known keys are ever read. Anything else in the object (a
// price, say) is dropped rather than trusted: as before, a client
// chooses WHAT gets printed, never what it costs.
function normalizeDocumentSettings(doc, index) {
  const label = `Document ${index + 1}`;

  if (!doc || typeof doc !== "object") {
    return { error: `${label} is missing its print settings` };
  }

  const { color_mode, copies, paper_size, sides, services } = doc;

  if (!COLOR_MODES.includes(color_mode)) {
    return { error: `${label}: color_mode must be 'bw' or 'color'` };
  }

  // Required rather than defaulted to 1: a missing copies count is far
  // more likely a client bug than an intent to print one copy, and
  // silently printing one is the kind of thing nobody notices until a
  // customer collects the wrong job.
  if (!Number.isInteger(copies) || copies < 1) {
    return { error: `${label}: copies must be a whole number of at least 1` };
  }

  const paperSize = paper_size || "A4";
  if (!PAPER_SIZES.includes(paperSize)) {
    return { error: `${label}: paper_size must be 'A4' or 'A3'` };
  }

  const sidesValue = sides || "single";
  if (!SIDES.includes(sidesValue)) {
    return { error: `${label}: sides must be 'single' or 'double'` };
  }

  // Services arrive as NAMES, not ids or fixed keys: shop service lists
  // are vendor-defined, and a customer comparing shops hasn't chosen one
  // yet, so there is no id they could know. Resolving a name to a
  // specific shop's service (and its rate) happens per shop, later - see
  // utils/shopServices.js.
  const requestedServices = services === undefined || services === null ? [] : services;
  if (!Array.isArray(requestedServices)) {
    return { error: `${label}: services must be an array of service names` };
  }
  if (!requestedServices.every((name) => typeof name === "string" && name.trim())) {
    return { error: `${label}: every requested service must be a non-empty name` };
  }
  if (requestedServices.length > MAX_SERVICES_PER_DOCUMENT) {
    return { error: `${label}: at most ${MAX_SERVICES_PER_DOCUMENT} services per document` };
  }

  // Asking for the same service twice would charge for it twice.
  const seen = new Set();
  for (const name of requestedServices) {
    const key = name.trim().toLowerCase();
    if (seen.has(key)) {
      return { error: `${label}: "${name.trim()}" is requested twice` };
    }
    seen.add(key);
  }

  return {
    settings: {
      color_mode,
      copies,
      paper_size: paperSize,
      sides: sidesValue,
      // Names as sent, trimmed. Turned into priced snapshots per shop.
      requested_services: requestedServices.map((name) => name.trim()),
    },
  };
}

// Runs normalizeDocumentSettings across the whole array, failing on the
// FIRST invalid entry so the caller reports one clear problem rather than
// a list. Returns { documents } (normalized, in the caller's order) or
// { error }.
function normalizeDocumentList(documents) {
  if (!Array.isArray(documents) || documents.length === 0) {
    return { error: "documents must be a non-empty array" };
  }

  const normalized = [];
  for (let i = 0; i < documents.length; i += 1) {
    const { settings, error } = normalizeDocumentSettings(documents[i], i);
    if (error) return { error };
    normalized.push(settings);
  }
  return { documents: normalized };
}

module.exports = {
  COLOR_MODES,
  PAPER_SIZES,
  SIDES,
  MAX_SERVICES_PER_DOCUMENT,
  normalizeDocumentSettings,
  normalizeDocumentList,
};
