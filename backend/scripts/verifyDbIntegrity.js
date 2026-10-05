require("dotenv").config();
const mongoose = require("mongoose");
const Shop = require("../models/Shop");
const Order = require("../models/Order");

// One-off maintenance script for the two NEEDS FIX items from the system
// audit (owner_id uniqueness on Shop, compound indexes on Order).
//
// 1. Checks for any EXISTING duplicate owner_id shops first - adding a
//    unique index over data that already violates it fails outright, so
//    this reports any offenders (and exits without touching indexes) so
//    they can be resolved by hand before rerunning.
// 2. If none are found, explicitly builds every index declared on Shop
//    and Order's schemas (models/Shop.js's new unique owner_id index,
//    models/Order.js's new {shop_id, payment_status, status} and
//    {customer_id} compound indexes) against the LIVE database, and logs
//    the resulting index list as confirmation - createIndexes() only
//    adds indexes missing from the schema, it never drops one that
//    happens to already exist outside it, so this is safe to rerun any
//    time (e.g. after a fresh deploy) rather than just once here.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log("Connected to MongoDB.");

  const dupes = await Shop.aggregate([
    { $group: { _id: "$owner_id", count: { $sum: 1 }, shopIds: { $push: "$_id" } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  if (dupes.length > 0) {
    console.error(
      `Found ${dupes.length} owner_id(s) with more than one Shop document. ` +
        "The unique index on Shop.owner_id CANNOT be created until these are resolved " +
        "(e.g. delete/merge the extra shop(s) for each owner_id below):"
    );
    console.error(JSON.stringify(dupes, null, 2));
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log("No duplicate owner_id shops found - safe to build the unique index.");

  await Shop.createIndexes();
  console.log("Shop.createIndexes() completed.");

  await Order.createIndexes();
  console.log("Order.createIndexes() completed.");

  const shopIndexes = await Shop.collection.indexes();
  const orderIndexes = await Order.collection.indexes();
  console.log("Shop collection indexes now:", JSON.stringify(shopIndexes, null, 2));
  console.log("Order collection indexes now:", JSON.stringify(orderIndexes, null, 2));

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("verifyDbIntegrity failed:", err.message);
  process.exit(1);
});
