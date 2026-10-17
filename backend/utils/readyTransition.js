// Compare-and-set makes duplicate ready requests harmless. Missing legacy
// ready_at matches null; an existing timestamp is never overwritten.
async function markReadyOnce(Order, orderId, now = new Date()) {
  return Order.findOneAndUpdate(
    { _id: orderId, status: "accepted", ready_at: null },
    { $set: { status: "ready_for_pickup", ready_at: now } },
    { new: true, runValidators: true }
  );
}

module.exports = { markReadyOnce };
