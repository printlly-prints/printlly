const mongoose = require("mongoose");
const Shop = require("../models/Shop");
const Order = require("../models/Order");
const Settlement = require("../models/Settlement");
const { parsePagination } = require("../utils/pagination");
const { SETTLEABLE, round2 } = require("../utils/settlement");
const { sendTransactionalEmail } = require("../utils/email");

// Admin-side manual settlement tracking.
//
// NOTHING HERE MOVES MONEY. An admin makes a UPI or bank transfer
// themselves, outside this platform, and then records here that they did
// it. These routes are bookkeeping and an audit trail: they mark orders
// as accounted for and keep a trail of who marked them and when. No
// payment gateway is called from this file, and creating a settlement
// does not cause anyone to be paid.
//
// Every route in here is admin-only, enforced by the router-level
// requireRole("admin") in routes/adminRoutes.js.

function isValidObjectId(id) {
  return mongoose.Types.ObjectId.isValid(String(id));
}

// GET /admin/settlements/pending
// Every shop that is owed something, worst-wait-first.
//
// One aggregation across the whole orders collection, not a query per
// shop: the number of shops grows, and an admin opening this screen
// should not cost one round trip per vendor on the platform.
//
// Sorted by the OLDEST unsettled order, ascending - the vendor who has
// been waiting longest is the one an admin most needs to see, which is
// not the same as the one owed the most.
const getPendingSettlements = async (req, res) => {
  try {
    const rows = await Order.aggregate([
      { $match: SETTLEABLE },
      {
        $group: {
          _id: "$shop_id",
          unsettled_order_count: { $sum: 1 },
          // $ifNull so an order predating the vendor_amount snapshot
          // contributes 0 rather than turning the whole sum into null.
          // scripts/backfillVendorAmount.js exists to make sure there
          // are none of those; this is the belt to its braces.
          total_unsettled_amount: { $sum: { $ifNull: ["$vendor_amount", 0] } },
          oldest_unsettled_at: { $min: "$createdAt" },
        },
      },
      { $sort: { oldest_unsettled_at: 1 } },
      {
        $lookup: {
          from: "shops",
          localField: "_id",
          foreignField: "_id",
          as: "shop",
          // An inclusion projection inside the lookup: payout details
          // are NOT pulled into a list screen. An admin reads bank
          // details on the one shop they are about to pay, not for every
          // vendor on the platform at once.
          pipeline: [{ $project: { shop_name: 1, owner_id: 1 } }],
        },
      },
      { $unwind: "$shop" },
      {
        $lookup: {
          from: "users",
          localField: "shop.owner_id",
          foreignField: "_id",
          as: "owner",
          pipeline: [{ $project: { name: 1, email: 1 } }],
        },
      },
      // preserveNull: a shop whose owner account was deleted should
      // still appear here - it is still owed money, and silently
      // dropping it would hide a real debt.
      { $unwind: { path: "$owner", preserveNullAndEmptyArrays: true } },
    ]);

    res.status(200).json(
      rows.map((row) => ({
        shop_id: row._id,
        shop_name: row.shop.shop_name,
        owner_name: row.owner?.name || null,
        owner_email: row.owner?.email || null,
        unsettled_order_count: row.unsettled_order_count,
        total_unsettled_amount: round2(row.total_unsettled_amount),
        oldest_unsettled_at: row.oldest_unsettled_at,
      }))
    );
  } catch (error) {
    console.error(`Failed to list pending settlements: ${error.message}`);
    res.status(500).json({ message: "Failed to list pending settlements" });
  }
};

