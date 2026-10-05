// Maps each order status to a token pair from tailwind.config.js so shop
// staff can scan the list at a glance. Deliberately not all teal - a
// queue needs distinguishable states - but drawn from the Printlly
// status tokens rather than Tailwind's stock palette.
//
// Colour is never the only signal: every badge carries its label too, so
// the status is readable without colour vision.
const STATUS_STYLES = {
  pending: "bg-status-pending-bg text-status-pending-text",
  accepted: "bg-status-active-bg text-status-active-text",
  // No backend status emits "printing" yet - orders go accepted ->
  // ready_for_pickup. Mapped here so the badge is correct the day the
  // backend adds it; nothing renders it today.
  printing: "bg-status-active-bg text-status-active-text",
  ready_for_pickup: "bg-status-ready-bg text-status-ready-text",
  completed: "bg-status-done-bg text-status-done-text",
  cancelled: "bg-error-bg text-error-text",
  // Same neutral as "completed" (both terminal, no action needed), but
  // its own label so it isn't mistaken for a fulfilled order.
  expired: "bg-status-done-bg text-status-done-text",
};

const STATUS_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  printing: "Printing",
  ready_for_pickup: "Ready for pickup",
  completed: "Completed",
  cancelled: "Cancelled",
  expired: "Expired",
};

export default function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || "bg-status-done-bg text-status-done-text";
  const label = STATUS_LABELS[status] || status;

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}
