const Order = require("../models/Order");
const Settlement = require("../models/Settlement");
const { SETTLEABLE, round2 } = require("./settlement");

const IN_PROGRESS = ["pending", "accepted", "ready_for_pickup"];

// One order as an activity log entry. `audit` adds what only an admin sees.
// The pickup code is never included for anyone.
function toActivityOrder(order, { audit = false } = {}) {
  const customer = order.customer_id || {};
  const settlement = order.settlement_id;
  return {
    _id: order._id,
    created_at: order.createdAt,
    status: order.status,
    payment_status: order.payment_status,
    settlement_status: order.settlement_status,
    customer: {
      name: customer.name || null,
      phone: customer.phone || null,
      ...(audit ? { email: customer.email || null } : {}),
    },
    items: (order.documents || []).map((doc) => ({
      name: doc.original_name || null,
      pages: doc.page_count,
      copies: doc.copies,
      color_mode: doc.color_mode,
      paper_size: doc.paper_size,
      sides: doc.sides,
      services: (doc.services || []).map((service) => service.name),
      total: doc.pricing?.document_total ?? null,
    })),
    instructions: order.instructions || "",
    total_amount: order.total_amount,
    vendor_amount: order.vendor_amount,
    // Orders older than the timeline can still gain later events, like a
    // settlement, so check for the opening entry rather than for any entry.
    timeline:
      order.timeline?.[0]?.event === "placed"
        ? order.timeline
        : [{ event: "placed", at: order.createdAt, actor: "customer" }, ...(order.timeline || [])],
    settlement: settlement?._id
      ? {
          _id: settlement._id,
          settled_at: settlement.settled_at,
          reference_note: settlement.reference_note || "",
          ...(audit ? { settled_by_name: settlement.settled_by?.name || null } : {}),
        }
      : null,
    ...(audit
      ? {
          platform_fee: order.platform_fee,
          razorpay_order_id: order.razorpay_order_id,
          razorpay_payment_id: order.razorpay_payment_id,
        }
      : {}),
  };
}

function populateActivity(query, { audit = false } = {}) {
  return query
    .populate("customer_id", audit ? "name phone email" : "name phone")
    .populate({
      path: "settlement_id",
      select: "settled_at reference_note settled_by",
      ...(audit ? { populate: { path: "settled_by", select: "name" } } : {}),
    });
}

// A vendor only ever sees paid orders; an admin also sees unpaid attempts.
async function getVendorActivity(shopId, { limit, skip, audit = false }) {
  const scope = { shop_id: shopId, ...(audit ? {} : { payment_status: "paid" }) };

  const [summary] = await Order.aggregate([
    { $match: scope },
    {
      $group: {
        _id: null,
        total_requests: { $sum: 1 },
        in_progress: { $sum: { $cond: [{ $in: ["$status", IN_PROGRESS] }, 1, 0] } },
        completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
        earned: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, { $ifNull: ["$vendor_amount", 0] }, 0] },
        },
        printouts: {
          $sum: {
            $sum: {
              $map: {
                input: "$documents",
                as: "doc",
                in: { $multiply: ["$$doc.page_count", "$$doc.copies"] },
              },
            },
          },
        },
      },
    },
  ]);

  // One extra row says whether another page exists without a count query.
  const rows = await populateActivity(
    Order.find(scope).sort({ createdAt: -1 }).skip(skip).limit(limit + 1),
    { audit }
  ).lean();

  return {
    summary: {
      total_requests: summary?.total_requests || 0,
      in_progress: summary?.in_progress || 0,
      completed: summary?.completed || 0,
      earned: round2(summary?.earned || 0),
      printouts: summary?.printouts || 0,
    },
    orders: rows.slice(0, limit).map((order) => toActivityOrder(order, { audit })),
    has_more: rows.length > limit,
  };
}

const emptyBalance = () => ({
  pending_amount: 0,
  pending_orders: 0,
  pending_order_ids: [],
  oldest_pending_at: null,
  next_cycle_amount: 0,
  next_cycle_orders: 0,
  settled_in_period: 0,
  settled_total: 0,
});

// Pending, next-cycle and settled balances per shop. "Next cycle" is money
// already paid by customers on orders the shop hasn't finished.
async function getVendorBalances({ shopId, from, to } = {}) {
  const match = shopId ? { shop_id: shopId } : {};
  const inPeriod =
    from && to
      ? { $and: [{ $gte: ["$settled_at", from] }, { $lt: ["$settled_at", to] }] }
      : false;

  const [pending, nextCycle, settled] = await Promise.all([
    Order.aggregate([
      { $match: { ...SETTLEABLE, ...match } },
      {
        $group: {
          _id: "$shop_id",
          amount: { $sum: { $ifNull: ["$vendor_amount", 0] } },
          orders: { $sum: 1 },
          ids: { $push: "$_id" },
          oldest: { $min: "$createdAt" },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          ...match,
          payment_status: "paid",
          settlement_status: "unsettled",
          status: { $in: IN_PROGRESS },
        },
      },
      {
        $group: {
          _id: "$shop_id",
          amount: { $sum: { $ifNull: ["$vendor_amount", 0] } },
          orders: { $sum: 1 },
        },
      },
    ]),
    Settlement.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$shop_id",
          total: { $sum: "$total_amount" },
          period: { $sum: { $cond: [inPeriod, "$total_amount", 0] } },
        },
      },
    ]),
  ]);

  const balances = new Map();
  const entry = (id) => {
    const key = String(id);
    if (!balances.has(key)) balances.set(key, emptyBalance());
    return balances.get(key);
  };

  for (const row of pending) {
    Object.assign(entry(row._id), {
      pending_amount: round2(row.amount),
      pending_orders: row.orders,
      pending_order_ids: row.ids,
      oldest_pending_at: row.oldest,
    });
  }
  for (const row of nextCycle) {
    Object.assign(entry(row._id), {
      next_cycle_amount: round2(row.amount),
      next_cycle_orders: row.orders,
    });
  }
  for (const row of settled) {
    Object.assign(entry(row._id), {
      settled_in_period: round2(row.period),
      settled_total: round2(row.total),
    });
  }
  return balances;
}

module.exports = {
  toActivityOrder,
  populateActivity,
  getVendorActivity,
  getVendorBalances,
  emptyBalance,
};
