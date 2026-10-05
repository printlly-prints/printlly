const Shop = require("../models/Shop");
const User = require("../models/User");
const Order = require("../models/Order");
const Settings = require("../models/Settings");
const { getSignedKycUrl } = require("../utils/kycFileAccess");
const { notifyShopVerification } = require("../utils/notifications");
const { getPricingSettings, invalidatePricingSettingsCache } = require("../utils/pricing");
const { parsePagination } = require("../utils/pagination");

// Every handler in this file is mounted behind verifyToken +
// requireRole("admin") - see routes/adminRoutes.js, which applies both
// once at the router level rather than per route, so a route added there
// later cannot accidentally ship unprotected.
//
// These are the only routes in the API that read across every user's
// data. They are all either read-only or narrowly scoped to shop-level
// moderation (verify / deactivate / reactivate) plus the global Settings
// document; there is deliberately no admin route that mutates an order
// (see listOrders' comment).

// The shop fields an admin list needs to identify and triage a shop.
// Includes both public photos, so the list is scannable by sight rather
// than by name alone. payout is NEVER selected here - bank details are
// returned by exactly one route, GET /admin/settlements/shop/:shopId,
// for the one shop an admin is about to pay. kyc is NEVER selected here - the id proof is only ever surfaced through
// getShopDetail below, one shop at a time, as a freshly-signed
// short-lived URL.
const ADMIN_SHOP_LIST_FIELDS =
  "shop_name address contact shop_photo_url owner_photo_url verification_status rejection_reason is_active createdAt";

