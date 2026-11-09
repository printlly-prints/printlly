const mongoose = require("mongoose");

// Represents a single print job placed by a customer at a shop.
//
// payment_status and status are deliberately separate fields describing
// two different things: payment_status is the Razorpay payment's state
// (see controllers/paymentController.js), status is the print workflow's
// state (pending -> accepted -> ready_for_pickup -> completed). A shop
// owner should never see, let alone act on, an order that hasn't been
// paid for - see the payment_status filter in getOrdersForShop.
//
// The otp is generated only once payment_status becomes "paid" (in
// paymentController.js's verify handler) and must be shown by the
// customer at pickup; the shop owner verifies it to mark completion.
const orderSchema = new mongoose.Schema(
  {
    customer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
    },
    // One order can bundle several documents, and EACH carries its own
    // print settings - a 40-page B&W handout and a 2-page laminated A3
    // poster are one order, not two. These fields used to live at the
    // order level, applying to everything in it.
    //
    // page_count is copied from the Upload record at order-creation time
    // (server-computed via pdf-parse) - never taken from client input.
    // The `pricing` sub-object is likewise computed server-side (see
    // utils/pricing.js) and stored per document so both frontends can
    // show which file cost what, rather than only an order total.
    documents: [
      {
        upload_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Upload",
          required: true,
        },
        file_url: {
          type: String,
          required: true,
        },
        // The uploaded filename, snapshotted here for the same reason
        // page_count is: the Upload record is DELETED when the order
        // completes (utils/documentCleanup.js), so an order's own history
        // is the only place its documents' names can survive. Without
        // this, a completed order's summary can only say "Document 1".
        // Optional, so orders placed before this field existed still load.
        original_name: {
          type: String,
          trim: true,
        },
        page_count: {
          type: Number,
          required: true,
        },
        color_mode: {
          type: String,
          enum: ["bw", "color"],
          required: true,
        },
        copies: {
          type: Number,
          required: true,
          min: 1,
        },
        paper_size: {
          type: String,
          enum: ["A4", "A3"],
          default: "A4",
        },
        sides: {
          type: String,
          enum: ["single", "double"],
          default: "single",
        },
        // Finishing services selected for THIS document, SNAPSHOTTED at
        // order-creation time from the shop's then-current list - name and
        // rate copied in, not referenced.
        //
        // That is the whole point: a vendor can rename "Lamination" to
        // "Matte Lamination", change its price, or delete it entirely, and
        // this order still says what the customer actually bought and what
        // they were actually charged. service_id records which of the
        // shop's services it was, for anyone wanting to trace it back - it
        // may no longer resolve, which is expected and fine.
        //
        // Two documents that each want binding are two things to bind, and
        // are charged twice: these are per document, not per order.
        services: [
          {
            service_id: { type: mongoose.Schema.Types.ObjectId },
            name: { type: String, required: true },
            rate: { type: Number, required: true, min: 0 },
            _id: false,
          },
        ],
        // This document's own share of the bill. The order-level totals
        // below are the sums of these across documents - stored rather
        // than recomputed on read so a historical order keeps the price
        // it was actually placed at, even after the shop changes its
        // rates.
        pricing: {
          base: { type: Number, required: true },
          paper_charge: { type: Number, required: true, default: 0 },
          sides_charge: { type: Number, required: true, default: 0 },
          services_charge: { type: Number, required: true, default: 0 },
          document_total: { type: Number, required: true },
        },
        _id: false,
      },
    ],
    instructions: {
      type: String,
      default: "",
    },
    // "expired" is set by cron/cleanupAbandonedOrders.js when a
    // pending/accepted order sits untouched for 48+ hours and its
    // documents get deleted - it's how the frontends distinguish a truly
    // abandoned order from one that's still genuinely in progress.
    status: {
      type: String,
      enum: ["pending", "accepted", "ready_for_pickup", "completed", "cancelled", "expired"],
      default: "pending",
    },
    // Nullable until payment is verified - see paymentController.js.
    // Never set from anywhere except the verify handler.
    otp: {
      type: String,
      default: null,
    },
    // Razorpay's payment state, independent of the print workflow
    // `status` above. "created" means an Order exists but no verified
    // payment has been attached yet (no razorpay_order_id, or one that
    // hasn't been verified). Set to "paid" only by a verified webhook-
    // equivalent HMAC check; set to "failed" when a signature check
    // fails, which still allows a fresh Razorpay order to be created
    // against this same record for a retry.
    payment_status: {
      type: String,
      enum: ["created", "paid", "failed"],
      default: "created",
      index: true,
    },
    // Set by POST /payments/razorpay/create-order, overwritten on every
    // retry. Compared against the id verify() receives back from
    // Razorpay to make sure a signature is being checked against an
    // order this record actually issued.
    razorpay_order_id: {
      type: String,
      default: null,
      // Indexed because the webhook reconciles by it: a Razorpay event names
      // its order id, and finding OUR order from that is the whole of the
      // lookup (see controllers/paymentWebhookController.js). Without this
      // index every webhook delivery is a collection scan.
      index: true,
    },
    // Razorpay's id for the payment that settled this order. Not stored
    // before the webhook existed, which left nothing to reconcile an event
    // against beyond the order id, and nothing to look up in the Razorpay
    // dashboard when investigating a specific order.
    //
    // Written by whichever confirmation path gets there first - the client
    // callback or the webhook - through utils/paymentConfirmation.js. Null on
    // any order that has never been paid, and on orders paid before this
    // field existed unless a later webhook backfills it.
    razorpay_payment_id: {
      type: String,
      default: null,
    },
    // Itemized pricing breakdown, computed server-side in
    // orderController.js - see utils/pricing.js. Kept as separate fields
    // (rather than one combined "amount") so both frontends can show a
    // real itemized bill.
    //
    // Each of these is the SUM of the same component across documents[]
    // above, never a separate calculation - an order's bill always adds
    // up to its own per-document line items. The names and meanings are
    // unchanged from when print settings were order-wide.
    base_subtotal: {
      type: Number,
      required: true,
    },
    paper_size_charge: {
      type: Number,
      required: true,
      default: 0,
    },
    sides_charge: {
      type: Number,
      required: true,
      default: 0,
    },
    services_charge: {
      type: Number,
      required: true,
      default: 0,
    },
    platform_fee: {
      type: Number,
      required: true,
    },
    total_amount: {
      type: Number,
      required: true,
    },
    // What the SHOP is owed for this order: total_amount minus
    // platform_fee, both of which are themselves already frozen on this
    // document.
    //
    // Snapshotted exactly once, at the moment payment_status becomes
    // "paid" (paymentController.js is the only writer), and never
    // recomputed afterwards. That is the whole point: the platform fee is
    // a setting an admin can change, and an order settled in March must
    // keep paying what it was worth in March. Deriving this at settlement
    // time would let a fee change silently restate what a vendor is owed
    // for work they already did.
    //
    // Null on any order that has never been paid - there is nothing owed
    // for one. An order can therefore be "completed" with a null here
    // only if it was never paid, which is why the settlement routes
    // require payment_status "paid" as well as status "completed".
    vendor_amount: {
      type: Number,
      default: null,
    },
    // Whether an admin has recorded paying the shop for this order. This
    // is bookkeeping about a transfer made BY HAND outside the platform
    // (see models/Settlement.js) - it is entirely separate from
    // payment_status, which is about the CUSTOMER paying US, and from
    // status, which is about the printing.
    settlement_status: {
      type: String,
      enum: ["unsettled", "settled"],
      default: "unsettled",
      index: true,
    },
    // The batch this order was settled in. Null until then.
    settlement_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Settlement",
      default: null,
    },
    // Append-only lifecycle, for tracing a complaint. Orders placed before
    // this field existed have no entries beyond what createdAt can say.
    timeline: [
      {
        event: { type: String, required: true },
        at: { type: Date, default: Date.now },
        actor: { type: String, enum: ["customer", "vendor", "admin", "system"], required: true },
        _id: false,
      },
    ],
  },
  { timestamps: true }
);

orderSchema.methods.logEvent = function logEvent(event, actor) {
  this.timeline.push({ event, actor });
};

// The settlement queries: "everything this shop is still owed for" and
// the platform-wide pending aggregation both filter on exactly this
// combination, and it is the query that grows fastest as orders
// accumulate - unsettled completed orders are a small slice of an
// ever-larger collection.
orderSchema.index({ shop_id: 1, settlement_status: 1, status: 1 });

// Matches getOrdersForShop, getShopQueueInfo/getQueueInfoForShops and
// getQueuePosition (utils/queue.js) - all three filter/aggregate on this
// exact {shop_id, payment_status, status} combination. The single-field
// payment_status index above doesn't cover a compound query like this.
orderSchema.index({ shop_id: 1, payment_status: 1, status: 1 });

// Matches getMyOrders (a customer's own order history) - the one query
// that filters by customer_id alone.
orderSchema.index({ customer_id: 1 });

module.exports = mongoose.model("Order", orderSchema);
