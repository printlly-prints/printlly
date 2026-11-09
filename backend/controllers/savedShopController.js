const SavedShop = require("../models/SavedShop");
const Shop = require("../models/Shop");
const { toPublicShop, AVAILABILITY_FIELDS } = require("../utils/shopStatus");
const { parseGeoPoint, distanceKmTo } = require("../utils/shopSearch");

// POST /saved-shops
// Saves a shop as a favourite for the logged-in customer.
const saveShop = async (req, res) => {
  try {
    const { shop_id } = req.body;
    if (!shop_id) {
      return res.status(400).json({ message: "shop_id is required" });
    }

    const shop = await Shop.findById(shop_id);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const saved = await SavedShop.create({ customer_id: req.user.id, shop_id });
    res.status(201).json(saved);
  } catch (error) {
    // Unique index violation - this shop is already saved by this customer.
    if (error.code === 11000) {
      return res.status(409).json({ message: "This shop is already saved" });
    }
    console.error(`Failed to save shop: ${error.message}`);
    res.status(500).json({ message: "Failed to save shop" });
  }
};

// DELETE /saved-shops/:shopId
// Removes a shop from the logged-in customer's saved list.
const unsaveShop = async (req, res) => {
  try {
    const result = await SavedShop.deleteOne({
      customer_id: req.user.id,
      shop_id: req.params.shopId,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ message: "This shop was not in your saved list" });
    }

    res.status(200).json({ message: "Shop removed from saved list" });
  } catch (error) {
    console.error(`Failed to remove saved shop: ${error.message}`);
    res.status(500).json({ message: "Failed to remove saved shop" });
  }
};

// GET /saved-shops
// The logged-in customer's saved shops, with shop details attached.
//
// The populate projection mirrors getActiveShops' exactly
// (shopController.js) and for the same reasons - a customer reads a shop
// the same way wherever they meet it. It's an INCLUSION list rather than
// the exclusion list this used to use, so kyc/owner_photo_url/
// verification_status/rejection_reason are never loaded at all (this
// route once populated with no projection whatsoever, which leaked all
// four), and `pricing` - which nothing on the saved-shops screen reads -
// no longer rides along either.
//
// is_open/business_hours are fetched because is_currently_open can't be
// computed without them, then stripped by toPublicShop in favour of that
// computed field - same rule as GET /shops and POST /shops/compare-pricing.
//
// Optional ?lat=&lng= adds distance_km to each populated shop (null if the
// shop has no location), same meaning as on GET /shops. Order is unchanged
// - most recently saved first.
const getSavedShops = async (req, res) => {
  try {
    const { point, error } = parseGeoPoint(req.query.lat, req.query.lng);
    if (error) {
      return res.status(400).json({ message: error });
    }

    // No .lean(), for the same reason getActiveShops doesn't use it: the
    // populated shop would then skip Mongoose's schema-default backfill,
    // and a shop document predating is_open/business_hours would come
    // back undefined and read as permanently closed (see models/Shop.js
    // and getActiveShops' own comment).
    const savedShops = await SavedShop.find({ customer_id: req.user.id })
      .populate(
        "shop_id",
        `shop_name address contact shop_photo_url locality location pricing.rate_per_page_bw pricing.rate_per_page_color ${AVAILABILITY_FIELDS}`
      )
      .sort({ created_at: -1 });

    const results = savedShops.map((saved) => {
      const plain = saved.toObject();
      if (plain.shop_id) {
        toPublicShop(plain.shop_id);
        if (point) plain.shop_id.distance_km = distanceKmTo(point, plain.shop_id);
      }
      return plain;
    });

    res.status(200).json(results);
  } catch (error) {
    console.error(`Failed to fetch saved shops: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch saved shops" });
  }
};

module.exports = { saveShop, unsaveShop, getSavedShops };