// GET /admin/shops
// Every shop on the platform, regardless of verification_status or
// is_active - the opposite of the customer-facing GET /shops, which only
// ever lists approved + active ones.
//
// Filters (all optional, combinable): ?verification_status=pending|
// approved|rejected, ?is_active=true|false, ?search=<shop name>.
// Paginated with the same shared helper every other list route uses.
const listShops = async (req, res) => {
  try {
    const { verification_status, is_active, search } = req.query;
    const filter = {};

    if (verification_status !== undefined) {
      if (!["pending", "approved", "rejected"].includes(verification_status)) {
        return res
          .status(400)
          .json({ message: "verification_status must be 'pending', 'approved' or 'rejected'" });
      }
      filter.verification_status = verification_status;
    }

    if (is_active !== undefined) {
      if (!["true", "false"].includes(is_active)) {
        return res.status(400).json({ message: "is_active must be 'true' or 'false'" });
      }
      filter.is_active = is_active === "true";
    }

    if (search) {
      // Escaped before being used as a regex - a shop name search box is
      // user input, and an unescaped "(" or "*" would otherwise throw a
      // regex parse error (or, with a pathological pattern, burn CPU).
      const escaped = String(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.shop_name = { $regex: escaped, $options: "i" };
    }

    const { limit, skip } = parsePagination(req.query);

    const shops = await Shop.find(filter)
      .select(ADMIN_SHOP_LIST_FIELDS)
      .populate("owner_id", "name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // All-time order count per shop, in ONE aggregation for the whole
    // page rather than a countDocuments per row - a 50-row page would
    // otherwise cost 50 extra round trips, and the count is incidental
    // to a list an admin is scanning, not worth that.
    //
    // Deliberately unfiltered by status or payment: this answers "how
    // much has this shop ever handled", which includes orders that were
    // cancelled or expired. A settlement figure it is not - that lives
    // in GET /admin/settlements/pending and counts only completed, paid,
    // unsettled ones.
    const counts = await Order.aggregate([
      { $match: { shop_id: { $in: shops.map((shop) => shop._id) } } },
      { $group: { _id: "$shop_id", count: { $sum: 1 } } },
    ]);
    const countByShopId = new Map(counts.map((row) => [String(row._id), row.count]));

    res.status(200).json(
      // A shop with no orders yet is absent from the aggregation, so it
      // gets an explicit 0 rather than an undefined the admin panel
      // would have to render around.
      shops.map((shop) => ({ ...shop, order_count: countByShopId.get(String(shop._id)) || 0 }))
    );
  } catch (error) {
    console.error(`Failed to list shops: ${error.message}`);
    res.status(500).json({ message: "Failed to list shops" });
  }
};

// GET /admin/shops/:id
// Everything the list view has for one shop, plus the KYC detail an admin
// needs to actually make a verification decision: id_proof_type,
// gst_number, and a freshly-signed, short-lived URL for the id proof
// document itself.
//
// The signed URL is generated per request and never stored or cached -
// that is the entire point of utils/kycFileAccess.js (see its comment):
// the id proof lives in Cloudinary as an "authenticated" asset with no
// working public URL, and the only sanctioned way to view it is a link
// that expires shortly after being handed out. Generating it here, one
// shop at a time, is also why the list route deliberately doesn't: signing
// a URL for every row of a table would mint dozens of live links to
// government IDs nobody asked to see.
const getShopDetail = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id).populate("owner_id", "name email phone");
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const plain = shop.toObject();

    // The raw Cloudinary public_id and its resource type never leave the
    // server, exactly as everywhere else in this codebase - only the
    // signed URL built from them does.
    const signedUrl = getSignedKycUrl(shop, { expiresInSeconds: 300 });
    if (plain.kyc) {
      delete plain.kyc.id_proof_url;
      delete plain.kyc.id_proof_resource_type;
    }

    plain.kyc_document = {
      // null when the vendor hasn't submitted KYC yet - the admin UI shows
      // "not submitted" rather than a broken viewer.
      signed_url: signedUrl,
      resource_type: shop.kyc?.id_proof_resource_type || null,
      expires_in_seconds: 300,
    };

    res.status(200).json(plain);
  } catch (error) {
    console.error(`Failed to fetch shop detail: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch shop detail" });
  }
};

// PATCH /admin/shops/:id/verify
// Approves or rejects a shop after an admin has reviewed its KYC.
//
// This replaces the old PATCH /shops/:id/verify - same logic, moved here
// where the rest of the admin surface lives, and removed from
// shopRoutes.js. The one addition over that route: the shop owner is now
// notified of the outcome, so a vendor learns their shop was approved or
// rejected instead of having to keep checking their dashboard.
const verifyShop = async (req, res) => {
  try {
    const { status, rejection_reason } = req.body;

    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "status must be 'approved' or 'rejected'" });
    }
    if (status === "rejected" && !rejection_reason) {
      return res.status(400).json({ message: "rejection_reason is required when rejecting a shop" });
    }

    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    shop.verification_status = status;
    // Cleared on approval so a shop that was rejected once and later
    // approved doesn't keep showing its old rejection reason.
    shop.rejection_reason = status === "rejected" ? rejection_reason : null;
    await shop.save();

    // After the save, and non-throwing by design (see the utility) - a
    // notification failure must not turn a completed decision into an
    // error response the admin would be tempted to retry.
    await notifyShopVerification(
      shop,
      status === "approved" ? "shop_approved" : "shop_rejected",
      shop.rejection_reason
    );

    // Same rule as everywhere else: the kyc file reference never appears
    // in any API response.
    const plain = shop.toObject();
    if (plain.kyc) {
      delete plain.kyc.id_proof_url;
      delete plain.kyc.id_proof_resource_type;
    }

    res.status(200).json(plain);
  } catch (error) {
    console.error(`Failed to update shop verification status: ${error.message}`);
    res.status(500).json({ message: "Failed to update shop verification status" });
  }
};

// PATCH /admin/shops/:id/deactivate
// The admin counterpart to the vendor's own PATCH /shops/me/deactivate -
// the same is_active flag, but for any shop on the platform (e.g. a policy
// violation) rather than only the caller's own. There is deliberately no
// owner-match check here: that absence IS the difference between the two
// routes, and requireRole("admin") is what authorizes it.
//
// Same rule as the vendor route about scope: deactivating stops the shop
// appearing in customer listings and stops NEW orders, and deliberately
// leaves orders already placed there alone so they can still be completed.
const deactivateShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    shop.is_active = false;
    // Blocks the vendor's own PATCH /shops/me/reactivate - only an admin
    // can bring this shop back (see reactivateShop below).
    shop.deactivated_by = "admin";
    await shop.save();

    res.status(200).json({ message: "Shop deactivated.", is_active: shop.is_active });
  } catch (error) {
    console.error(`Failed to deactivate shop: ${error.message}`);
    res.status(500).json({ message: "Failed to deactivate shop" });
  }
};

// PATCH /admin/shops/:id/reactivate
// Restores a shop that an admin (or its own owner) had deactivated.
//
// The old admin deactivate route was deliberately one-directional, on the
// stated grounds that undoing a takedown shouldn't be a single call
// "until an admin panel actually exists to make it with real context".
// This file is that panel's backend, so the counterpart now exists.
const reactivateShop = async (req, res) => {
  try {
    const shop = await Shop.findById(req.params.id);
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    // Allowed whoever deactivated it.
    shop.is_active = true;
    shop.deactivated_by = null;
    await shop.save();

    res.status(200).json({ message: "Shop reactivated.", is_active: shop.is_active });
  } catch (error) {
    console.error(`Failed to reactivate shop: ${error.message}`);
    res.status(500).json({ message: "Failed to reactivate shop" });
  }
};

// GET /admin/stats/overview
// The numbers behind the admin dashboard's cards.
//
// Every figure is computed in the database - countDocuments for the counts
// and one aggregation for revenue - rather than by loading documents into
// memory and counting them here. Revenue especially: summing platform_fee
// over every paid order in Node would mean fetching the entire orders
// collection on every dashboard load.
const getOverviewStats = async (req, res) => {
  try {
    // Start of today in IST, expressed as the UTC instant it corresponds
    // to. Uses the same fixed +5:30 offset as utils/shopStatus.js, and for
    // the same reason: "today" must mean the operator's day regardless of
    // what timezone the server happens to be running in.
    const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    const startOfTodayIst = Date.UTC(nowIst.getUTCFullYear(), nowIst.getUTCMonth(), nowIst.getUTCDate());
    const startOfToday = new Date(startOfTodayIst - IST_OFFSET_MS);

    const ACTIVE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

    const [
      total_customers,
      total_vendors,
      shops_pending_verification,
      shops_approved,
      shops_rejected,
      total_orders,
      orders_today,
      active_orders_right_now,
      revenueAgg,
    ] = await Promise.all([
      User.countDocuments({ role: "customer" }),
      User.countDocuments({ role: "shop_owner" }),
      Shop.countDocuments({ verification_status: "pending" }),
      Shop.countDocuments({ verification_status: "approved" }),
      Shop.countDocuments({ verification_status: "rejected" }),
      Order.countDocuments({}),
      Order.countDocuments({ createdAt: { $gte: startOfToday } }),
      Order.countDocuments({ payment_status: "paid", status: { $in: ACTIVE_STATUSES } }),
      Order.aggregate([
        { $match: { payment_status: "paid" } },
        { $group: { _id: null, total: { $sum: "$platform_fee" } } },
      ]),
    ]);

    res.status(200).json({
      total_customers,
      total_vendors,
      shops_pending_verification,
      shops_approved,
      shops_rejected,
      total_orders,
      orders_today,
      // The platform's own cut (platform_fee), not order totals - the rest
      // of an order's value belongs to the shop. An empty aggregation
      // result means "no paid orders yet" rather than a failure, hence the
      // explicit fallback to 0.
      total_platform_revenue: revenueAgg[0]?.total ?? 0,
      active_orders_right_now,
    });
  } catch (error) {
    console.error(`Failed to fetch overview stats: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch overview stats" });
  }
};

