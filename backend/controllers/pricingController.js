const { getPricingSettings } = require("../utils/pricing");

// GET /pricing-config
// Public - no auth needed.
//
// platform_fee is the only genuinely global pricing concept left -
// everything else a customer pays (per-page rates, paper size, sides,
// finishing services) is now set per-shop (see models/Shop.js's `pricing`
// sub-document) and has no single "the" value to show here. A vendor
// reads/writes their own rates via GET/PATCH /shops/me/pricing; a
// customer sees them inline, already priced for a specific order, via
// GET /shops or POST /shops/compare-pricing. This route used to also
// return Settings' rate_per_page_bw/color, paper_size_rates,
// sides_extra_rate and service_rates, which was misleading once
// those stopped being what any order actually charges - removed rather
// than left in place implying otherwise.
//
// Not currently called by either frontend - kept for a future screen
// that wants to show the platform fee on its own (e.g. before checkout,
// "+₹X platform fee" ahead of picking a shop), not wired into anything
// yet since there's no such screen today.
const getPricingConfig = async (req, res) => {
  try {
    const settings = await getPricingSettings();
    res.status(200).json({
      platform_fee_type: settings.platform_fee_type,
      platform_fee_value: settings.platform_fee_value,
    });
  } catch (error) {
    console.error(`Failed to fetch pricing config: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch pricing config" });
  }
};

module.exports = { getPricingConfig };
