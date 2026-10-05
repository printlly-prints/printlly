// Matching customer-requested service NAMES against a shop's own
// vendor-defined service list.
//
// Services are per-shop free text now ("Matte Lamination", "Lamination
// (Glossy)", "Hole Punching"), so a customer asking for "lamination"
// cannot be matched by key any more. Two different rules apply, and the
// difference is deliberate:
//
//   COMPARISON (POST /shops/compare-pricing) uses SUBSTRING matching. The
//   customer is shopping around and hasn't chosen anywhere yet; "I want
//   lamination" should surface the shop calling it "Matte Lamination" as
//   well as the one calling it "Lamination". Each shop is then priced
//   with whatever IT matched, so two shops legitimately quote different
//   services at different prices for the same request.
//
//   ORDERING (POST /orders) uses EXACT (normalized) matching. By then the
//   customer has picked a shop and is looking at that shop's actual
//   service names, so the name they send is one of those names. Accepting
//   a substring here would let "lamination" silently buy a ₹200 "Premium
//   Lamination" when the shop also offers a ₹40 one - the customer must
//   be charged for the thing they actually chose.
//
// Disabled services are invisible to both: a vendor turns one off
// precisely so it can't be ordered.

// Lowercase + collapse whitespace. Both sides of every comparison go
// through this, so "  Matte  Lamination " and "matte lamination" are the
// same string.
function normalizeServiceName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function enabledServices(shopPricing) {
  return (shopPricing?.services || []).filter((service) => service.enabled !== false);
}

// Exact normalized match - for placing an order. Returns the shop's
// service document, or null.
function findServiceByExactName(shopPricing, requestedName) {
  const target = normalizeServiceName(requestedName);
  if (!target) return null;
  return enabledServices(shopPricing).find((s) => normalizeServiceName(s.name) === target) || null;
}

// Substring match - for comparing shops. Matches in either direction, so
// a request for "lamination" finds "Matte Lamination", and a request for
// "glossy lamination" finds a shop whose service is just "Lamination".
//
// Prefers an exact match when one exists, then the cheapest of the
// remaining candidates: a shop offering both "Lamination" (₹40) and
// "Premium Lamination" (₹200) should quote the customer the price they'd
// most likely expect, not the one that flatters the shop's ranking least.
function findServiceByFuzzyName(shopPricing, requestedName) {
  const target = normalizeServiceName(requestedName);
  if (!target) return null;

  const candidates = enabledServices(shopPricing).filter((s) => {
    const name = normalizeServiceName(s.name);
    return name.includes(target) || target.includes(name);
  });
  if (candidates.length === 0) return null;

  const exact = candidates.find((s) => normalizeServiceName(s.name) === target);
  if (exact) return exact;

  return candidates.reduce((cheapest, s) => (s.rate < cheapest.rate ? s : cheapest));
}

// Resolves every requested name for one document against one shop.
// `matcher` is whichever of the two rules above applies.
//
// Returns { services } - the snapshot array, ready to store on an order or
// price with - or { unmatched } naming the first name this shop can't do.
function resolveDocumentServices(requestedNames, shopPricing, matcher) {
  const services = [];
  for (const requested of requestedNames || []) {
    const match = matcher(shopPricing, requested);
    if (!match) {
      return { unmatched: requested };
    }
    // Snapshot, not a reference: name and rate are copied as they are
    // right now, so a later rename or re-price can't rewrite this.
    services.push({ service_id: match._id, name: match.name, rate: match.rate });
  }
  return { services };
}

module.exports = {
  normalizeServiceName,
  findServiceByExactName,
  findServiceByFuzzyName,
  resolveDocumentServices,
};
