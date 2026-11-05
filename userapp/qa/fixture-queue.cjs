// Exercise production queue math with disposable fixture records. No fabricated
// output timestamps or production data; legacy prebuilt orders have no ready_at.
const { calculateQueuePressure, workloadUnits, WINDOW_MINUTES } = require('../../backend/utils/queuePressure');
const { computeShopAvailability } = require('../../backend/utils/shopStatus');

function queueForShop(shop, orders, now = new Date()) {
  const own = orders.filter(order => String(order.shop_id?._id || order.shop_id) === String(shop._id)
    && order.payment_status === 'paid');
  const queued = own.filter(order => ['pending', 'accepted'].includes(order.status));
  const ready = own.filter(order => order.status === 'ready_for_pickup');
  const output = own.filter(order => ['ready_for_pickup', 'completed'].includes(order.status)
    && order.ready_at && +new Date(order.ready_at) >= +now - WINDOW_MINUTES * 60000
    && +new Date(order.ready_at) <= +now)
    .sort((a, b) => +new Date(a.ready_at) - +new Date(b.ready_at) || String(a._id).localeCompare(String(b._id)));
  return calculateQueuePressure({
    active: { queued: queued.length, ready: ready.length,
      units: queued.reduce((sum, order) => sum + workloadUnits(order.documents), 0) },
    recent: output.length ? { count: output.length,
      units: output.reduce((sum, order) => sum + workloadUnits(order.documents), 0),
      first_units: workloadUnits(output[0].documents), first: output[0].ready_at,
      last: output[output.length - 1].ready_at } : {},
    closed: computeShopAvailability(shop, now).status === 'closed', now,
  });
}

function stampFixtureReady(order, nextStatus, now = new Date()) {
  if (nextStatus === 'ready_for_pickup' && order.status === 'accepted' && !order.ready_at) {
    order.ready_at = now.toISOString();
  }
}

module.exports = { queueForShop, stampFixtureReady };
