import test from "node:test";
import assert from "node:assert/strict";
import { createReadCooldown } from "../src/utils/readCooldown.js";

test("read cooldown prevents polling and manual refresh bypass, then expires", () => {
  let now = 1000;
  const gate = createReadCooldown({ now: () => now });
  const request = { method: "get", url: "/orders/customer", authorization: "account-a" };
  gate.observe(request, 120);
  now += 20000;
  assert.equal(gate.remaining(request), 100);
  assert.equal(gate.remaining({ ...request }), 100);
  now += 100000;
  assert.equal(gate.remaining(request), 0);
});
test("cooldowns isolate accounts and encoded query URLs; mutation/charge requests are untouched", () => {
  const gate = createReadCooldown({ now: () => 0 });
  const request = { method: "get", url: "/shops?search=Campus", authorization: "account-a" };
  gate.observe(request, 30);
  assert.equal(gate.remaining({ ...request, authorization: "account-b" }), 0);
  assert.equal(gate.remaining({ ...request, url: "/shops?search=Clock" }), 0);
  assert.equal(gate.remaining({ ...request, method: "post" }), 0);
  gate.observe({ method: "post", url: "/payments/create", authorization: "account-a" }, 30);
  assert.equal(gate.remaining({ method: "get", url: "/payments/create", authorization: "account-a" }), 0);
});
test("cooldown memory is bounded and invalid delays cannot disable reads", () => {
  const gate = createReadCooldown({ now: () => 0, maxEntries: 2 });
  for (let index = 0; index < 3; index++) gate.observe({ url: `/${index}` }, 30);
  assert.equal(gate.remaining({ url: "/0" }), 0);
  assert.equal(gate.remaining({ url: "/2" }), 30);
  for (const delay of [NaN, Infinity, -1, 0]) gate.observe({ url: "/invalid" }, delay);
  assert.equal(gate.remaining({ url: "/invalid" }), 0);
});
