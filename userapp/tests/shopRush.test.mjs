import test from 'node:test';
import assert from 'node:assert/strict';
import { shopRushLevel } from '../src/utils/shopRush.js';

test('closed shops suppress every cached rush level, including conflicting older status fields', () => {
  for (const level of ['low', 'medium', 'high']) {
    assert.equal(shopRushLevel({ shop_status: 'closed', is_currently_open: true, queue: { rush_level: level } }), null);
    assert.equal(shopRushLevel({ shop_status: 'open', is_currently_open: false, queue: { rush_level: level } }), null);
    assert.equal(shopRushLevel({ is_currently_open: false, queue: { rush_level: level } }), null);
  }
});

test('open and busy shops display only the backend classification without deriving a rush level from counts', () => {
  for (const status of ['open', 'busy']) for (const level of ['low', 'medium', 'high']) {
    assert.equal(shopRushLevel({ shop_status: status, queue: { rush_level: level, active_orders_count: 999 } }), level);
  }
  assert.equal(shopRushLevel({ is_currently_open: true, queue: { rush_level: 'low' } }), 'low');
  assert.equal(shopRushLevel({ shop_status: 'open', queue: { active_orders_count: 999 } }), null);
});

test('missing status, absent queue and unsupported server values do not invent a badge', () => {
  for (const shop of [null, {}, { queue: { rush_level: 'low' } }, { shop_status: 'open' }, { shop_status: 'busy', queue: { rush_level: 'unknown' } }]) assert.equal(shopRushLevel(shop), null);
});
