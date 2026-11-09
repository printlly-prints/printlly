const { generateOtp } = require("./otp");
const { emitOrderEvent, ORDER_EVENTS } = require("./orderEvents");

// The single place an order becomes paid.
//
// Both confirmation paths go through this: the client callback
// (POST /payments/razorpay/verify) and the Razorpay webhook
// (POST /payments/webhook). That is the point - two code paths that each
// decided for themselves what "paid" means would eventually disagree, and the
// disagreement would be about money. One of them would set vendor_amount and
// the other would forget, or one would generate an OTP and the other would
// leave the customer unable to collect their prints.
//
// Statuses an order can never be paid for. An expired order's documents have
// already been deleted by cron/cleanupAbandonedOrders.js, so marking it paid
// would promise a print that cannot happen.
const UNPAYABLE_STATUSES = ["expired", "cancelled"];
const UNPAYABLE_MESSAGE = "This order has expired and can no longer be paid for";

// Marks an order paid, exactly once.
//
// Returns one of:
//   { outcome: "paid" }         - this call transitioned it
//   { outcome: "already_paid" } - it was already paid; nothing was changed
//   { outcome: "not_payable" }  - expired or cancelled; nothing was changed
//
// The already_paid case is what makes the whole thing idempotent, and it is
// checked here rather than in each caller so that neither caller can forget
// it. A second successful confirmation - a client retry, a webhook redelivery,
// or a webhook arriving after the client already confirmed - must leave a paid
// order completely untouched: same OTP, same vendor_amount. Regenerating the
// OTP would invalidate the code the customer is already holding.
async function markOrderPaid(order, { razorpayPaymentId = null } = {}) {
  if (order.payment_status === "paid") {
    // Backfill only. An order paid through the client callback before the
    // webhook existed has no payment id stored; if a webhook later tells us
    // what it was, recording it is useful for reconciliation and changes
    // nothing about the payment itself.
    if (razorpayPaymentId && !order.razorpay_payment_id) {
      order.razorpay_payment_id = razorpayPaymentId;
      await order.save();
    }
    return { outcome: "already_paid" };
  }

  if (UNPAYABLE_STATUSES.includes(order.status)) {
    return { outcome: "not_payable" };
  }

  order.payment_status = "paid";
  order.otp = generateOtp();
  if (razorpayPaymentId) order.razorpay_payment_id = razorpayPaymentId;

  // Frozen here, from this order's own already-frozen totals, so that a later
  // change to the platform fee cannot restate what the shop is owed for work
  // it has already done. Rounded to paise so a float tail cannot accumulate
  // across a settlement batch.
  order.vendor_amount = Math.round((order.total_amount - order.platform_fee) * 100) / 100;
  order.logEvent("paid", "system");

  await order.save();

  // The payment-confirmed event hangs off THIS transition, not off either
  // caller, and that placement is the point: both the client callback and the
  // Razorpay webhook reach payment confirmation through this function, and
  // only the call that actually flips payment_status gets here. The
  // already_paid branch above returns before this line, so an idempotent
  // webhook redelivery - or a webhook arriving after the client already
  // confirmed - cannot produce a second notification for one payment.
  //
  // Deliberately after the save, and never allowed to throw: delivery is
  // downstream of the money being recorded.
  await emitOrderEvent(order, ORDER_EVENTS.PAYMENT_CONFIRMED);

  return { outcome: "paid" };
}

module.exports = { markOrderPaid, UNPAYABLE_STATUSES, UNPAYABLE_MESSAGE };
