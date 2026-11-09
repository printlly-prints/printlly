const cron = require("node-cron");
const Order = require("../models/Order");
const { deleteOrderDocuments } = require("../utils/documentCleanup");
const { emitOrderEvent, ORDER_EVENTS } = require("../utils/orderEvents");

const ABANDONED_AFTER_MS = 48 * 60 * 60 * 1000; // 48 hours - print workflow
const PAYMENT_ABANDONED_AFTER_MS = 60 * 60 * 1000; // 1 hour - unpaid orders

// Deletes an abandoned order's documents and marks it expired. Shared by
// both cleanup passes below - the treatment is identical either way, only
// the reason for calling an order "abandoned" differs.
async function expireOrder(order, reasonLabel) {
  const { deleted, failed } = await deleteOrderDocuments(order);
  console.log(
    `[cleanupAbandonedOrders] order ${order._id} (${reasonLabel}): deleted ${deleted.length}, failed ${failed.length}`
  );

  // The order is being marked expired either way - cleanup failures are
  // already logged above for manual follow-up, but a customer's
  // abandoned order shouldn't stay stuck showing "pending" just because
  // one file failed to delete.
  try {
    order.status = "expired";
    order.logEvent("expired", "system");
    await order.save();
    await emitOrderEvent(order, ORDER_EVENTS.ORDER_EXPIRED);
  } catch (error) {
    console.error(`[cleanupAbandonedOrders] order ${order._id}: failed to mark expired - ${error.message}`);
  }
}

// Two independent reasons an order can be "abandoned":
//
// 1. Print-workflow abandonment (the original check): a customer's
//    document shouldn't sit on Cloudinary forever just because a shop
//    never accepted or never marked an order ready. "Stuck" is judged
//    from updatedAt (the last time the order's status actually changed),
//    so an order accepted 3 days ago and never advanced counts as stuck
//    for the same reason a pending order that was never even accepted
//    does.
//
// 2. Payment abandonment (new): an order whose payment_status is still
//    "created" an hour after being placed - the customer started
//    checkout (or never did) and never completed it. Payment should
//    resolve in minutes, not days, hence the much shorter window than
//    (1). Judged from createdAt, not updatedAt, since nothing about a
//    "created"/"pending" order ever updates it while it waits on
//    payment. Deliberately excludes payment_status "failed" - a failed
//    payment is allowed to retry (see paymentController.js), so it isn't
//    swept up here just because a retry is taking the customer a while;
//    only orders where the customer never got as far as a completed
//    verify attempt are caught by this check.
//
// An order old and unpaid enough to match both is only ever expired
// once - see the de-duplication below.
async function cleanupAbandonedOrders() {
  const workflowCutoff = new Date(Date.now() - ABANDONED_AFTER_MS);
  const paymentCutoff = new Date(Date.now() - PAYMENT_ABANDONED_AFTER_MS);

  const abandonedWorkflow = await Order.find({
    status: { $in: ["pending", "accepted"] },
    updatedAt: { $lt: workflowCutoff },
  });

  const abandonedPayment = await Order.find({
    payment_status: "created",
    status: "pending",
    createdAt: { $lt: paymentCutoff },
  });

  const alreadyQueued = new Set(abandonedWorkflow.map((o) => o._id.toString()));
  const paymentOnly = abandonedPayment.filter((o) => !alreadyQueued.has(o._id.toString()));

  const total = abandonedWorkflow.length + paymentOnly.length;
  if (total === 0) return;

  console.log(`[cleanupAbandonedOrders] found ${total} abandoned order(s) to clean up`);

  for (const order of abandonedWorkflow) {
    await expireOrder(order, `status "${order.status}" stuck since last update`);
  }
  for (const order of paymentOnly) {
    await expireOrder(order, "payment never completed within 1 hour");
  }
}

// Runs every 15 minutes. The 1-hour payment-abandonment window above
// only means something if the job actually runs often enough to catch it
// close to on time - the original 48-hour workflow check is unaffected
// by running more often, it just finds nothing new most of the time.
// noOverlap guards against a run still being in progress if a previous
// one somehow took longer than the interval.
function startAbandonedOrderCleanup() {
  cron.schedule(
    "*/15 * * * *",
    () => {
      cleanupAbandonedOrders().catch((error) => {
        console.error(`[cleanupAbandonedOrders] run failed: ${error.message}`);
      });
    },
    { name: "cleanup-abandoned-orders", noOverlap: true }
  );
  console.log("[cleanupAbandonedOrders] scheduled every 15 minutes");
}

module.exports = { startAbandonedOrderCleanup, cleanupAbandonedOrders };
