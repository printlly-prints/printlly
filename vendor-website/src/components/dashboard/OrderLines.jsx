import StatusBadge from "../StatusBadge";
import { orderRef } from "../../utils/orderRef";
import { orderPages, orderSheets } from "../../utils/dashboardStats";

// Compact rows, not cards. Everything a vendor needs to triage an order
// is on one line; the detail (per-document settings, the bill, the OTP
// field) opens in the drawer the Orders page already uses.

export const ACTIVE_GRID =
  "grid grid-cols-[minmax(150px,1.5fr)_96px_minmax(84px,.8fr)_minmax(96px,.8fr)_84px_84px_128px_92px] gap-3 items-center";

export const ACTIVE_COLUMNS = [
  "Customer",
  "Order ID",
  "Documents",
  "Pages",
  "Order time",
  "Amount",
  "Status",
  "Action",
];

export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function clockTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// "14 min", "2 h 5 min" - how long this order has been waiting. A vendor
// judges urgency by elapsed time, and this is measured from real
// timestamps rather than invented.
export function elapsed(since, now = Date.now()) {
  const minutes = Math.max(0, Math.round((now - new Date(since).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export function Avatar({ name }) {
  return (
    <span
      aria-hidden="true"
      className="shrink-0 w-8 h-8 rounded-full bg-primary-wash text-primary-deep font-heading text-[11px] font-bold grid place-items-center"
    >
      {initials(name)}
    </span>
  );
}

export function ActiveOrderRow({ order, zebra, onView }) {
  const customer = order.customer_id || {};
  const files = order.documents?.length ?? 0;
  const pages = orderPages(order);
  const sheets = orderSheets(order);

  return (
    <div
      className={`${ACTIVE_GRID} px-3 py-2.5 rounded-card border border-border transition-[background-color,box-shadow,border-color] duration-200 hover:bg-primary-wash/60 hover:border-primary/30 hover:shadow-card ${
        zebra ? "bg-background-soft/50" : "bg-surface"
      }`}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={customer.name} />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-text-primary truncate">
            {customer.name || "Unknown customer"}
          </span>
          <span className="block text-[11px] text-text-muted truncate">{customer.phone || "—"}</span>
        </span>
      </div>

      <span
        className="text-xs font-semibold tabular-nums text-text-secondary truncate"
        title={String(order._id)}
      >
        {orderRef(order)}
      </span>

      <span className="text-xs text-text-secondary">
        {files} file{files === 1 ? "" : "s"}
      </span>

      {/* Pages is the page count; sheets (pages x copies) is what actually
          goes through the machine, so it is named separately rather than
          one number quietly standing for both. */}
      <span className="text-xs text-text-primary tabular-nums">
        {pages} page{pages === 1 ? "" : "s"}
        {sheets !== pages && <span className="block text-[11px] text-text-muted">{sheets} sheets</span>}
      </span>

      <span className="text-xs text-text-secondary tabular-nums" title={new Date(order.createdAt).toLocaleString()}>
        {clockTime(order.createdAt)}
      </span>

      <span className="text-sm font-bold text-text-primary tabular-nums">₹{order.total_amount ?? 0}</span>

      <StatusBadge status={order.status} />

      <button
        type="button"
        onClick={() => onView(order)}
        className="justify-self-end px-3 h-8 rounded-control text-xs font-semibold text-primary-bright bg-primary-wash hover:bg-primary hover:text-white transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        View
      </button>
    </div>
  );
}

// The narrower row used by Printing now / Ready for pickup / Recent - the
// same visual language, fewer columns, because those sections answer one
// question each rather than being a full queue.
export function MiniOrderRow({ primary, secondary, meta, trailing, action, tone = "default" }) {
  const tones = {
    default: "bg-surface border-border",
    printing: "bg-primary-wash/40 border-primary/20",
    ready: "bg-success-bg/50 border-success/20",
  };
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-card border transition-[background-color,box-shadow] duration-200 hover:shadow-card ${tones[tone]}`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary truncate">{primary}</p>
        <p className="text-[11px] text-text-secondary truncate">{secondary}</p>
      </div>
      {meta && <div className="shrink-0 text-right">{meta}</div>}
      {trailing}
      {action}
    </div>
  );
}
