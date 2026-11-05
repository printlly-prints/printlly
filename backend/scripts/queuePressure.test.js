const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateQueuePressure, workloadUnits } = require('../utils/queuePressure');
const now = new Date('2026-10-17T10:00:00Z');
const sample = { count: 30, units: 6000, first_units: 200, first: new Date(now - 50 * 60000), last: new Date(now - 2 * 60000) };

test('closed shops retain truthful counts but never rush or an estimate', () => {
  const result = calculateQueuePressure({ active: { queued: 50, ready: 8, units: 500 }, recent: sample, closed: true, now });
  assert.equal(result.rush_level, null);
  assert.equal(result.estimated_clearance_minutes, null);
  assert.equal(result.active_orders_count, 58);
  assert.equal(result.rush_basis, 'closed');
});
test('sparse, stale and burst samples fall back to configured queued count thresholds', () => {
  for (const recent of [{}, { ...sample, count: 4 }, { ...sample, last: sample.first },
    { ...sample, last: new Date(now - 20 * 60000) }, { ...sample, last: new Date(+now + 60000) }]) {
    const result = calculateQueuePressure({ active: { queued: 8, ready: 50 }, recent, now });
    assert.equal(result.rush_level, 'high');
    assert.equal(result.rush_basis, 'queue_count');
    assert.equal(result.estimated_clearance_minutes, null);
  }
  assert.equal(calculateQueuePressure({ active: { queued: 4 }, thresholds: { low_max: 5, medium_max: 9 }, now }).rush_level, 'low');
});
test('a large queue clearing quickly can have lower pressure than a small slow queue', () => {
  const fast = calculateQueuePressure({ active: { queued: 20, units: 800 }, recent: sample, now });
  const slow = calculateQueuePressure({ active: { queued: 3, units: 600 }, recent: { ...sample, units: 300, first_units: 10 }, now });
  assert.equal(fast.rush_level, 'low');
  assert.equal(fast.estimated_clearance_minutes, 7);
  assert.equal(slow.rush_level, 'high');
  assert.equal(slow.estimated_clearance_minutes, 100);
});
test('workload accounts for page-copies and finishing, not just equal order counts', () => {
  assert.equal(workloadUnits([{ page_count: 2, copies: 3, services: [{ name: 'Binding' }] }]), 21);
  assert.ok(workloadUnits([{ page_count: 500, copies: 2 }]) > workloadUnits([{ page_count: 1, copies: 1 }]));
  assert.equal(calculateQueuePressure({ active: { queued: 1, units: 100000 }, recent: sample, now }).estimated_clearance_minutes, 240);
});
test('ready collection backlog does not consume print queue pressure', () => {
  const result = calculateQueuePressure({ active: { queued: 0, ready: 90 }, recent: sample, now });
  assert.equal(result.rush_level, 'low');
  assert.equal(result.estimated_clearance_minutes, 0);
  assert.equal(result.active_orders_count, 90);
  assert.equal(result.queued_orders_count, 0);
});

test('batch service uses two aggregates for many shops, scopes paid states and real ready timestamps', async () => {
  const orderPath = require.resolve('../models/Order');
  const pricingPath = require.resolve('../utils/pricing');
  const queuePath = require.resolve('../utils/queue');
  const originals = [orderPath, pricingPath, queuePath].map(p => require.cache[p]);
  const pipelines = [];
  require.cache[orderPath] = { id: orderPath, filename: orderPath, loaded: true, exports: { aggregate: async pipeline => {
    pipelines.push(pipeline);
    return pipelines.length === 1 ? [{ _id: 'open', queued: 8, ready: 3, units: 500 }] : [{ _id: 'open', ...sample }];
  } } };
  require.cache[pricingPath] = { id: pricingPath, filename: pricingPath, loaded: true, exports: { getPricingSettings: async () => ({ rush_thresholds: { low_max: 2, medium_max: 6 } }) } };
  delete require.cache[queuePath];
  try {
    const { getQueueInfoForShops } = require('../utils/queue');
    const result = await getQueueInfoForShops([{ _id: 'open', shop_status: 'open' }, { _id: 'closed', shop_status: 'closed' }], now);
    assert.equal(pipelines.length, 2);
    assert.equal(pipelines[0][0].$match.payment_status, 'paid');
    assert.deepEqual(pipelines[0][0].$match.status.$in, ['pending', 'accepted', 'ready_for_pickup']);
    assert.deepEqual(pipelines[1][0].$match.status.$in, ['ready_for_pickup', 'completed']);
    assert.ok(pipelines[1][0].$match.ready_at.$gte);
    assert.equal(result.get('open').rush_level, 'low');
    assert.equal(result.get('closed').rush_level, null);
    await getQueueInfoForShops([], now);
    assert.equal(pipelines.length, 2);
  } finally { [orderPath, pricingPath, queuePath].forEach((p, i) => { if (originals[i]) require.cache[p] = originals[i]; else delete require.cache[p]; }); }
});

test('ready timestamp is compare-and-set once from accepted, never on pickup or duplicate calls', async () => {
  const { markReadyOnce } = require('../utils/readyTransition');
  const record = { _id: 'job', status: 'accepted', ready_at: null };
  const Order = { findOneAndUpdate: async (filter, update, options) => {
    assert.deepEqual(filter, { _id: 'job', status: 'accepted', ready_at: null });
    assert.deepEqual(options, { new: true, runValidators: true });
    if (record.status !== filter.status || record.ready_at !== null) return null;
    Object.assign(record, update.$set);
    return { ...record };
  } };
  const results = await Promise.all([markReadyOnce(Order, 'job', now), markReadyOnce(Order, 'job', new Date(+now + 1000))]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.equal(+record.ready_at, +now);
  assert.equal(record.status, 'ready_for_pickup');
  record.status = 'completed';
  assert.equal(await markReadyOnce(Order, 'job', new Date(+now + 2000)), null);
  assert.equal(+record.ready_at, +now);
});

test('a fast shop after fifty idle minutes uses observed output interval, excludes first job', () => {
  const recent = { count: 5, units: 505, first_units: 5,
    first: new Date(now - 10 * 60000), last: now };
  const result = calculateQueuePressure({ active: { queued: 20, units: 600 }, recent, now });
  assert.equal(result.estimated_clearance_minutes, 12);
  assert.equal(result.rush_level, 'low');
  // A giant first job was processed before our interval, so its units must
  // never turn the remaining four small jobs into apparent huge capacity.
  const firstJobHeavy = calculateQueuePressure({ active: { queued: 20, units: 600 },
    recent: { ...recent, units: 10005, first_units: 10000 }, now });
  assert.equal(firstJobHeavy.estimated_clearance_minutes, 240);
  assert.equal(firstJobHeavy.rush_level, 'high');
  assert.equal(calculateQueuePressure({ active: { queued: 20, units: 600 },
    recent: { ...recent, first: new Date(now - 9 * 60000) }, now }).rush_basis, 'queue_count');
});
