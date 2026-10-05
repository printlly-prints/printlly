const mongoose = require("mongoose");

// An append-only trail of WHEN a shop's payout details changed, and which
// fields - deliberately never the values themselves.
//
// The purpose is fraud awareness, not reconstruction: a vendor's bank
// account being changed hours before a large settlement is worth an admin
// noticing, and that judgement only needs "the account number changed, at
// this time, by the owner". Storing the old and new account numbers would
// turn this collection into a second, longer-lived copy of exactly the
// data most worth stealing - and unlike Shop.payout, which holds one
// current value per shop, a log keeps every value the shop has ever had,
// forever. So it holds neither.
//
// Nothing ever updates or deletes a row here; the only writer is
// PATCH /shops/me/payout.
const payoutHistorySchema = new mongoose.Schema(
  {
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    // A plain list of which fields this edit touched, e.g.
    // "account_number, ifsc_code". Field NAMES only - see above.
    changed_field_summary: {
      type: String,
      required: true,
      maxlength: 200,
    },
    // Who made the change. Only a shop owner can edit their own payout
    // details today (PATCH /shops/me/payout is the sole writer), so this
    // is always that shop's owner - it is stored rather than assumed so
    // that a future admin-assisted correction is distinguishable from a
    // vendor's own edit instead of silently looking like one.
    changed_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    changed_by_role: {
      type: String,
      enum: ["shop_owner", "admin"],
      default: "shop_owner",
    },
    changed_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  // No timestamps: changed_at IS the timestamp, and a second
  // createdAt saying the same thing invites the two being read as
  // different events.
  { timestamps: false }
);

// The one query this collection exists to answer: "what has changed for
// this shop lately", newest first.
payoutHistorySchema.index({ shop_id: 1, changed_at: -1 });

module.exports = mongoose.model("PayoutHistory", payoutHistorySchema);
