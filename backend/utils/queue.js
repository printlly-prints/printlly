const Order = require("../models/Order");
const { getPricingSettings } = require("./pricing");
const { computeShopAvailability } = require("./shopStatus");
const { WINDOW_MINUTES, calculateQueuePressure, WORKLOAD_EXPRESSION } = require("./queuePressure");

// Preserve the legacy active total; only pending/accepted consume production capacity.
const ACTIVE_QUEUE_STATUSES = ["pending", "accepted", "ready_for_pickup"];
const QUEUE_POSITION_STATUSES = ["pending", "accepted"];

async function getShopQueueInfo(shop, now = new Date()) {
  return (await getQueueInfoForShops([shop], now)).get(String(shop._id || shop));
}

// Callers supply already-loaded shop documents, including availability fields.
// Two indexed aggregations for the whole listing, never one query per shop.
async function getQueueInfoForShops(shops, now = new Date()) {
  if (!shops.length) return new Map();
  const ids = shops.map(shop => shop._id || shop);
  const [settings, active, recent] = await Promise.all([
    getPricingSettings(),
    Order.aggregate([
      { $match: { shop_id: { $in: ids }, payment_status: "paid", status: { $in: ACTIVE_QUEUE_STATUSES } } },
      { $group: { _id: "$shop_id",
        queued: { $sum: { $cond: [{ $in: ["$status", QUEUE_POSITION_STATUSES] }, 1, 0] } },
        ready: { $sum: { $cond: [{ $eq: ["$status", "ready_for_pickup"] }, 1, 0] } },
        units: { $sum: { $cond: [{ $in: ["$status", QUEUE_POSITION_STATUSES] }, WORKLOAD_EXPRESSION, 0] } },
      } },
    ]),
    Order.aggregate([
      { $match: { shop_id: { $in: ids }, payment_status: "paid", status: { $in: ["ready_for_pickup", "completed"] },
        ready_at: { $gte: new Date(now.getTime() - WINDOW_MINUTES * 60000), $lte: now } } },
      { $sort: { ready_at: 1, _id: 1 } },
      { $group: { _id: "$shop_id", count: { $sum: 1 }, units: { $sum: WORKLOAD_EXPRESSION },
        first_units: { $first: WORKLOAD_EXPRESSION },
        first: { $min: "$ready_at" }, last: { $max: "$ready_at" } } },
    ]),
  ]);
  const activeMap = new Map(active.map(row => [String(row._id), row]));
  const recentMap = new Map(recent.map(row => [String(row._id), row]));
  return new Map(shops.map(shop => {
    const id = String(shop._id || shop);
    return [id, calculateQueuePressure({ active: activeMap.get(id), recent: recentMap.get(id),
      closed: computeShopAvailability(shop, now).status === "closed", thresholds: settings.rush_thresholds, now })];
  }));
}

// An order's position in its own shop's print queue: how many OTHER paid
// orders at the same shop were placed earlier and are still queued ahead
// of it. Returns null once a position isn't meaningful any more:
//   - the order itself isn't paid yet (payment_status !== "paid"). The
//     task spec only names `status` as the gate, but every other queue
//     concept here is scoped to paid orders (see ACTIVE_QUEUE_STATUSES
//     usage above) and an order that hasn't secured a paid slot yet
//     doesn't have a real position to report - showing one would be
//     misleading, not just imprecise.
//   - or status has moved past QUEUE_POSITION_STATUSES (ready_for_pickup,
//     completed, cancelled, expired) - nothing is queued behind those any
//     more, the print itself is done or the order is over.
async function getQueuePosition(order) {
  if (order.payment_status !== "paid" || !QUEUE_POSITION_STATUSES.includes(order.status)) {
    return null;
  }

  // shop_id may already be a populated document (GET /orders/customer
  // populates it) or a plain ObjectId - handle both rather than assuming.
  const shopId = order.shop_id && order.shop_id._id ? order.shop_id._id : order.shop_id;

  return Order.countDocuments({
    _id: { $ne: order._id },
    shop_id: shopId,
    payment_status: "paid",
    status: { $in: QUEUE_POSITION_STATUSES },
    createdAt: { $lt: order.createdAt },
  });
}

// Builds the exact order response shape both GET /orders/customer and
// POST /payments/razorpay/verify send: the order as a plain object (a
// Mongoose document only serializes its schema paths, so queue_position
// couldn't just be set directly on the document instance) with
// queue_position attached when getQueuePosition finds it meaningful, and
// left off entirely otherwise - never sent as null. Kept as the one
// place that does this so the two call sites can't drift apart into
// showing the field under different conditions.
//
// Accepts either a hydrated Mongoose document or an already-plain object
// from a .lean() query, because its two callers legitimately differ:
// GET /orders/customer reads with .lean() (it only ever serializes the
// result to JSON), while POST /payments/razorpay/verify passes the live
// document it just saved. Copying a lean object rather than mutating it
// keeps this function free of side effects on its caller's data either
// way.
async function attachQueuePosition(order) {
  const plain = typeof order.toObject === "function" ? order.toObject() : { ...order };
  const position = await getQueuePosition(order);
  if (position !== null) {
    plain.queue_position = position;
  }
  return plain;
}

module.exports = {
  ACTIVE_QUEUE_STATUSES,
  QUEUE_POSITION_STATUSES,
  getShopQueueInfo,
  getQueueInfoForShops,
  getQueuePosition,
  attachQueuePosition,
};
