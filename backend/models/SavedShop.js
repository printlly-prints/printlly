const mongoose = require("mongoose");

// A customer's favourited/bookmarked shop, for quick access when
// browsing. The unique compound index means saving the same shop twice
// is a database-level guarantee, not just an application-level check.
const savedShopSchema = new mongoose.Schema(
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
  },
  { timestamps: { createdAt: "created_at", updatedAt: false } }
);

savedShopSchema.index({ customer_id: 1, shop_id: 1 }, { unique: true });

module.exports = mongoose.model("SavedShop", savedShopSchema);
