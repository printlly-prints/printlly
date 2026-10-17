import { orderRef } from "../utils/orderRef";

const labels = { pending: "Pending", accepted: "Accepted", ready_for_pickup: "Ready for pickup", completed: "Completed", cancelled: "Cancelled", expired: "Expired" };

/** Active P05 queue row; full document settings/actions remain in OrderDetailPanel. */
export default function OrderSummaryRow({ order, busy, onView }) {
  const amount = Number(order.total_amount);
  const count = order.documents?.length || 0;
  const detail = [labels[order.status] || order.status, `${count} ${count === 1 ? "file" : "files"}`];
  if (order.total_amount != null && Number.isFinite(amount)) detail.push(`₹${amount.toFixed(2)}`);
  return <button className="paper-row order-summary-row" disabled={busy} onClick={() => onView(order)}>
    <span><strong>{orderRef(order)} · {order.customer_id?.name || "Customer"}</strong><small>{detail.join(" · ")}</small></span>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
  </button>;
}
