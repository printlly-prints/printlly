// A short, human-quotable reference for an order.
//
// The reference mock shows "#PL20240919001" - a sequential daily
// counter. This backend has no such thing: an order's identity is its
// MongoDB ObjectId, and there is no counter, no per-day sequence and
// nothing that would keep a generated PL-number unique across two orders
// placed in the same second. Minting one in the app would produce a
// number that looks authoritative, is shown to the customer, and matches
// nothing the shop or an admin could ever look up.
//
// So this derives a reference from the real id instead: the last six
// characters, uppercased, prefixed. Stable, unique for any realistic
// volume (ObjectId's trailing bytes are a per-process counter), and it
// can be pasted back into a search for the real order because it IS the
// real order's id.
//
// The full id stays available wherever it is actually needed - support
// chat attaches the real order_id, and the tracking screen still shows
// the whole thing as selectable text.
export function orderRef(order) {
  const id = String(order?._id || order || "");
  if (!id) return "";
  return `PL${id.slice(-6).toUpperCase()}`;
}
