// An attempt ID fences callbacks from WebViews that have been replaced by a retry.
export function paymentRecoveryAction(order, hasVerificationProof) {
  if (!order) throw new Error("Could not find this order. Check your orders or contact support.");
  if (["cancelled", "expired", "completed"].includes(order.status)) return "track";
  if (order.payment_status === "paid") return "confirmed";
  return hasVerificationProof ? "verify" : "checkout";
}

export function createPaymentAttemptGuard() {
  let attempt = 0;
  let phase = "idle";
  return {
    begin() {
      if (["preparing", "checkout", "verifying", "confirmed"].includes(phase)) return null;
      attempt += 1; phase = "preparing"; return attempt;
    },
    isCurrent(id) { return id === attempt && phase !== "disposed"; },
    open(id) {
      if (id !== attempt || phase !== "preparing") return false;
      phase = "checkout";
      return true;
    },
    failPreparation(id) {
      if (id !== attempt || phase !== "preparing") return false;
      phase = "error";
      return true;
    },
    startVerification(id) {
      if (id !== attempt || phase !== "checkout") return false;
      phase = "verifying";
      return true;
    },
    closeCheckout(id) {
      if (id !== attempt || phase !== "checkout") return false;
      phase = "error";
      return true;
    },
    finishVerification(id, confirmed) {
      if (id !== attempt || phase !== "verifying") return false;
      phase = confirmed ? "confirmed" : "error";
      return true;
    },
    dispose() { phase = "disposed"; },
  };
}
