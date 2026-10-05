const mongoose = require("mongoose");

// One record per transactional email this application has decided to send.
//
// WHY THIS EXISTS: duplicate suppression, durably.
//
// Every email trigger in this codebase can fire more than once for one
// business event. Razorpay redelivers webhooks; a controller can be retried;
// two instances can process the same cron tick. Without a durable record,
// "order confirmed" arrives in a customer's inbox three times, which reads as
// a broken product and, for a payment email, as a possible double charge.
//
// An in-memory Set would not do, for the same reason it would not do for
// webhook idempotency (see models/WebhookEvent.js): it forgets on restart,
// and a deploy between two delivery attempts is exactly when the duplicate
// arrives.
//
// THE KEY IS THE PRIMARY KEY.
//
// _id is a deterministic string - "<event>:<subject id>", e.g.
// "order_paid:66f1a2...". Uniqueness is therefore the primary key itself, so
// claiming an email is a single insert whose duplicate-key error IS the
// answer "already sent". That is a write-first design on purpose: checking
// for existence and then inserting leaves a window where two concurrent
// triggers both see nothing and both send.
//
// WHAT IS DELIBERATELY NOT STORED
//
// No email address, no subject line, no body. The recipient is referenced by
// user_id and resolved from the User document at send time. That keeps this
// collection from becoming a second copy of the user table, and it means a
// customer who corrects their address gets the retry at the new one. Nor is
// any order detail stored - the order id is enough to reconstruct everything
// while investigating.
const emailDeliverySchema = new mongoose.Schema(
  {
    // "<event>:<subject id>". Built by utils/email.js, never by a caller.
    _id: {
      type: String,
      required: true,
    },
    // Which template was sent, for answering "did we ever email this
    // customer about X".
    event: {
      type: String,
      required: true,
    },
    // The recipient, by reference rather than by address. Null for the
    // operational emails that go to a configured address rather than to a
    // user.
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
    },
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      default: null,
    },
    //   claimed    - insert won, send in flight. NOT final: a process that
    //                dies here leaves this, and the retry pass takes it over
    //                after the claim goes stale, because treating it as sent
    //                would silently drop a payment confirmation.
    //   sent       - the provider accepted it
    //   retrying   - a transient provider failure; next_attempt_at is set
    //   failed     - permanently failed, or out of attempts. No further tries.
    //   skipped    - deliberately not sent (no provider configured, no
    //                address on the account, or email disabled)
    status: {
      type: String,
      enum: ["claimed", "sent", "retrying", "failed", "skipped"],
      required: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    // Scrubbed provider error, for diagnosis. Never a body, never a key -
    // utils/email.js passes it through utils/scrub.js first.
    last_error: {
      type: String,
      default: "",
    },
    // When the retry pass may try again. Null for every state but "retrying",
    // which is what makes the retry query a plain index scan.
    next_attempt_at: {
      type: Date,
      default: null,
    },
    // The provider's own message id, when it returns one. Useful for asking
    // Brevo what happened to a specific delivery.
    provider_message_id: {
      type: String,
      default: "",
    },
    claimed_at: {
      type: Date,
      default: Date.now,
    },
    sent_at: {
      type: Date,
      default: null,
    },
    expires_at: {
      type: Date,
      required: true,
    },
  },
  { versionKey: false }
);

// Retention. This collection exists to deduplicate and to leave an audit
// trail of what was sent; neither needs to last forever. 90 days matches
// models/WebhookEvent.js and outlasts a payment dispute cycle, which is the
// window in which "was the customer ever told?" actually gets asked.
//
// MongoDB performs the deletion, so there is no cron for it.
emailDeliverySchema.index({ expires_at: 1 }, { expireAfterSeconds: 0 });

// The retry pass's query: due retries, oldest first. Partial so the index
// holds only the handful of rows in flight rather than every email ever sent.
emailDeliverySchema.index(
  { next_attempt_at: 1 },
  { partialFilterExpression: { status: "retrying" } }
);

// For "what have we emailed this user / about this order".
emailDeliverySchema.index({ user_id: 1, claimed_at: -1 });
emailDeliverySchema.index({ order_id: 1 });

const RETENTION_DAYS = 90;

module.exports = mongoose.model("EmailDelivery", emailDeliverySchema);
module.exports.RETENTION_DAYS = RETENTION_DAYS;
