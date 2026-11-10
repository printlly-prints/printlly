import { X } from "lucide-react";
import { orderRef } from "../../utils/orderRef";

export default function NewOrderAlert({ order, onView, onDismiss }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card bg-primary-wash px-3 py-2">
      <div role="status" className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-primary-deep">New order received</p>
        <p className="break-words text-sm text-text-secondary">{order.customer_id?.name || "Customer"} · {orderRef(order)}</p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onView}
          aria-label={`Review order ${orderRef(order)}`}
          className="min-h-11 rounded-control px-2 text-sm font-semibold text-primary-deep hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Review order
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss new order alert"
          className="grid h-11 w-11 place-items-center rounded-control text-text-secondary hover:bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
