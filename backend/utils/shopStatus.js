// How a shop is CURRENTLY trading - separate from
// is_active/verification_status (which control whether a shop appears at
// all, see getActiveShops in shopController.js).
//
// THIS FILE IS THE ONE SOURCE OF TRUTH for shop availability. Nothing
// should read shop.shop_status (or the deprecated shop.is_open) directly
// to decide what a customer may do; always go through
// computeShopAvailability, so business_hours and a lapsed timed Busy are
// never silently skipped by a call site that forgot about them.
//
// Three states:
//   "open"   - accepting orders, normal preparation
//   "busy"   - STILL ACCEPTING ORDERS, longer preparation estimate
//   "closed" - not accepting new orders
//
// Busy is deliberately NOT a kind of closed: computeEffectiveOpenStatus
// (the gate POST /orders uses) returns true for it, so a busy shop takes
// orders exactly as an open one does. Busy changes what a customer is
// TOLD, never what they are allowed to do, and never the order lifecycle
// - there is no "busy" order status.

// What a shop is assumed to be preparing in while busy, when the vendor
// turned Busy on without picking a time.
const DEFAULT_BUSY_PREP_MINUTES = 25;

const IST_OFFSET_MINUTES = 5 * 60 + 30; // UTC+5:30, fixed regardless of server timezone

// Minutes since local midnight, in IST, for a given instant - not the
// server's own timezone, which may be anything depending on where this
// happens to be deployed.
function getIstMinutesSinceMidnight(date) {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MINUTES) % (24 * 60);
}

function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

// True if `now` (IST minutes-since-midnight) falls in [openMinutes,
// closeMinutes) - handles an overnight window (e.g. open 22:00, close
// 06:00) by wrapping past midnight, not just the same-day case.
function isWithinWindow(nowMinutes, openMinutes, closeMinutes) {
  if (openMinutes === closeMinutes) return true; // a zero-width window reads as "open all day", not "never open"
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes;
}

// True if the schedule itself permits trading right now. A shop with no
// enabled schedule is always permitted - the vendor's manual choice is
// then the whole answer. Also true when a schedule is enabled but
// incomplete (a time missing), so a misconfigured schedule can never
// silently mark a shop permanently closed.
function isWithinSchedule(shop, now) {
  const hours = shop.business_hours;
  if (!hours?.enabled || !hours.open_time || !hours.close_time) return true;

  return isWithinWindow(
    getIstMinutesSinceMidnight(now),
    parseTimeToMinutes(hours.open_time),
    parseTimeToMinutes(hours.close_time)
  );
}

// The single source of truth for what a shop is doing right now, in the
// order the rules apply:
//
//   1. Start from the vendor's stored choice (shop_status), falling back
//      to the deprecated is_open for documents written before it.
//   2. A TIMED Busy whose busy_until has passed is Open again. This is
//      applied on read rather than by a job, so it takes effect on every
//      surface the moment the clock passes it - see models/Shop.js.
//      busy_until === null means "Until I turn it off", which never
//      expires by itself.
//   3. business_hours, if enabled, overrides everything: outside
//      [open_time, close_time) in IST the shop is closed no matter what
//      the vendor picked. A busy shop outside its hours is closed, not
//      busy. The manual choice still lets a vendor close for a one-off
//      reason (a holiday, running out of paper) without touching their
//      schedule.
//
// `now` is injectable purely so the tests can drive an expiry without
// waiting for the clock.
//
// Returns { status, prep_minutes }. prep_minutes is non-null only while
// busy - an open shop has no special estimate to give.
function computeShopAvailability(shop, now = new Date()) {
  let status = shop.shop_status || (shop.is_open === false ? "closed" : "open");

  if (status === "busy" && shop.busy_until && new Date(shop.busy_until).getTime() <= now.getTime()) {
    status = "open";
  }

  if (status !== "closed" && !isWithinSchedule(shop, now)) {
    status = "closed";
  }

  return {
    status,
    prep_minutes: status === "busy" ? shop.busy_prep_minutes || DEFAULT_BUSY_PREP_MINUTES : null,
  };
}

// "Can a customer place an order at this shop right now?" - which is
// true for BUSY as well as open. Kept as its own named function because
// that is the question POST /orders asks, and spelling it
// `!== "closed"` at the call site is exactly the kind of place where
// somebody later writes `=== "open"` and quietly breaks busy ordering.
function computeEffectiveOpenStatus(shop, now = new Date()) {
  return computeShopAvailability(shop, now).status !== "closed";
}

// Turns one shop into what a customer-facing route is allowed to send:
// the computed is_currently_open, and never the raw is_open/business_hours
// it was derived from. Both GET /shops (getActiveShops) and GET
// /saved-shops (getSavedShops) had this exact compute-then-delete trio
// written out inline; they're identical in intent and must stay that way
// (a customer reads a shop the same way wherever they meet it), so it
// lives here once instead.
//
// Takes and returns a PLAIN object - callers pass shop.toObject() (or a
// populated sub-document's plain form), never a live Mongoose document,
// since deleting paths off a hydrated document wouldn't survive
// serialization anyway.
//
// Deliberately NOT extended to cover the kyc/verification_status
// stripping those two routes also do: those are handled by each query's
// own .select()/populate projection now, so the sensitive fields are
// never loaded into memory in the first place rather than being loaded
// and then deleted here.
function toPublicShop(plainShop) {
  const { status, prep_minutes } = computeShopAvailability(plainShop);

  // The computed three-state answer, which is what every customer
  // surface reads.
  plainShop.shop_status = status;
  // Non-null only while busy, so a client can render "Ready in ~25 min"
  // without having to know the default.
  plainShop.busy_prep_minutes = prep_minutes;
  // Kept alongside it: "can I order from this shop" is a different
  // question from "what is it doing", every existing client already
  // reads this, and it is TRUE while busy.
  plainShop.is_currently_open = status !== "closed";

  // The raw inputs never leave the server - so nothing downstream is
  // tempted to re-derive the answer and get a different one.
  delete plainShop.is_open;
  delete plainShop.business_hours;
  delete plainShop.busy_until;
  return plainShop;
}

// Every customer-facing query that will be passed to toPublicShop must
// select these, or availability silently computes from missing fields.
// Exported so the selects in shopController/savedShopController can name
// this list instead of each repeating a string that can drift.
const AVAILABILITY_FIELDS = "shop_status busy_until busy_prep_minutes is_open business_hours";

module.exports = {
  computeShopAvailability,
  computeEffectiveOpenStatus,
  toPublicShop,
  AVAILABILITY_FIELDS,
  DEFAULT_BUSY_PREP_MINUTES,
};
