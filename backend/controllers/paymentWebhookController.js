const crypto = require("crypto");
const Order = require("../models/Order");
const WebhookEvent = require("../models/WebhookEvent");
const { webhookSecret, isWebhookConfigured } = require("../config/razorpay");
const { markOrderPaid } = require("../utils/paymentConfirmation");
const { emitOrderEvent, ORDER_EVENTS } = require("../utils/orderEvents");
const { alertP0, alertP1, ALERT } = require("../utils/alerts");

const RETENTION_DAYS = 90;

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------
//
// Razorpay emits a lot of events. Only the ones that can change this
// application's payment state are acted on; everything else is acknowledged
// and recorded as ignored, because returning anything other than 2xx would
// make Razorpay retry an event forever that we were never going to use.
//
//   payment.captured -> the authoritative success signal. Razorpay's standard
//                       checkout auto-captures, so capture is the point at
//                       which the money is actually ours.
//
//   payment.failed   -> records the failure so a customer can retry. Only
//                       from "created"; it can never pull an order back out
//                       of "paid".
//
//   order.paid       -> deliberately IGNORED. It carries the same fact as
//                       payment.captured for this integration, and acting on
//                       both would mean two independent paths to the same
//                       state for no benefit. payment.captured is preferred
//                       because it names the payment id, which is what
//                       reconciliation and the stored record need.
//
//   payment.authorized -> ignored. This integration relies on capture; acting
//                       on authorisation would mark an order paid for money
//                       that has not been taken yet.
const SUCCESS_EVENT = "payment.captured";
const FAILURE_EVENT = "payment.failed";
const ACKNOWLEDGED_EVENTS = new Set(["order.paid", "payment.authorized"]);

// Timing-safe hex comparison. crypto.timingSafeEqual throws when its buffers
// differ in length, which a truncated or malformed signature header easily
// would, so lengths are checked first. That check is not a useful oracle: the
// expected length is fixed at 64 hex characters by SHA-256, so it only ever
// short-circuits input already the wrong shape to be a signature, before any
// secret-dependent comparison happens.
function safeCompareHex(expectedHex, suppliedHex) {
  if (typeof suppliedHex !== "string") return false;

  const expected = Buffer.from(expectedHex, "hex");
  // Buffer.from(..., "hex") stops at the first invalid character rather than
  // throwing, so garbage yields a short buffer instead of an exception.
  const supplied = Buffer.from(suppliedHex, "hex");

  if (expected.length === 0 || expected.length !== supplied.length) return false;
  return crypto.timingSafeEqual(expected, supplied);
}

// Verifies the signature over the RAW bytes Razorpay sent.
//
// It must be the raw body, not a re-serialised object: JSON.stringify of a
// parsed body is not guaranteed to reproduce the original byte-for-byte - key
// order, whitespace and number formatting can all differ - and any one byte
// of difference changes the HMAC. This is why the route is mounted with
// express.raw() ahead of express.json() (see server.js).
function verifyWebhookSignature(rawBody, signatureHeader, secret) {
  if (!Buffer.isBuffer(rawBody) || rawBody.length === 0) return false;
  if (!secret) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeCompareHex(expected, signatureHeader);
}

// Structured, deliberately safe logging.
//
// Carries ids and outcomes only. It never contains the webhook secret, the
// signature, the raw body, any part of the payload, a document URL or
// anything about the customer - the ids below are the same ones visible in
// the Razorpay dashboard, and they are what makes an event traceable.
function logWebhook(fields) {
  console.log(`[razorpay-webhook] ${JSON.stringify({ ...fields, timestamp: new Date().toISOString() })}`);
}

// How long a "processing" claim may sit before a redelivery is allowed to
// take it over. Long enough that a slow-but-live handler is never raced,
// short enough that a crashed one does not strand a payment confirmation
// until Razorpay gives up retrying.
const STALE_CLAIM_MS = 2 * 60 * 1000;

const expiryDate = () => new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

