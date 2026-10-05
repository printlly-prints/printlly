const mongoose = require("mongoose");

// One batch of orders an admin has paid a vendor for, OUTSIDE this
// platform - by UPI or a bank transfer they made themselves.
//
// No money moves through this system. A Settlement is a record that an
// admin says a transfer happened: it is bookkeeping and an audit trail,
// not a payout instruction. Nothing here talks to a payment gateway, and
// creating one of these does not cause anyone to be paid.
//
// Rows are effectively immutable once written. Marking a settlement as
// reversed or corrected is a separate concern and deliberately not
// modelled yet - a wrong settlement should be visible in the trail, not
// edited out of it.
const settlementSchema = new mongoose.Schema(
  {
    shop_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Shop",
      required: true,
      index: true,
    },
    // Exactly the orders this transfer covered. Each of these also
    // carries settlement_id pointing back here (see models/Order.js), so
    // the link is navigable from either end - from a settlement to what
    // it paid for, and from an order to when it was paid.
    order_ids: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
        required: true,
      },
    ],
    // The sum of those orders' vendor_amount at the moment of settling.
    // Stored rather than derived so this row still reads correctly even
    // if an order document is later changed or removed - a settlement is
    // a statement about a transfer that already happened, and it must not
    // be able to silently restate itself.
    total_amount: {
      type: Number,
      required: true,
      min: 0,
    },
    settled_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    settled_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // Free text the admin types in: a UTR number, a UPI reference, "paid
    // by cash on 3rd". Optional, because the transfer may not have one
    // worth recording, and deliberately unvalidated - this system does
    // not know what a valid reference looks like for every method, and
    // rejecting a real one the admin is holding would be worse than
    // storing it as typed.
    reference_note: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
  },
  { timestamps: true }
);

// The audit list: a shop's settlements, newest first.
settlementSchema.index({ shop_id: 1, settled_at: -1 });

module.exports = mongoose.model("Settlement", settlementSchema);