// GET /admin/orders
// Every order on the platform, for support and oversight.
//
// READ-ONLY BY DESIGN: there is deliberately no admin route that changes
// an order's status. Accepting, marking ready and completing all stay with
// the shop actually doing the work, and completing still requires the
// customer's OTP - an admin being able to fake-complete someone's order
// would quietly break the one guarantee that OTP exists to provide.
//
// Filters (all optional): ?status=, ?payment_status=, ?shop_id=,
// ?customer_id=, ?from=<ISO date>, ?to=<ISO date>. Paginated.
const listOrders = async (req, res) => {
  try {
    const { status, payment_status, shop_id, customer_id, from, to } = req.query;
    const filter = {};

    if (status !== undefined) {
      const allowed = ["pending", "accepted", "ready_for_pickup", "completed", "cancelled", "expired"];
      if (!allowed.includes(status)) {
        return res.status(400).json({ message: `status must be one of: ${allowed.join(", ")}` });
      }
      filter.status = status;
    }

    if (payment_status !== undefined) {
      if (!["created", "paid", "failed"].includes(payment_status)) {
        return res.status(400).json({ message: "payment_status must be 'created', 'paid' or 'failed'" });
      }
      filter.payment_status = payment_status;
    }

    if (shop_id !== undefined) filter.shop_id = shop_id;
    if (customer_id !== undefined) filter.customer_id = customer_id;

    // Date range on createdAt. An invalid date is rejected rather than
    // silently ignored - a support lookup quietly returning the wrong
    // window is worse than an error.
    if (from !== undefined || to !== undefined) {
      filter.createdAt = {};
      if (from !== undefined) {
        const fromDate = new Date(from);
        if (Number.isNaN(fromDate.getTime())) {
          return res.status(400).json({ message: "from must be a valid date" });
        }
        filter.createdAt.$gte = fromDate;
      }
      if (to !== undefined) {
        const toDate = new Date(to);
        if (Number.isNaN(toDate.getTime())) {
          return res.status(400).json({ message: "to must be a valid date" });
        }
        filter.createdAt.$lte = toDate;
      }
    }

    const { limit, skip } = parsePagination(req.query);

    // .lean() is safe on Order (every field read is required or always
    // written - see getMyOrders' comment in orderController.js) and these
    // go straight out as JSON.
    //
    // Populated with only what identifies a row in a support table: the
    // shop's name and the customer's name/phone. Never the full customer
    // User document - an admin looking up an order has no reason to
    // receive password hashes or auth provider details along with it.
    const orders = await Order.find(filter)
      .populate("shop_id", "shop_name")
      .populate("customer_id", "name phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json(orders);
  } catch (error) {
    console.error(`Failed to list orders: ${error.message}`);
    res.status(500).json({ message: "Failed to list orders" });
  }
};

// GET /admin/settings
// The global Settings singleton. Read through getPricingSettings so this
// sees exactly what the pricing code sees, cache and all.
const getSettings = async (req, res) => {
  try {
    const settings = await getPricingSettings();
    res.status(200).json(settings);
  } catch (error) {
    console.error(`Failed to fetch settings: ${error.message}`);
    res.status(500).json({ message: "Failed to fetch settings" });
  }
};

// PATCH /admin/settings
// The first route in this codebase that WRITES to the Settings document.
//
// Partial update, same spirit as the other PATCH routes: any field left
// out is untouched. platform_fee_type/value change what every future order
// is charged and rush_thresholds change how busy every shop appears, so
// both are validated strictly rather than trusted.
//
// invalidatePricingSettingsCache() is the important part here.
// getPricingSettings caches the document for 60 seconds (see
// utils/pricing.js) - a cache added when nothing could modify Settings.
// Without dropping it on write, an admin would save a new platform fee,
// see the old value on their own next read, and every order would keep
// being priced at the old fee for up to a minute after the save appeared
// to succeed.
const updateSettings = async (req, res) => {
  try {
    const { platform_fee_type, platform_fee_value, rush_thresholds } = req.body;

    if (platform_fee_type === undefined && platform_fee_value === undefined && rush_thresholds === undefined) {
      return res.status(400).json({
        message: "Send platform_fee_type, platform_fee_value and/or rush_thresholds to update.",
      });
    }

    const settings = await Settings.findOne();
    if (!settings) {
      // getPricingSettings creates this on first read, so a missing
      // document here means something is genuinely wrong rather than
      // merely un-seeded.
      return res.status(404).json({ message: "Settings document not found" });
    }

    if (platform_fee_type !== undefined) {
      if (!["flat", "percentage"].includes(platform_fee_type)) {
        return res.status(400).json({ message: "platform_fee_type must be 'flat' or 'percentage'" });
      }
      settings.platform_fee_type = platform_fee_type;
    }

    if (platform_fee_value !== undefined) {
      if (
        typeof platform_fee_value !== "number" ||
        !Number.isFinite(platform_fee_value) ||
        platform_fee_value < 0
      ) {
        return res.status(400).json({ message: "platform_fee_value must be a number >= 0" });
      }
      settings.platform_fee_value = platform_fee_value;
    }

    if (rush_thresholds !== undefined) {
      if (typeof rush_thresholds !== "object" || rush_thresholds === null) {
        return res.status(400).json({ message: "rush_thresholds must be an object" });
      }

      const { low_max, medium_max } = rush_thresholds;
      if (low_max !== undefined) {
        if (!Number.isInteger(low_max) || low_max < 0) {
          return res.status(400).json({ message: "rush_thresholds.low_max must be an integer >= 0" });
        }
        settings.rush_thresholds.low_max = low_max;
      }
      if (medium_max !== undefined) {
        if (!Number.isInteger(medium_max) || medium_max < 0) {
          return res.status(400).json({ message: "rush_thresholds.medium_max must be an integer >= 0" });
        }
        settings.rush_thresholds.medium_max = medium_max;
      }

      // The two thresholds define adjacent bands (low is 0..low_max,
      // medium is low_max+1..medium_max, high is everything above), so an
      // inverted pair would leave the medium band impossible to land in.
      // Checked against the values as they will be SAVED, not just the
      // ones sent, since either can be updated on its own.
      if (settings.rush_thresholds.medium_max <= settings.rush_thresholds.low_max) {
        return res.status(400).json({
          message: "rush_thresholds.medium_max must be greater than rush_thresholds.low_max",
        });
      }
    }

    await settings.save();
    invalidatePricingSettingsCache();

    res.status(200).json(settings);
  } catch (error) {
    console.error(`Failed to update settings: ${error.message}`);
    res.status(500).json({ message: "Failed to update settings" });
  }
};

module.exports = {
  listShops,
  getShopDetail,
  verifyShop,
  deactivateShop,
  reactivateShop,
  getOverviewStats,
  listOrders,
  getSettings,
  updateSettings,
};