// Records the decision for an event this handler does not act on. The event
// id is the primary key, so a duplicate insert fails with 11000 - which is
// the answer "seen before", not an error.
//
// Returns true if this process wrote the record, false if it already existed.
async function recordEvent(fields) {
  try {
    await WebhookEvent.create({ ...fields, processed_at: new Date(), expires_at: expiryDate() });
    return true;
  } catch (error) {
    if (error.code === 11000) return false;
    throw error;
  }
}

// The idempotency gate for events that DO change state.
//
// Claims the event by inserting it as "processing" BEFORE the business
// operation runs, so two simultaneous deliveries cannot both proceed - the
// loser of the insert is told the event is already in hand.
//
// Returns "claimed" (go ahead), or "duplicate" with the previous record.
//
// The stale-claim case is the one that matters for correctness. If the
// process died between claiming and finishing, the record is left at
// "processing" and the payment was never confirmed. Treating that as a
// completed event would silently discard a real payment, so after
// STALE_CLAIM_MS a redelivery is allowed to take the claim over and redo the
// work. Redoing it is safe: markOrderPaid is itself idempotent, so the worst
// case is a second no-op.
async function claimEvent(fields) {
  try {
    await WebhookEvent.create({
      ...fields,
      result: "processing",
      processed_at: new Date(),
      expires_at: expiryDate(),
    });
    return { state: "claimed" };
  } catch (error) {
    if (error.code !== 11000) throw error;

    const previous = await WebhookEvent.findById(fields._id).select("result order_id processed_at").lean();

    if (previous?.result === "processing") {
      const age = Date.now() - new Date(previous.processed_at).getTime();
      if (age > STALE_CLAIM_MS) {
        // Re-stamp the claim so two retries arriving together cannot both
        // take it over.
        const retaken = await WebhookEvent.findOneAndUpdate(
          { _id: fields._id, result: "processing", processed_at: previous.processed_at },
          { $set: { processed_at: new Date() } }
        );
        if (retaken) return { state: "claimed" };
      }
    }

    return { state: "duplicate", previous };
  }
}

// Releases a claim so a Razorpay retry can reprocess the event from scratch.
// Called only when handling failed partway through and we therefore do not
// know whether the payment was confirmed.
async function releaseClaim(eventId) {
  try {
    await WebhookEvent.deleteOne({ _id: eventId, result: "processing" });
  } catch (error) {
    // Not fatal: the stale-claim path above will let a retry take it over
    // even if this delete did not land.
    console.error(`[razorpay-webhook] could not release claim ${eventId}: ${error.message}`);
  }
}

