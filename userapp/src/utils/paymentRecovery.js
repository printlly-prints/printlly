// A provider callback or failed HTTP request is not a conclusive charge result.
export function paymentRecoveryState({ order, failure, cancelled = false } = {}) {
  const status = failure?.response?.status;
  if (status === 401 || status === 403) return { reaction: "access_expired", title: status === 401 ? "Your session has ended." : "This payment is unavailable.", message: "Sign in with the account that placed this order to check its payment." };
  if (order?.payment_status === "paid") return { confirmed: true };
  if (order?.payment_status === "failed") return { reaction: "payment_failed", title: "Payment didn’t complete.", message: "Check payment status before trying again, or get help." };
  if (cancelled) return { reaction: "cancelled", title: "Payment was cancelled.", message: "Your print options are saved. Check payment status before returning to checkout." };
  return { reaction: "payment_uncertain", title: "Still confirming payment.", message: "Check the status before making another payment. Your pickup code appears only after server confirmation." };
}

// Checking an existing charge must never open a checkout or create a charge.
// Only an explicit Continue with UPI action may reach the checkout branch.
export function paymentNextStep(order, { proof = false, allowCheckout = false } = {}) {
  if (!order) return "missing";
  if (order.payment_status === "paid") return "confirmed";
  if (["cancelled", "expired", "completed"].includes(order.status)) return "track";
  if (proof) return "verify";
  return allowCheckout && ["created", "failed"].includes(order.payment_status) ? "checkout" : "status";
}
