import { useEffect, useRef } from "react";
import OrderCard from "./OrderCard";
import { orderRef } from "../utils/orderRef";

// The queue is a table now, so one order's full detail - every document
// with its own settings, the cost breakdown, the instructions and the
// status action - lives here instead. It is the SAME OrderCard as before,
// not a reimplementation, so nothing a vendor relied on has moved or been
// dropped; only where it is shown has changed.
export default function OrderDetailPanel({ order, autoOtp, initialViewingIndex, onClose, ...actions }) {
  const panelRef = useRef(null);

  // Escape closes, and focus moves into the panel so the keyboard lands
  // where the eye already is.
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    panelRef.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  if (!order) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-surface-deep/70"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Order ${orderRef(order)}`}
        className="relative w-full max-w-lg h-full bg-surface border-l border-border shadow-modal overflow-y-auto focus:outline-none"
      >
        <header className="sticky top-0 z-10 bg-surface/95 backdrop-blur border-b border-border px-5 py-3.5 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-heading font-bold text-text-primary">Order {orderRef(order)}</h2>
            <p className="text-xs text-text-muted truncate">{String(order._id)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close order details"
            className="w-9 h-9 shrink-0 rounded-control text-text-secondary hover:text-text-primary hover:bg-background-tint transition-colors duration-[190ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            ✕
          </button>
        </header>

        <div className="p-5">
          <OrderCard
            order={order}
            autoOtp={autoOtp}
            initialViewingIndex={initialViewingIndex}
            {...actions}
          />
        </div>
      </aside>
    </div>
  );
}
