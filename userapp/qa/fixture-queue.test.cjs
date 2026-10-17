const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { queueForShop, stampFixtureReady } = require('./fixture-queue.cjs');
const shop = { _id: 'shop', shop_status: 'open' };
const row = (status, payment_status = 'paid') => ({ shop_id: 'shop', status, payment_status,
  documents: [{ page_count: 4, copies: 2 }] });

test('fixture uses production pressure, separating paid waiting, ready, cancelled and unpaid', () => {
  const orders = [row('accepted'), row('pending'), row('ready_for_pickup'), row('cancelled'), row('expired'), row('pending', 'created')];
  const queue = queueForShop(shop, orders);
  assert.equal(queue.queued_orders_count, 2);
  assert.equal(queue.ready_orders_count, 1);
  assert.equal(queue.active_orders_count, 3);
  assert.equal(queue.rush_level, 'low');
  assert.equal(queue.rush_basis, 'queue_count');
  assert.equal(queue.estimated_clearance_minutes, null);
  assert.equal(queueForShop({ ...shop, shop_status: 'closed' }, orders).rush_level, null);
});

test('fixture ready timestamp is only real accepted transition and cannot be overwritten', () => {
  const order = row('pending');
  const now = new Date();
  stampFixtureReady(order, 'ready_for_pickup', now);
  assert.equal(order.ready_at, undefined);
  order.status = 'accepted';
  stampFixtureReady(order, 'ready_for_pickup', now);
  assert.equal(order.ready_at, now.toISOString());
  order.status = 'ready_for_pickup';
  stampFixtureReady(order, 'ready_for_pickup', new Date(+now + 5000));
  assert.equal(order.ready_at, now.toISOString());
});

test('isolated HTTP fixture exposes the same live queue on list/detail/saved/compare/orders', async t => {
  // Separate ephemeral server; never touches the phone's running port 8083.
  const child = spawn(process.execPath, [path.join(__dirname, 'fixture-api.cjs')], {
    env: { ...process.env, PRINTLLY_QA_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
    let output = '';
    const timeout = setTimeout(() => reject(new Error('Fixture did not start')), 15000);
    child.once('error', reject);
    child.stdout.on('data', bytes => { output += bytes; const match = output.match(/http:\/\/127\.0\.0\.1:\d+/); if (match) { clearTimeout(timeout); resolve(match[0]); } });
    child.stderr.on('data', bytes => { output += bytes; });
    child.once('exit', code => { clearTimeout(timeout); reject(new Error(`Fixture exited ${code}: ${output}`)); });
  });
  const api = async (endpoint, method = 'GET', body) => {
    const response = await fetch(base + endpoint, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json(); assert.ok(response.ok, JSON.stringify(result)); return result;
  };
  const check = async expected => {
    const list = await api('/shops');
    const detail = await api('/shops/qa-shop');
    const standalone = await api('/shops/qa-shop/queue');
    const saved = await api('/saved-shops');
    const compare = await api('/shops/compare-pricing', 'POST', { documents: [{ page_count: 2, copies: 1 }] });
    const orders = await api('/orders/customer');
    for (const queue of [list[0].queue, detail.queue, standalone, saved[0].shop_id.queue, compare[0].queue, orders[0].shop_id.queue]) {
      assert.deepEqual(queue, detail.queue);
      assert.equal(queue.queued_orders_count, expected.queued);
      assert.equal(queue.ready_orders_count, expected.ready);
    }
    assert.equal(list[1].queue.rush_level, null);
    assert.equal(saved[1].shop_id.queue.rush_level, null);
    return detail.queue;
  };
  assert.equal((await check({ queued: 1, ready: 0 })).rush_level, 'low');
  const ready = await api('/qa/orders/qa-order/state', 'PATCH', { status: 'ready_for_pickup' });
  assert.ok(ready.ready_at);
  assert.equal((await check({ queued: 0, ready: 1 })).throughput_sample_orders, 1);
  const again = await api('/qa/orders/qa-order/state', 'PATCH', { status: 'ready_for_pickup' });
  assert.equal(again.ready_at, ready.ready_at);
  await api('/qa/orders/qa-order/state', 'PATCH', { status: 'cancelled' });
  assert.equal((await check({ queued: 0, ready: 0 })).throughput_sample_orders, 0);
});
