const crypto = require("crypto");
const { razorpay } = require("../config/razorpay");
const Order = require("../models/Order");
const { attachQueuePosition } = require("../utils/queue");
// Shared with the webhook (controllers/paymentWebhookController.js) so that
// both confirmation paths produce identical state - see
// utils/paymentConfirmation.js for why that is not left to each caller.
const {
  markOrderPaid,
  UNPAYABLE_STATUSES,
  UNPAYABLE_MESSAGE,
} = require("../utils/paymentConfirmation");

// Constant-time hex signature comparison. crypto.timingSafeEqual throws
// if its two buffers differ in length, which a malformed or truncated
// client-supplied signature easily could - so lengths are checked first.
// That length check is not itself a useful timing oracle: expectedHex's
// length is fixed (64 hex chars, SHA-256's output), so this only ever
// short-circuits on input that is already the wrong shape to be a real
// signature, before any secret-dependent comparison happens.
function safeCompareHex(expectedHex, suppliedHex) {
  if (typeof suppliedHex !== "string") return false;

  const expected = Buffer.from(expectedHex, "hex");
  // Buffer.from(..., "hex") silently stops at the first invalid hex
  // character rather than throwing, so a garbage string just yields a
  // short/empty buffer here - never an exception.
  const supplied = Buffer.from(suppliedHex, "hex");

  if (expected.length === 0 || expected.length !== supplied.length) {
    return false;
  }
  return crypto.timingSafeEqual(expected, supplied);
}

// POST /payments/razorpay/create-order
// Customer starts paying for an Order they already created (POST /orders).
// Creates a Razorpay order for the order's server-computed total_amount
// and stashes the returned id on our Order record - verifyRazorpayPayment
// below only ever trusts a signature that matches THIS stored id, which
// is what stops a signature for some unrelated Razorpay order/payment
// from being replayed against this one.
//
// Allowed for payment_status "created" (first attempt) and "failed" (a
// retry after a bad/missing signature) - not for "paid", which would
// otherwise let a customer spin up a second charge for an order that
// already went through.
const createRazorpayOrder = async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ message: "order_id is required" });
    }

    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.customer_id.toString() !== req.user.id) {
      return res.status(403).json({ message: "This order does not belong to you" });
    }

    if (order.payment_status === "paid") {
      return res.status(400).json({ message: "This order has already been paid for" });
    }

    if (UNPAYABLE_STATUSES.includes(order.status)) {
      return res.status(400).json({ message: UNPAYABLE_MESSAGE });
    }

    // Razorpay's smallest unit is paise. Rounding guards against a float
    // artifact like 149.99999999999997 turning into 14999 paise instead
    // of 15000 - total_amount itself is already rupees with at most 2
    // decimal places (see utils/pricing.js), this just protects the *100.
    const amountInPaise = Math.round(order.total_amount * 100);

    const razorpayOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order._id.toString(),
      notes: { order_id: order._id.toString() },
    });

    // Overwrites any id from a previous failed attempt - verify() checks
    // against whatever is currently stored, so an old attempt's id (and
    // therefore its signature) stops being valid the moment a retry
    // starts a new one.
    order.razorpay_order_id = razorpayOrder.id;
    order.payment_status = "created";
    await order.save();

    res.status(200).json({
      razorpay_order_id: razorpayOrder.id,
      amount_in_paise: amountInPaise,
      currency: "INR",
      // Publishable id - safe to hand to the client, that's what it's
      // for. key_secret is never read outside config/razorpay.js and
      // this file.
      key_id: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error(`Failed to create Razorpay order: ${error.message}`);
    res.status(500).json({ message: "Failed to create Razorpay order" });
  }
};

// POST /payments/razorpay/verify
// The only place payment_status ever becomes "paid" and the only place
// an order's otp is ever generated. Razorpay's checkout result is never
// trusted on its own - the signature Razorpay returns is recomputed here
// from our own key_secret and checked byte-for-byte against what the
// client sent, so a modified client claiming success without actually
// paying cannot get an order marked paid.
const verifyRazorpayPayment = async (req, res) => {
  try {
    const { order_id, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!order_id || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        message: "order_id, razorpay_order_id, razorpay_payment_id and razorpay_signature are all required",
      });
    }

    const order = await Order.findById(order_id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.customer_id.toString() !== req.user.id) {
      return res.status(403).json({ message: "This order does not belong to you" });
    }

    // Idempotent: a client retrying its own already-successful verify
    // call (e.g. a dropped response) gets the same success payload back
    // rather than an error.
    if (order.payment_status === "paid") {
      // Populated for the same reason as the success path below.
      await order.populate("shop_id", "shop_name address contact shop_photo_url location");
      return res.status(200).json({ success: true, otp: order.otp, order: await attachQueuePosition(order) });
    }

    // Checked before the signature, and independently of create-order's
    // own check: a Razorpay order issued while this order was still live
    // stays signable after the order expires, so a checkout completed
    // late must still never reach "paid". payment_status is left as-is
    // (not flipped to "failed") - nothing was wrong with the payment
    // itself. Refunding a captured payment here is a separate task.
    if (UNPAYABLE_STATUSES.includes(order.status)) {
      return res.status(400).json({ message: UNPAYABLE_MESSAGE });
    }

    // Must be the id WE issued for this order in createRazorpayOrder
    // above - not just any syntactically valid Razorpay order id.
    const orderIdMatches =
      typeof order.razorpay_order_id === "string" && order.razorpay_order_id === razorpay_order_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    const signatureMatches = safeCompareHex(expectedSignature, razorpay_signature);

    if (signatureMatches && orderIdMatches) {
      // The transition itself lives in utils/paymentConfirmation.js, shared
      // with the webhook: it sets payment_status, generates the OTP and
      // freezes vendor_amount, and it leaves an already-paid order untouched.
      // razorpay_payment_id is recorded here too, which this path never used
      // to store - the webhook needs it to reconcile, and it is what lets a
      // specific order be looked up in the Razorpay dashboard.
      await markOrderPaid(order, { razorpayPaymentId: razorpay_payment_id });

      // The app lands straight on the confirmation and then the tracking
      // screen with THIS object - it does not refetch first. Without the
      // shop populated, shop_id would still be a bare ObjectId there and
      // the shop card would render nameless and photoless until the
      // first poll came back. Same fields GET /orders/customer populates,
      // so the two agree.
      await order.populate("shop_id", "shop_name address contact shop_photo_url location");

      // queue_position here is what closes the gap where
      // OrderTrackingScreen would otherwise show no queue line until the
      // customer's first pull-to-refresh - same attachQueuePosition
      // helper GET /orders/customer uses, so this agrees with it exactly.
      return res.status(200).json({ success: true, otp: order.otp, order: await attachQueuePosition(order) });
    }

    order.payment_status = "failed";
    await order.save();

    // Deliberately generic and does not reveal which check failed (bad
    // signature vs. mismatched order id) - and the order itself is never
    // included in this response, so a failed attempt exposes nothing a
    // shop owner or anyone else could act on.
    return res.status(400).json({
      message:
        "Payment verification failed. If money was deducted, it will be refunded automatically by Razorpay - please try again.",
    });
  } catch (error) {
    console.error(`Failed to verify payment: ${error.message}`);
    res.status(500).json({ message: "Failed to verify payment" });
  }
};

module.exports = { createRazorpayOrder, verifyRazorpayPayment };
