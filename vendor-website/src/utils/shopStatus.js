// Client-side mirror of the backend's utils/shopStatus.js - used ONLY to
// decide what the dashboard should show (e.g. disabling the manual
// Open/Closed toggle while outside business hours). The backend's own
// computeEffectiveOpenStatus is what actually gates POST /orders; nothing
// here is ever trusted as the real answer, only as a same-page hint that
// stays in sync with it.
const IST_OFFSET_MINUTES = 5 * 60 + 30; // UTC+5:30, fixed regardless of the viewer's own timezone

function getIstMinutesSinceMidnight(date) {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return (utcMinutes + IST_OFFSET_MINUTES) % (24 * 60);
}

function parseTimeToMinutes(timeStr) {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function isWithinWindow(nowMinutes, openMinutes, closeMinutes) {
  if (openMinutes === closeMinutes) return true;
  if (openMinutes < closeMinutes) {
    return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
  }
  return nowMinutes >= openMinutes || nowMinutes < closeMinutes; // overnight window, e.g. 22:00-06:00
}

// True if `businessHours` has no active schedule, OR the current moment
// falls inside it. Deliberately independent of is_open - this only
// answers "does the schedule itself allow orders right now", which is
// what decides whether the manual toggle is overridden (see
// ShopOpenToggle.jsx).
export function isWithinBusinessHours(businessHours) {
  if (!businessHours?.enabled || !businessHours.open_time || !businessHours.close_time) {
    return true;
  }
  const nowMinutes = getIstMinutesSinceMidnight(new Date());
  const openMinutes = parseTimeToMinutes(businessHours.open_time);
  const closeMinutes = parseTimeToMinutes(businessHours.close_time);
  return isWithinWindow(nowMinutes, openMinutes, closeMinutes);
}

// ---------------------------------------------------------------------
// Three-state availability. The BACKEND is the source of truth
// (utils/shopStatus.js there, surfaced as shop.effective_status on
// GET /shops/me); everything below is the same rule re-stated so the
// dashboard can stay correct between refreshes - a timed Busy that
// lapses, or a closing time that passes, while the page is open. If the
// two ever disagree the backend wins, and nothing here ever gates an
// action on its own answer.
// ---------------------------------------------------------------------

// What each state means, in the vendor's own words. `dot`/`chip` are
// Tailwind classes from the tokens in tailwind.config.js - Busy is amber,
// never red, because a busy shop is trading normally.
export const SHOP_STATUSES = [
  {
    value: "open",
    label: "Open",
    description: "Accepting orders normally",
    dot: "bg-success",
    text: "text-success-text",
    chip: "bg-success-bg text-success-text",
    ring: "border-success",
  },
  {
    value: "busy",
    label: "Busy",
    description: "Accepting orders, but preparation may take longer",
    dot: "bg-busy",
    text: "text-busy-text",
    chip: "bg-busy-bg text-busy-text",
    ring: "border-busy",
  },
  {
    value: "closed",
    label: "Closed",
    description: "Not accepting new orders",
    dot: "bg-shut",
    text: "text-shut-text",
    chip: "bg-shut-bg text-shut-text",
    ring: "border-shut",
  },
];

export const statusMeta = (value) =>
  SHOP_STATUSES.find((s) => s.value === value) || SHOP_STATUSES[0];

// The vendor's stored choice, with the two things that can override it
// applied - in the same order as the backend's computeShopAvailability:
// a lapsed timed Busy becomes Open, then business hours can close
// anything. Mirrors that function exactly; see the note at the top.
export function effectiveShopStatus(shop) {
  if (!shop) return "closed";
  let status = shop.shop_status || (shop.is_open === false ? "closed" : "open");

  if (status === "busy" && shop.busy_until && new Date(shop.busy_until).getTime() <= Date.now()) {
    status = "open";
  }
  if (status !== "closed" && !isWithinBusinessHours(shop.business_hours)) {
    status = "closed";
  }
  return status;
}

// Only meaningful while busy - an open shop has no special estimate.
export const DEFAULT_BUSY_PREP_MINUTES = 25;
export function busyPrepMinutes(shop) {
  return shop?.busy_prep_minutes || DEFAULT_BUSY_PREP_MINUTES;
}
