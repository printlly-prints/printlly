import { availabilityColors, availabilityLabels } from "../theme";

// How a shop is trading, read the same way on every screen that shows a
// shop - Home, Find Shops, Shop Details, Checkout, tracking and pickup.
//
// The BACKEND is the source of truth: it computes shop_status
// (open/busy/closed) in utils/shopStatus.js, applying business hours and
// expiring a timed Busy, and sends it on every shop payload. Nothing here
// re-derives it - this only turns that one word into what a customer
// reads.
//
// Busy means the shop IS ACCEPTING ORDERS, with a longer preparation
// estimate. It is not a kind of closed, it never blocks checkout, and it
// has nothing to do with an order's own status (pending -> accepted ->
// ready_for_pickup -> completed), which Busy does not touch.
//
// Falls back to is_currently_open for any payload that predates
// shop_status, so an older cached shop object still reads correctly
// rather than defaulting to "open" and inviting an order at a closed
// shop.
export function shopAvailability(shop) {
  const status =
    shop?.shop_status || (shop?.is_currently_open === false ? "closed" : "open");

  const configuredPrep = shop?.busy_prep_minutes;
  const prepMinutes = status === "busy" && typeof configuredPrep === "number" && Number.isFinite(configuredPrep) && configuredPrep > 0 ? configuredPrep : null;

  return {
    status,
    isBusy: status === "busy",
    isClosed: status === "closed",
    // True for BUSY as well as open - this is "can I order here", which
    // is the question almost every call site is actually asking.
    canOrder: status !== "closed",
    label: availabilityLabels[status],
    colors: availabilityColors[status],
    prepMinutes,
    // The one line that replaces the normal estimate while busy. Null
    // otherwise, so a call site can render it unconditionally.
    prepLine: prepMinutes ? `Ready in ~${prepMinutes} min` : null,
  };
}
