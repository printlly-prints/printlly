export function validVerificationProof(value) {
  return value && ["razorpay_order_id", "razorpay_payment_id", "razorpay_signature"].every((key) => typeof value[key] === "string" && value[key].length > 0 && value[key].length <= 256);
}
// Scoped to both account and Printlly order. This contains checkout recovery
// data, never the JWT or UPI credentials. Corrupt/unreadable storage blocks a
// new provider session instead of losing an uncertain captured payment.
export function createPaymentProofStore(storage, { accountId, orderId }) {
  if (!accountId || !orderId) throw new Error("Payment recovery requires an account and order.");
  const key = `printlly:payment:${encodeURIComponent(accountId)}:${encodeURIComponent(orderId)}`;
  const validate = (value) => {
    if (!value || value.version !== 1 || value.orderId !== String(orderId) || value.accountId !== String(accountId)) throw new Error("Payment recovery data could not be read. Check this order or contact support.");
    const checkout = value.checkout;
    if (!checkout || typeof checkout.razorpayOrderId !== "string" || !checkout.razorpayOrderId || typeof checkout.keyId !== "string" || !Number.isInteger(checkout.amountInPaise) || checkout.amountInPaise < 1 || checkout.currency !== "INR") throw new Error("Payment recovery data is incomplete. Check this order or contact support.");
    if (value.proof && (!validVerificationProof(value.proof) || value.proof.razorpay_order_id !== checkout.razorpayOrderId)) throw new Error("The payment proof does not match this checkout. Check your order or contact support.");
    return value;
  };
  return {
    async read() {
      const raw = await storage.getItem(key);
      if (!raw) return null;
      let value;
      try { value = JSON.parse(raw); } catch { throw new Error("Payment recovery data could not be read. Check this order or contact support."); }
      return validate(value);
    },
    async save(checkout, proof = null) {
      const value = validate({ version: 1, orderId: String(orderId), accountId: String(accountId), checkout: { amountInPaise: checkout.amountInPaise, currency: checkout.currency, razorpayOrderId: checkout.razorpayOrderId, keyId: checkout.keyId }, proof });
      await storage.setItem(key, JSON.stringify(value)); return value;
    },
    async clear() { await storage.removeItem(key); },
  };
}
