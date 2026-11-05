// Payment and pickup are independent from the shop's fulfilment state.
export const ORDER_STEPS = [
  { key: "pending", label: "Order placed", pending: "Waiting for the shop to accept." },
  { key: "accepted", label: "Shop accepted", pending: "The shop will confirm shortly." },
  { key: "ready_for_pickup", label: "Ready for pickup", pending: "We'll notify you once it's ready." },
  { key: "completed", label: "Collected", pending: "Show your pickup code at the counter." },
];

export function completedOrderStepCount(status) {
  const index = ORDER_STEPS.findIndex((step) => step.key === status);
  return index < 0 ? 0 : index + 1;
}

export function pickupCodeForOrder(order) {
  if (order?.payment_status !== "paid" || !["pending", "accepted", "ready_for_pickup"].includes(order.status)) {
    return null;
  }
  // Do not pad, trim or manufacture a code. Preserve server-issued leading zeros.
  const code = typeof order.otp === "string" || typeof order.otp === "number" ? String(order.otp) : "";
  return /^\d{6}$/.test(code) ? code : null;
}
