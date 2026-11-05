const mongoose = require("mongoose");

// Singleton document holding the platform's pricing configuration.
// Read via utils/pricing.js (getPricingSettings), which creates this
// document with the defaults below the first time it's needed - there is
// no seed script to run. Values are meant to be tuned later by editing
// this one document directly (no admin UI yet).
const settingsSchema = new mongoose.Schema(
  {
    rate_per_page_bw: {
      type: Number,
      required: true,
      default: 2,
    },
    rate_per_page_color: {
      type: Number,
      required: true,
      default: 8,
    },
    // Per-page-per-copy surcharge for paper size, on top of the bw/color
    // rate above. A4 is the baseline (no surcharge); A3 costs more per
    // physical sheet.
    paper_size_rates: {
      A4: { type: Number, required: true, default: 0 },
      A3: { type: Number, required: true, default: 5 },
    },
    // Starting value for a new shop's own sides_extra_rate: a flat
    // amount per page printed for double-sided. Like every other field
    // in this block it is ONLY a seed for POST /shops - no order is
    // priced from it (see the comment at the top of utils/pricing.js).
    //
    // Was sides_surcharge_percent, a percentage. A shop's duplex charge
    // is now a rupee amount the vendor sets directly, so the seed is one
    // too; scripts/migrateSidesToFlatRate.js converted the shops that
    // already existed.
    sides_extra_rate: {
      type: Number,
      required: true,
      default: 1,
    },
    // NOTE: there is deliberately no service_rates here any more.
    // Finishing services are vendor-defined per shop now (name, price and
    // all - see models/Shop.js), so there is no global list of them and
    // nothing generic to seed a new shop with. The fields above remain
    // only because they DO still seed a new shop's starting page rates.
    platform_fee_type: {
      type: String,
      enum: ["flat", "percentage"],
      required: true,
      default: "flat",
    },
    platform_fee_value: {
      type: Number,
      required: true,
      default: 5,
    },
    // Thresholds for the live shop rush/queue indicator - see
    // utils/queue.js and GET /shops/:shopId/queue. A shop's count of
    // paid pending/accepted orders maps to "Low" at 0..low_max,
    // "Medium" at low_max+1..medium_max, and "High" above that. These are
    // the fallback while reliable recent ready throughput is unavailable.
    rush_thresholds: {
      low_max: { type: Number, required: true, default: 2 },
      medium_max: { type: Number, required: true, default: 6 },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);
