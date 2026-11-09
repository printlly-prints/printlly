// Print settings are PER DOCUMENT, both in the app and on the backend
// (see utils/orderDocuments.js there): POST /orders and POST
// /shops/compare-pricing each take a documents[] where every entry
// carries its own color_mode, copies, paper_size, sides and services.
//
// PrintPreferencesScreen builds that array - one card per uploaded file -
// and it travels unchanged through SelectShop and ReviewCheckout to the
// API. The helpers here are the small shape conversions along the way.

// Body for POST /shops/compare-pricing: page_count per document, since
// nothing is uploaded yet as far as that route is concerned.
export function toComparePricingDocuments(uploadedDocs, docSettings) {
  return uploadedDocs.map((doc, i) => ({
    page_count: doc.page_count,
    ...docSettings[i],
  }));
}

// Body for POST /orders: upload_id per document. page_count is NOT sent -
// the server reads it from the Upload record it already has, and would
// ignore ours anyway.
//
// `matchedServices` (from compare-pricing's document_services, per
// document) REPLACES the requested names when present, and this matters:
// compare-pricing matches loosely, so a customer can reach a shop by
// typing "lamination" when it calls the service "Glossy Lamination" - but
// POST /orders matches EXACTLY, deliberately, so that a loose name can
// never buy a pricier service than the one shown. Sending the raw typed
// name there would be rejected. The matched name is also the one whose
// price the customer was just quoted.
export function toOrderDocuments(uploadedDocs, docSettings, matchedServices) {
  return uploadedDocs.map((doc, i) => {
    const matched = matchedServices?.[i];
    return {
      upload_id: doc.upload_id,
      ...docSettings[i],
      services: matched ? matched.map((service) => service.name) : docSettings[i].services,
    };
  });
}

// "B&W · 2 copies · A3 · Double-sided · Lamination" - one document's
// settings as a single readable line, for order/review screens that list
// files individually.
export function describeDocumentSettings(settings) {
  if (!settings) return "";
  const parts = [settings.color_mode === "bw" ? "B&W" : "Colour"];
  parts.push(`${settings.copies} cop${settings.copies === 1 ? "y" : "ies"}`);
  parts.push(settings.paper_size || "A4");
  if (settings.sides === "double") parts.push("Double-sided");
  // Services are the shop's own names, chosen by the customer from that
  // shop's list - there is no fixed set to look up.
  for (const name of settings.services || []) parts.push(name);
  return parts.join(" · ");
}

// A blank set of settings for one document - the defaults every document
// starts at on PrintPreferencesScreen.
export function defaultDocumentSettings() {
  return {
    color_mode: "bw",
    copies: 1,
    paper_size: "A4",
    sides: "single",
    // Requested service NAMES, as the chosen shop lists them. Empty until
            // the customer picks some - and only pickable once a shop is known.
            services: [],
  };
}

// Two service names are "the same" if they match the way the backend
// matches them when an order is placed - normalized case and whitespace
// (see normalizeServiceName in utils/shopServices.js). Used so ticking
// "Lamination" and typing "lamination " aren't recorded as two separate
// requests, which would be charged twice.
export function sameServiceName(a, b) {
  return normalize(a) === normalize(b);
}

function normalize(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