// POST /payments/webhook
//
// Razorpay's server-to-server confirmation, and the reason it exists: before
// this, an order only became paid if the customer's app came back and told us
// so. If the WebView crashed, the network dropped, or the customer closed the
// app on the Razorpay success screen, the money was taken and the order sat
// at payment_status "created" forever - no OTP for the customer, nothing owed
// to the shop, and no way to notice.
//
// It does NOT create orders. The Printlly order already exists before payment
// begins (POST /orders), and createRazorpayOrder stored our own
// razorpay_order_id on it. The webhook's job is to find that record and
// reconcile it - never to invent one. A webhook that created orders would,
// on a delayed delivery, produce a second order for a payment the client had
// already confirmed.
const handleRazorpayWebhook = async (req, res) => {
  // If the secret is not configured there is no way to authenticate the
  // caller, so there is nothing safe to do with the request. 503, not 200:
  // Razorpay should retry once configuration is fixed rather than have the
  // event silently discarded. (In production the server refuses to start in
  // this state at all - see config/razorpay.js.)
  if (!isWebhookConfigured) {
    logWebhook({ result: "rejected", reason: "webhook_secret_not_configured" });
    return res.status(503).json({ message: "Webhook not configured" });
  }

  const signature = req.headers["x-razorpay-signature"];
  const eventId = req.headers["x-razorpay-event-id"];

  // NOTHING below the signature check is trusted before it passes - not the
  // event type, not the amount, not the order id, not the payment id.
  if (!verifyWebhookSignature(req.body, signature, webhookSecret)) {
    // Logged without the signature, the body or any payload field: a request
    // that failed authentication is exactly the one whose contents should not
    // be written to our logs on its say-so.
    logWebhook({
      result: "rejected",
      reason: "invalid_signature",
      event_id: typeof eventId === "string" ? eventId : null,
      body_bytes: Buffer.isBuffer(req.body) ? req.body.length : 0,
    });
    // DELIBERATELY NOT ALERTED, and not sent to Sentry either.
    //
    // This endpoint is publicly reachable, so an unsigned or wrongly signed
    // request is something any stranger on the internet can produce at will.
    // Wiring it to an alert channel would hand that stranger a way to flood
    // the on-call channel, or to burn a Sentry quota, from a single curl
    // loop - turning the monitoring layer itself into the attack surface. A
    // rejected request that changed nothing is not an incident.
    //
    // It is still recorded in the application log above, which is where a
    // genuine pattern (a misconfigured secret after a rotation, say) shows up
    // as a run of rejections.
    //
    // 400, not 500 and not a retry: the request was not from Razorpay, or was
    // altered in flight. Nothing is modified - no order, no payment state, no
    // settlement, and no event record.
    return res.status(400).json({ message: "Invalid signature" });
  }

  // Only now is the body worth parsing.
  let event;
  try {
    event = JSON.parse(req.body.toString("utf8"));
  } catch {
    logWebhook({ result: "rejected", reason: "signed_body_was_not_json" });
    return res.status(400).json({ message: "Malformed payload" });
  }

  const eventType = typeof event.event === "string" ? event.event : "unknown";
  const payment = event.payload?.payment?.entity || {};
  const razorpayPaymentId = typeof payment.id === "string" ? payment.id : null;
  const razorpayOrderId = typeof payment.order_id === "string" ? payment.order_id : null;

  // Razorpay always sends the event id as a header. Falling back to a
  // deterministic key rather than a random one matters: a random fallback
  // would make every retry look like a new event and defeat deduplication.
  const idempotencyKey =
    (typeof eventId === "string" && eventId) ||
    (razorpayPaymentId ? `${eventType}:${razorpayPaymentId}` : null);

  if (!idempotencyKey) {
    logWebhook({ result: "rejected", reason: "no_event_id_or_payment_id", event_type: eventType });
    return res.status(400).json({ message: "Event could not be identified" });
  }

  const base = {
    _id: idempotencyKey,
    event_type: eventType,
    razorpay_order_id: razorpayOrderId,
    razorpay_payment_id: razorpayPaymentId,
  };

  try {
    // ---- events this integration does not act on ----
    if (eventType !== SUCCESS_EVENT && eventType !== FAILURE_EVENT) {
      const recorded = await recordEvent({
        ...base,
        result: "ignored",
        detail: ACKNOWLEDGED_EVENTS.has(eventType) ? "acknowledged, not acted on" : "event type not handled",
      });
      logWebhook({
        event_id: idempotencyKey,
        event_type: eventType,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        result: recorded ? "ignored" : "duplicate_ignored",
      });
      return res.status(200).json({ status: "ignored" });
    }

    // ---- idempotency gate ----
    //
    // Claimed BEFORE the business operation, not after. A redelivery that
    // arrives while the first is still being processed loses the insert and
    // returns here, so the operation cannot run twice concurrently.
    const claim = await claimEvent(base);
    if (claim.state === "duplicate") {
      const previous = claim.previous;
      logWebhook({
        event_id: idempotencyKey,
        event_type: eventType,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        internal_order_id: previous?.order_id ? String(previous.order_id) : null,
        result: "duplicate",
        previous_result: previous?.result || null,
      });
      // 200: the event HAS been handled, so Razorpay should stop retrying.
      return res.status(200).json({ status: "already_processed" });
    }

    const finish = async (result, detail, orderId = null) => {
      await WebhookEvent.updateOne(
        { _id: idempotencyKey },
        { $set: { result, detail, order_id: orderId } }
      );
      logWebhook({
        event_id: idempotencyKey,
        event_type: eventType,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
        internal_order_id: orderId ? String(orderId) : null,
        result,
        detail,
      });
    };

    // ---- reconciliation ----
    //
    // Only ever by an identifier WE issued and stored. Nothing here comes
    // from customer-supplied data: razorpay_order_id was written onto the
    // order by createRazorpayOrder, so finding the order this way proves the
    // payment belongs to it.
    if (!razorpayOrderId) {
      await finish("order_not_found", "event carried no razorpay order id");
      return res.status(200).json({ status: "no_order_reference" });
    }

    const order = await Order.findOne({ razorpay_order_id: razorpayOrderId });

    if (!order) {
      // No order is fabricated. A signed event for an order we have no record
      // of is acknowledged so Razorpay stops retrying, and recorded so it can
      // be investigated - it should not happen, and silently dropping it
      // would hide a real integration problem.
      await finish("order_not_found", "no order carries this razorpay order id");

      // P1, and genuinely urgent despite the 200. The signature PASSED, so
      // Razorpay really did take money for a razorpay_order_id this database
      // has no record of. That means a customer has been charged for an order
      // nobody can fulfil, and the only ways it happens are a lost write when
      // the order was created, a deployment pointed at the wrong database, or
      // two environments sharing one set of Razorpay keys - all of which need
      // a human today, and none of which a retry would fix.
      await alertP1({
        reason: ALERT.PAYMENT_ORDER_NOT_FOUND,
        title: "Paid Razorpay order has no matching Printlly order",
        summary:
          "A signature-verified Razorpay event references a razorpay_order_id that no order in this " +
          "database carries. The payment is real and the customer may have been charged, but there is " +
          "nothing to mark paid. Check whether this environment shares Razorpay keys with another, and " +
          "look the payment up in the Razorpay dashboard to arrange a refund if it cannot be matched.",
        facts: {
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          event_type: eventType,
        },
        dedupeKey: razorpayOrderId,
      });

      return res.status(200).json({ status: "order_not_found" });
    }

    // ---- failure event ----
    if (eventType === FAILURE_EVENT) {
      // Never from "paid". A failed-payment event arriving after a successful
      // one - out of order delivery, or a retried attempt on the same order -
      // must not undo a payment that actually went through.
      if (order.payment_status === "paid") {
        await finish("already_paid", "failure event ignored for an already-paid order", order._id);
        return res.status(200).json({ status: "already_paid" });
      }

      order.payment_status = "failed";
      await order.save();

      // After the save, and only on the actual transition - the already-paid
      // branch above returns first, so a late failure event can never tell a
      // customer their successful payment failed.
      await emitOrderEvent(order, ORDER_EVENTS.PAYMENT_FAILED);

      await finish("processed", "payment marked failed", order._id);
      return res.status(200).json({ status: "processed" });
    }

    // ---- amount validation, before anything is marked paid ----
    //
    // The server's own total is authoritative and is never overwritten from a
    // webhook. This compares, and refuses on mismatch, rather than trusting
    // the event's number.
    const expectedPaise = Math.round(order.total_amount * 100);
    const receivedPaise = Number(payment.amount);

    if (!Number.isFinite(receivedPaise) || receivedPaise !== expectedPaise) {
      await finish(
        "amount_mismatch",
        `expected ${expectedPaise} paise, event reported ${Number.isFinite(receivedPaise) ? receivedPaise : "a non-numeric amount"}`,
        order._id
      );
      // P0. An amount mismatch on a signature-verified event is the single
      // most serious thing this endpoint can see: the signature proves the
      // event came from Razorpay, so a disagreement about the amount means
      // either the order total changed after checkout began, or someone is
      // paying a different amount than the one they were quoted. Both are
      // money correctness problems, and the order has deliberately been left
      // unpaid - so a real customer may be stuck having paid something.
      //
      // Note what did NOT happen: the server's own total_amount was not
      // overwritten with the webhook's figure. The server's total is
      // authoritative and a webhook never restates it.
      await alertP0({
        reason: ALERT.PAYMENT_AMOUNT_MISMATCH,
        title: "Razorpay reported a different amount than the order total",
        summary:
          "A signature-verified payment event carried an amount that does not match this order's " +
          "server-calculated total. The order has NOT been marked paid and its amount has not been " +
          "changed. Reconcile manually in the Razorpay dashboard before touching the order.",
        facts: {
          order_id: String(order._id),
          razorpay_order_id: razorpayOrderId,
          razorpay_payment_id: razorpayPaymentId,
          expected_paise: expectedPaise,
          reported_paise: Number.isFinite(receivedPaise) ? receivedPaise : "non-numeric",
        },
        dedupeKey: String(order._id),
      });

      // The order is NOT marked paid and its amount is left alone. 200 so
      // Razorpay stops retrying - a retry would report the same mismatch -
      // while the anomaly is durably recorded for an operator.
      return res.status(200).json({ status: "amount_mismatch" });
    }

    if (payment.currency && payment.currency !== "INR") {
      await finish("amount_mismatch", `unexpected currency ${payment.currency}`, order._id);

      // Same severity as an amount mismatch, and for the same reason: the
      // whole platform prices in INR, so a verified payment in another
      // currency means the Razorpay account is configured in a way this
      // integration does not model, and the paise comparison above cannot be
      // trusted to mean what it appears to.
      await alertP0({
        reason: ALERT.PAYMENT_VERIFICATION_ANOMALY,
        title: "Razorpay payment in an unexpected currency",
        summary:
          "A signature-verified payment arrived in a currency other than INR. The order has NOT been " +
          "marked paid. Check the Razorpay account's enabled currencies.",
        facts: {
          order_id: String(order._id),
          razorpay_payment_id: razorpayPaymentId,
          currency: String(payment.currency).slice(0, 8),
        },
        dedupeKey: String(order._id),
      });

      return res.status(200).json({ status: "currency_mismatch" });
    }

    // ---- the state transition ----
    //
    // Shared with the client callback (utils/paymentConfirmation.js), so both
    // paths produce identical state and an already-paid order is left exactly
    // as it was - same OTP, same vendor_amount.
    const { outcome } = await markOrderPaid(order, { razorpayPaymentId });

    if (outcome === "already_paid") {
      // The normal, expected case when the client callback got there first.
      await finish("already_paid", "client callback had already confirmed this payment", order._id);
      return res.status(200).json({ status: "already_paid" });
    }

    if (outcome === "not_payable") {
      await finish("not_payable", `order status is "${order.status}"`, order._id);
      return res.status(200).json({ status: "not_payable" });
    }

    await finish("processed", "payment confirmed by webhook", order._id);
    return res.status(200).json({ status: "processed" });
  } catch (error) {
    // A database failure means we do not know whether the event was handled,
    // so the claim is released and Razorpay is asked to retry. Returning 200
    // here would permanently discard a real payment confirmation, which is
    // the worst outcome available: the customer is charged and the order
    // never becomes paid.
    await releaseClaim(idempotencyKey);

    console.error(
      `[razorpay-webhook] processing failed: ${JSON.stringify({
        event_id: idempotencyKey,
        event_type: eventType,
        razorpay_order_id: razorpayOrderId,
        error: error.message,
        timestamp: new Date().toISOString(),
      })}`
    );

    // P0. This is the failure that loses money quietly: the signature passed,
    // so the payment is real, but handling broke partway and we do not know
    // whether the order was marked paid. Razorpay will retry and the released
    // claim lets the retry reprocess - but Razorpay gives up eventually, and
    // if the underlying cause is still present when it does, the customer is
    // charged for an order that stays unpaid forever with no OTP and nothing
    // owed to the shop. That window is the reason this pages rather than
    // merely being recorded.
    await alertP0({
      reason: ALERT.PAYMENT_WEBHOOK_FAILURE,
      title: "Razorpay webhook processing failed",
      summary:
        "A signature-verified payment event could not be processed. A 500 was returned so Razorpay " +
        "will retry, and the idempotency claim was released so the retry can reprocess cleanly. If " +
        "this keeps happening, payment confirmations are being lost - check MongoDB availability " +
        "first, then Sentry for the stack trace.",
      facts: {
        event_id: idempotencyKey,
        event_type: eventType,
        razorpay_order_id: razorpayOrderId,
        razorpay_payment_id: razorpayPaymentId,
      },
      error,
    });

    return res.status(500).json({ message: "Webhook processing failed" });
  }
};

module.exports = { handleRazorpayWebhook, verifyWebhookSignature, safeCompareHex };
