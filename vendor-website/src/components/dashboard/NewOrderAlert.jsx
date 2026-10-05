import { orderRef } from "../../utils/orderRef";
import { orderPages } from "../../utils/dashboardStats";

// Shown when the poll finds an order that was not in the previous fetch.
// An inline panel at the top of the page, not a popup: a vendor is often
// mid-task at the counter, and a modal that steals focus while they are
// typing an OTP is worse than no alert at all.
//
// The pulse is a ring on the panel itself and is suppressed under
// prefers-reduced-motion.
export default function NewOrderAlert({ order, onAccept, onView, onDismiss, busy }) {
  if (!order) return null;
  const customer = order.customer_id?.name || "A customer";
  const files = order.documents?.length ?? 0;
  const pages = orderPages(order);

  return (
    <div
      role="status"
      className="relative overflow-hidden rounded-panel border border-primary/30 bg-primary-wash px-4 py-3.5 flex flex-wrap items-center gap-3 shadow-card motion-safe:animate-[printlly-pulse_2.4s_ease-in-out_infinite]"
    >
      <span
        aria-hidden="true"
        className="w-9 h-9 rounded-full bg-primary text-white grid place-items-center shrink-0"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
          <path d="M9.5 8h5M9.5 12h5" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-heading font-bold text-primary-deep text-sm">New order received</p>
        <p className="text-sm text-text-primary truncate">
          <span className="font-semibold">{customer}</span>
          <span className="text-text-secondary">
            {" "}
            · {files} document{files === 1 ? "" : "s"} · {pages} page{pages === 1 ? "" : "s"} · ₹
            {order.total_amount ?? 0} · {orderRef(order)}
          </span>
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={() => onAccept(order._id)}
          disabled={busy}
          className="px-4 h-9 rounded-control bg-primary text-white font-heading text-sm font-bold hover:bg-primary-deep disabled:opacity-50 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {busy ? "Accepting…" : "Accept order"}
        </button>
        <button
          type="button"
          onClick={() => onView(order)}
          className="px-3 h-9 rounded-control text-sm font-semibold text-primary-deep hover:bg-surface transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss new order alert"
          className="w-9 h-9 rounded-control text-text-secondary hover:bg-surface transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