// GET /admin/settlements/shop/:shopId
// Everything an admin needs on one screen to actually make a transfer:
// where to send it, exactly what it covers, and what has been sent
// before.
//
// This is the ONE route that returns a shop's payout details, and it is
// admin-only. The list route above deliberately does not - see its
// comment.
const getShopSettlementDetail = async (req, res) => {
  try {
    const { shopId } = req.params;
    if (!isValidObjectId(shopId)) {
      return res.status(400).json({ message: "Invalid shop id" });
    }

    const shop = await Shop.findById(shopId)
      .select("shop_name address contact payout owner_id")
      .populate("owner_id", "name email")
      .lean();
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const unsettledOrders = await Order.find({ ...SETTLEABLE, shop_id: shop._id })
      .select("vendor_amount total_amount platform_fee createdAt status")
      .sort({ createdAt: 1 })
      .lean();

    const history = await Settlement.find({ shop_id: shop._id })
      .select("total_amount settled_at reference_note order_ids settled_by")
      .populate("settled_by", "name email")
      .sort({ settled_at: -1 })
      .lean();

    res.status(200).json({
      shop: {
        _id: shop._id,
        shop_name: shop.shop_name,
        address: shop.address,
        contact: shop.contact,
        owner_name: shop.owner_id?.name || null,
        owner_email: shop.owner_id?.email || null,
      },
      // Exactly as the vendor entered them - an admin has to read these
      // back character-for-character to make a real transfer, so nothing
      // here is masked or reformatted.
      payout: {
        account_holder_name: shop.payout?.account_holder_name || "",
        account_number: shop.payout?.account_number || "",
        ifsc_code: shop.payout?.ifsc_code || "",
        upi_id: shop.payout?.upi_id || "",
        updated_at: shop.payout?.updated_at || null,
      },
      unsettled: {
        order_count: unsettledOrders.length,
        total_amount: round2(
          unsettledOrders.reduce((sum, o) => sum + (o.vendor_amount || 0), 0)
        ),
        orders: unsettledOrders.map((o) => ({
          _id: o._id,
          created_at: o.createdAt,
          vendor_amount: o.vendor_amount,
          total_amount: o.total_amount,
          platform_fee: o.platform_fee,
        })),
      },
      settlements: history.map((row) => ({
        _id: row._id,
        settled_at: row.settled_at,
        total_amount: row.total_amount,
        reference_note: row.reference_note || "",
        order_count: row.order_ids.length,
        settled_by_name: row.settled_by?.name || null,
      })),
    });
  } catch (error) {
    console.error(`Failed to load shop settlement detail: ${error.message}`);
    res.status(500).json({ message: "Failed to load shop settlement detail" });
  }
};

// POST /admin/settlements/shop/:shopId/settle
// Records that the admin has paid this vendor for these orders.
//
// Body:
//   order_ids       optional. Omit to settle everything currently
//                   outstanding for this shop. Sending an explicit list
//                   is how a PARTIAL settlement is made - paying for
//                   three of five orders now and the rest later.
//   reference_note  optional. A UTR, a UPI reference, whatever the admin
//                   is holding.
//
// Every id sent is checked, and an unqualified one is rejected BY NAME
// with the reason - "order X is still printing" is actionable, "some
// orders were invalid" is not. Nothing is written unless every id
// qualifies: a partially-applied settlement would leave the admin unsure
// what they had just recorded paying for.
const settleShopOrders = async (req, res) => {
  try {
    const { shopId } = req.params;
    if (!isValidObjectId(shopId)) {
      return res.status(400).json({ message: "Invalid shop id" });
    }

    const shop = await Shop.findById(shopId).select("_id shop_name");
    if (!shop) {
      return res.status(404).json({ message: "Shop not found" });
    }

    const { order_ids, reference_note } = req.body || {};

    if (reference_note !== undefined && typeof reference_note !== "string") {
      return res.status(400).json({ message: "reference_note must be a string" });
    }
    if (typeof reference_note === "string" && reference_note.length > 200) {
      return res.status(400).json({ message: "reference_note must be 200 characters or fewer" });
    }

    let targetIds;

    if (order_ids === undefined) {
      // Settle everything outstanding. Read here and re-filtered by the
      // atomic update below, so an order that becomes settled between
      // these two steps simply isn't included rather than being counted
      // twice.
      const all = await Order.find({ ...SETTLEABLE, shop_id: shop._id }).select("_id").lean();
      if (all.length === 0) {
        return res.status(400).json({ message: "This shop has no unsettled completed orders." });
      }
      targetIds = all.map((o) => o._id);
    } else {
      if (!Array.isArray(order_ids) || order_ids.length === 0) {
        return res
          .status(400)
          .json({ message: "order_ids must be a non-empty array, or omitted to settle everything." });
      }
      const invalidFormat = order_ids.find((id) => !isValidObjectId(id));
      if (invalidFormat) {
        return res.status(400).json({ message: `"${invalidFormat}" is not a valid order id` });
      }

      const unique = [...new Set(order_ids.map(String))];
      const found = await Order.find({ _id: { $in: unique } })
        .select("_id shop_id status payment_status settlement_status")
        .lean();
      const byId = new Map(found.map((o) => [String(o._id), o]));

      // Each id is checked individually and the FIRST problem is
      // reported with the specific reason, so the admin knows which
      // order to look at and why it was refused.
      for (const id of unique) {
        const order = byId.get(id);
        if (!order) {
          return res.status(400).json({ message: `Order ${id} does not exist` });
        }
        if (String(order.shop_id) !== String(shop._id)) {
          return res.status(400).json({ message: `Order ${id} belongs to a different shop` });
        }
        if (order.status !== "completed") {
          return res
            .status(400)
            .json({ message: `Order ${id} is "${order.status}", not completed, so it cannot be settled` });
        }
        if (order.payment_status !== "paid") {
          return res.status(400).json({
            message: `Order ${id} was never paid for (payment_status "${order.payment_status}"), so nothing is owed on it`,
          });
        }
        if (order.settlement_status === "settled") {
          return res.status(400).json({ message: `Order ${id} has already been settled` });
        }
      }
      targetIds = unique.map((id) => new mongoose.Types.ObjectId(id));
    }

    // The settlement's id is minted up front so the orders can be
    // claimed atomically and the Settlement row written afterwards from
    // what was ACTUALLY claimed.
    //
    // The order matters. Writing the Settlement first and updating the
    // orders second would, if two admins settled the same shop at once,
    // leave a settlement row claiming orders the other batch had already
    // taken. Claiming first - with settlement_status "unsettled" still
    // in the filter, so the update itself is the lock - means each order
    // can only ever be claimed by one batch.
    const settlementId = new mongoose.Types.ObjectId();
    const settledAt = new Date();

    await Order.updateMany(
      { _id: { $in: targetIds }, shop_id: shop._id, ...SETTLEABLE },
      { $set: { settlement_status: "settled", settlement_id: settlementId } }
    );

    // What this batch actually got, which under a race may be fewer than
    // asked for. The total is summed from these, never from the request.
    const claimed = await Order.find({ settlement_id: settlementId })
      .select("_id vendor_amount")
      .lean();

    if (claimed.length === 0) {
      return res.status(409).json({
        message:
          "Those orders were settled by someone else just now. Reload the shop's settlement page and try again.",
      });
    }

    const settlement = await Settlement.create({
      _id: settlementId,
      shop_id: shop._id,
      order_ids: claimed.map((o) => o._id),
      total_amount: round2(claimed.reduce((sum, o) => sum + (o.vendor_amount || 0), 0)),
      settled_by: req.user.id,
      settled_at: settledAt,
      reference_note: typeof reference_note === "string" ? reference_note.trim() : "",
    });

    res.status(201).json({
      settlement: {
        _id: settlement._id,
        shop_id: settlement.shop_id,
        order_count: settlement.order_ids.length,
        order_ids: settlement.order_ids,
        total_amount: settlement.total_amount,
        settled_at: settlement.settled_at,
        reference_note: settlement.reference_note,
      },
      // Said explicitly in the response because it is the single most
      // important thing about this endpoint.
      note: "Recorded only. This platform does not transfer money - make the payment yourself if you have not already.",
    });

    // Tell the vendor, after the response. A settlement is about money owed
    // to them for work already delivered, and until now the only way they
    // could learn it had been recorded was to go looking in the dashboard.
    //
    // The email repeats the same caveat the response carries: Printlly
    // records the settlement, it does not move the money. Saying "a
    // settlement has been recorded" rather than "you have been paid" is the
    // difference between an accurate statement and one the platform cannot
    // back - nothing in this backend transfers funds to a vendor account.
    //
    // Keyed on the settlement id, which is unique per batch, so each
    // settlement produces exactly one email and a retried request cannot
    // produce a second.
    const owner = await Shop.findById(shop._id).select("owner_id").lean();
    if (owner && owner.owner_id) {
      await sendTransactionalEmail({
        event: "vendor_settlement_paid",
        userId: owner.owner_id,
        params: {
          shopName: shop.shop_name || "your shop",
          amount: settlement.total_amount,
          orderCount: settlement.order_ids.length,
          vendorName: "there",
        },
        shopId: shop._id,
        dedupeId: String(settlement._id),
      });
    }
  } catch (error) {
    console.error(`Failed to settle orders: ${error.message}`);
    res.status(500).json({ message: "Failed to settle orders" });
  }
};

