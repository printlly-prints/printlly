const mongoose = require("mongoose");

// In-app notification, created automatically when something the user
// cares about changes - see utils/notifications.js for where these get
// created. Two families today:
//   - order_* / payment_success: for a CUSTOMER, about one of their orders.
//   - shop_approved / shop_rejected: for a SHOP OWNER, about their shop's
//     verification (see notifyShopVerification, triggered by the admin
//     panel's PATCH /admin/shops/:id/verify).
// GET /notifications is already role-agnostic (any logged-in user reads
// their own), so the vendor family needed no route changes.
const notificationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "payment_success",
        // Added for the authoritative payment-failure path: the Razorpay
        // webhook can now tell us a payment failed server-to-server, and a
        // customer whose payment did not go through is the person most in
        // need of being told. See utils/orderEvents.js.
        "payment_failed",
        "order_accepted",
        "order_ready",
        "order_completed",
        "order_expired",
        "shop_approved",
        "shop_rejected",
      ],
      required: true,
    },
    // Required for the order_* family, absent for the shop_* one - a
    // verification result isn't about any order, so this can't be a
    // schema-level `required: true` any more. Enforced per type in the
    // validator below rather than dropped entirely, so an order
    // notification still can't be created without the order it refers to.
    order_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: function () {
        return !String(this.type || "").startsWith("shop_");
      },
    },
    // Set for the shop_* family only, for the same reason in reverse.
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: function () {
        return String(this.type || "").startsWith("shop_");
      },
    },
    read: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

// Matches the GET /notifications access pattern exactly: this user's
// notifications, most recent first.
notificationSchema.index({ user_id: 1, created_at: -1 });

// One notification per (order, event type), enforced by the database.
//
// This is what makes notification delivery idempotent, and it has to be an
// index rather than a check-then-write: the Razorpay webhook is deliberately
// redeliverable, a controller can be retried, and two concurrent calls would
// both pass a read. A duplicate insert failing with code 11000 is the
// SUCCESS case meaning "already recorded" - utils/orderEvents.js treats it
// that way, and uses it to decide not to push to the customer's phone a
// second time for one business event.
//
// Partial, because the shop_* notification family has no order_id and several
// of those can legitimately exist for one shop (a rejection, a resubmission,
// an approval).
notificationSchema.index(
  { order_id: 1, type: 1 },
  { unique: true, partialFilterExpression: { order_id: { $exists: true } } }
);

module.exports = mongoose.model("Notification", notificationSchema);
