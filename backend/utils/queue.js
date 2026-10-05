const Order = require("../models/Order");
const { getPricingSettings } = require("./pricing");

// Statuses that count towards a SHOP's overall "how busy does this place
// look" indicator (GET /shops, GET /shops/:shopId/queue) - anything the
// shop hasn't finished handling yet. Deliberately wider than
// QUEUE_POSITION_STATUSES below: a ready_for_pickup order still occupies
// the shop's attention (the customer hasn't collected it yet), so it
// still counts here even though it no longer counts as something a later
// order is queued behind.
const ACTIVE_QUEUE_STATUSES = ["pending", "accepted", "ready_for_pickup"];

// Statuses that still count towards an order's own position in line.
// Once an order reaches ready_for_pickup its print is already done - it
// isn't "ahead" of anything in the print queue any more, even though it
// still counts towards ACTIVE_QUEUE_STATUSES above.
const QUEUE_POSITION_STATUSES = ["pending", "accepted"];

// count -> "low" | "medium" | "high" using Settings.rush_thresholds.
function rushLevelFor(count, thresholds) {
  if (count <= thresholds.low_max) return "low";
  if (count <= thresholds.medium_max) return "medium";
  return "high";
}

// Queue info for ONE shop - GET /shops/:shopId/queue.
// getPricingSettings() despite its name just returns the one Settings
// singleton document (creating it with schema defaults the first time
// anything asks for it) - reused here rather than adding a parallel
// "get settings" getter for what is still the same one document.
async function getShopQueueInfo(shopId) {
  const settings = await getPricingSettings();

  const active_orders_count = await Order.countDocuments({
    shop_id: shopId,
    payment_status: "paid",
    status: { $in: ACTIVE_QUEUE_STATUSES },
  });

  return {
    active_orders_count,
    rush_level: rushLevelFor(active_orders_count, settings.rush_thresholds),
  };
}

// Queue info for MANY shops at once - GET /shops, so the listing does one
// aggregation query total rather than one COUNT per shop (N+1). Returns a
// Map keyed by shop id (string) -> { active_orders_count, rush_level }.
// A shop with zero active orders never appears in the aggregation's
// output at all, so it's filled in afterwards rather than left absent.
async function getQueueInfoForShops(shopIds) {
  const settings = await getPricingSettings();

  const counts = await Order.aggregate([
    {
      $match: {
        shop_id: { $in: shopIds },
        payment_status: "paid",
        status: { $in: ACTIVE_QUEUE_STATUSES },
      },
    },
    { $group: { _id: "$shop_id", count: { $sum: 1 } } },
  ]);

  const countByShopId = new Map(counts.map((c) => [c._id.toString(), c.count]));

  const result = new Map();
  for (const shopId of shopIds) {
    const count = countByShopId.get(shopId.toString()) || 0;
    result.set(shopId.toString(), {
      active_orders_count: count,
      rush_level: rushLevelFor(count, settings.rush_thresholds),
    });
  }
  return result;
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
