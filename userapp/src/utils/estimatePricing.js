// A client-side MIRROR of the backend's per-document pricing
// (utils/pricing.js there), used only for the live estimate shown while a
// customer is still configuring documents.
//
// Nothing here is ever the price charged. POST /orders recomputes every
// figure server-side from the shop's own stored rates, and that result is
// what the customer pays - see CheckoutScreen, which shows the
// SERVER's numbers, not these. This exists because a running total is
// useless if it only appears after you have finished choosing.
//
// It follows the backend formula exactly, on purpose: per document,
//   base     = pages x copies x (bw or colour rate)
//   paper    = pages x copies x paper_size_rate   (A4 is normally 0)
//   sides    = pages x copies x sides_extra_rate  (double-sided only)
//   services = flat rate per enabled service, per document
// then the order totals are the sums, plus the platform fee on the whole
// pre-fee amount. If the two ever disagree, this file is the one that is
// wrong.

function round2(n) {
  return Math.round(n * 100) / 100;
}

// Mirrors normalizeServiceName in utils/shopServices.js on the backend.
function normalizeServiceName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// One document's estimated total. Returns null when the shop's rates
// aren't known - the caller must then show no estimate rather than a
// guess (see estimateOrder).
export function estimateDocumentTotal(pageCount, settings, shopPricing) {
  if (!shopPricing || !settings) return null;

  const ratePerPage =
    settings.color_mode === "color" ? shopPricing.rate_per_page_color : shopPricing.rate_per_page_bw;
  const base = pageCount * settings.copies * (ratePerPage ?? 0);

  const paperRate = shopPricing.paper_size_rates?.[settings.paper_size] ?? 0;
  const paper_charge = pageCount * settings.copies * paperRate;

  // A flat amount per page printed, like the paper size charge above -
  // it no longer derives from `base`, so colour mode does not affect it.
  const sides_charge =
    settings.sides === "double"
      ? round2(pageCount * settings.copies * (shopPricing.sides_extra_rate ?? 0))
      : 0;

  // Services are matched by NAME against this shop's own list - the same
  // exact, normalized comparison the backend uses when the order is
  // actually placed (utils/shopServices.js). A name this shop doesn't
  // offer contributes nothing here; the order itself would be rejected.
  let services_charge = 0;
  for (const requested of settings.services || []) {
    const match = (shopPricing.services || []).find(
      (s) => s.enabled !== false && normalizeServiceName(s.name) === normalizeServiceName(requested)
    );
    services_charge += match?.rate || 0;
  }

  return {
    base,
    paper_charge,
    sides_charge,
    services_charge,
    document_total: round2(base + paper_charge + sides_charge + services_charge),
  };
}

// Whole-order estimate: each document priced on its own settings, then
// summed. `platformFee` is optional - when it isn't known the totals stop
// at the pre-fee amount and `total_amount` is null, so a caller can say
// "before fees" rather than quietly understating the price.
//
// Returns null if the shop's rates aren't known at all.
export function estimateOrder(uploadedDocs, docSettings, shopPricing, platformFee) {
  if (!shopPricing) return null;

  const documents = uploadedDocs.map((doc, i) =>
    estimateDocumentTotal(doc.page_count, docSettings[i], shopPricing)
  );
  if (documents.some((d) => d === null)) return null;

  const base_subtotal = round2(documents.reduce((n, d) => n + d.base, 0));
  const paper_size_charge = round2(documents.reduce((n, d) => n + d.paper_charge, 0));
  const sides_charge = round2(documents.reduce((n, d) => n + d.sides_charge, 0));
  const services_charge = round2(documents.reduce((n, d) => n + d.services_charge, 0));
  const pre_fee_total = round2(base_subtotal + paper_size_charge + sides_charge + services_charge);

  const fee =
    platformFee?.platform_fee_type === "percentage"
      ? round2(pre_fee_total * ((platformFee.platform_fee_value ?? 0) / 100))
      : platformFee?.platform_fee_value ?? null;

  return {
    documents,
    base_subtotal,
    paper_size_charge,
    sides_charge,
    services_charge,
    pre_fee_total,
    platform_fee: fee,
    total_amount: fee === null ? null : round2(pre_fee_total + fee),
  };
}
