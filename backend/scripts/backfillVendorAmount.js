// One-time backfill: snapshots vendor_amount onto orders that were paid
// BEFORE that field existed.
//
// vendor_amount is normally frozen at the moment payment is verified
// (paymentController.js) and never recomputed. Orders paid before this
// feature shipped have no snapshot at all, which would make them settle
// at zero - a vendor silently paid nothing for real work.
//
// This derives the value from total_amount and platform_fee as stored ON
// EACH ORDER. Those are themselves already-frozen per-order snapshots
// (see models/Order.js), so this reconstructs what the order was worth
// when it was placed - it does not consult the current platform fee, and
// running it twice changes nothing, because only orders with a null
// vendor_amount are touched.
//
// Safe to re-run. Run with: node scripts/backfillVendorAmount.js
require("dotenv").config();
const mongoose = require("mongoose");
const Order = require("../models/Order");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

  const stale = await Order.find({ payment_status: "paid", vendor_amount: null })
    .select("_id total_amount platform_fee")
    .lean();

  console.log(`paid orders missing a vendor_amount snapshot: ${stale.length}`);

  let updated = 0;
  for (const order of stale) {
    const amount = Math.round(((order.total_amount || 0) - (order.platform_fee || 0)) * 100) / 100;
    await Order.updateOne({ _id: order._id, vendor_amount: null }, { $set: { vendor_amount: amount } });
    updated += 1;
    console.log(`  ${order._id}  ${order.total_amount} - ${order.platform_fee} = ${amount}`);
  }

  const remaining = await Order.countDocuments({ payment_status: "paid", vendor_amount: null });
  console.log(`\nbackfilled ${updated}, still missing ${remaining}`);

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
