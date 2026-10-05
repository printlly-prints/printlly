const mongoose = require("mongoose");

// One record per Razorpay webhook event we have seen, which is what makes
// webhook processing idempotent.
//
// WHY THIS EXISTS
//
// Razorpay guarantees at-least-once delivery, not exactly-once: it retries
// an event until it gets a 2xx, so the same payment.captured can arrive
// several times. Without a durable record of what has already been handled,
// a retry would re-run the business operation - and the operation here
// writes vendor_amount, which is what a shop is eventually paid. Replaying
// it is a money bug.
//
// An in-memory Set would not do. It forgets everything on restart, and a
// deploy that happens between two delivery attempts is exactly when a retry
// arrives.
//
// The _id IS Razorpay's own event id (the X-Razorpay-Event-Id header), so
// the uniqueness that makes this work is the primary key itself - there is
// no separate unique index to add, and an insert of a duplicate fails with a
// duplicate-key error that the handler treats as "already processed". That
// is deliberately a write-first design: checking for existence and then
// inserting would leave a window in which two simultaneous deliveries of the
// same event both saw nothing and both proceeded.
const webhookEventSchema = new mongoose.Schema(
  {
    // Razorpay's event id, e.g. "evt_NlQ2cN1LKxkRJv".
    _id: {
      type: String,
      required: true,
    },
    event_type: {
      type: String,
      required: true,
    },
    // Razorpay's own identifiers, kept for reconciliation and for tracing a
    // payment back through the logs. Not secret - these are the same ids the
    // Razorpay dashboard shows.
    razorpay_order_id: {
      type: String,
      default: null,
    },
    razorpay_payment_id: {
      type: String,
      default: null,
    },
    // The Printlly order this event was reconciled to, if one was found.
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    // What the handler decided. Recorded so that an operator can answer
    // "what did we do with this event?" without re-deriving it, and so an
    // anomaly is visible rather than only present in a log line that may
    // have rotated away.
    //
    //   processing       - claimed, business operation in flight. Not a final
    //                      state: if the process dies mid-handling, a retry
    //                      is allowed to take the claim over (see
    //                      controllers/paymentWebhookController.js), because
    //                      treating it as done would discard a real payment
    //                      confirmation.
    //   processed        - the event changed payment state
    //   already_paid     - a success event for an order that was already paid
    //   ignored          - an event type this integration does not act on
    //   order_not_found  - no Printlly order carries that razorpay_order_id
    //   amount_mismatch  - the amount did not match our own total; NOT paid
    //   not_payable      - the order was expired or cancelled
    result: {
      type: String,
      enum: [
        "processing",
        "processed",
        "already_paid",
        "ignored",
        "order_not_found",
        "amount_mismatch",
        "not_payable",
      ],
      required: true,
    },
    // Free-text detail for the anomaly cases only. Never contains a payload,
    // a secret or customer data - see controllers/paymentWebhookController.js.
    detail: {
      type: String,
      default: "",
    },
    processed_at: {
      type: Date,
      default: Date.now,
    },
    // Drives the TTL index below.
    expires_at: {
      type: Date,
      required: true,
    },
  },
  { versionKey: false }
);

// Retention. This collection exists to deduplicate retries and to leave an
// audit trail, and neither needs to last forever: Razorpay stops retrying an
// event long before this, so a record older than the retention window can
// never be needed for deduplication again.
//
// 90 days is chosen to outlast a payment dispute cycle rather than to match
// the retry window, since the second purpose of these records is explaining
// after the fact why an order is in the state it is in.
//
// MongoDB does the deletion, so there is no cron to run - the same approach
// models/Session.js uses.
webhookEventSchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// For looking up every event touching one payment or order while
// investigating.
webhookEventSchema.index({ razorpay_order_id: 1 });

const RETENTION_DAYS = 90;

module.exports = mongoose.model("WebhookEvent", webhookEventSchema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