// GET /admin/settlements
// The audit trail: every batch ever recorded, newest first, optionally
// filtered to one shop with ?shop_id=. Paginated with the same shared
// helper every other admin list uses.
const listSettlements = async (req, res) => {
  try {
    const filter = {};
    if (req.query.shop_id !== undefined) {
      if (!isValidObjectId(req.query.shop_id)) {
        return res.status(400).json({ message: "Invalid shop_id" });
      }
      filter.shop_id = req.query.shop_id;
    }

    const { limit, skip } = parsePagination(req.query);

    const rows = await Settlement.find(filter)
      .populate("shop_id", "shop_name")
      .populate("settled_by", "name email")
      .sort({ settled_at: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.status(200).json(
      rows.map((row) => ({
        _id: row._id,
        shop_id: row.shop_id?._id || row.shop_id,
        shop_name: row.shop_id?.shop_name || null,
        order_count: row.order_ids.length,
        order_ids: row.order_ids,
        total_amount: row.total_amount,
        settled_at: row.settled_at,
        settled_by_name: row.settled_by?.name || null,
        reference_note: row.reference_note || "",
      }))
    );
  } catch (error) {
    console.error(`Failed to list settlements: ${error.message}`);
    res.status(500).json({ message: "Failed to list settlements" });
  }
};

module.exports = {
  getPendingSettlements,
  getShopSettlementDetail,
  settleShopOrders,
  listSettlements,
};
