import test from "node:test";
import assert from "node:assert/strict";
import { createReadCooldown } from "./readCooldown.js";

test("server GET delay blocks repeated reads until expiry, preserving account and full URL isolation", () => {
  let time = 1000;
  const gate = createReadCooldown({ now: () => time });
  const read = { method: "get", uri: "https://api.example/orders?skip=0", authorization: "Bearer account-a" };
  gate.remember(read, 429, "5");
  assert.equal(gate.remaining(read).deadline, 6000);
  time = 3000;
  assert.equal(gate.remaining(read).deadline, 6000, "polling cannot extend the original deadline");
  assert.equal(gate.remaining({ ...read, authorization: "Bearer account-b" }), null);
  assert.equal(gate.remaining({ ...read, uri: "https://api.example/orders?skip=100" }), null);
  assert.equal(gate.remaining({ ...read, method: "post" }), null);
  time = 6000;
  assert.equal(gate.remaining(read), null);
});

test("HTTP-date headers work; missing/invalid delays and mutations do not create cooldowns", () => {
  let time = Date.parse("2026-10-17T10:00:00Z");
  const gate = createReadCooldown({ now: () => time, maxEntries: 2 });
  const read = { uri: "/shops", authorization: "" };
  gate.remember(read, 429, "Sat, 17 Oct 2026 10:00:05 GMT");
  assert.equal(gate.remaining(read).deadline, time + 5000);
  for (const retryAfter of [undefined, "", "-5", "invalid", "Infinity"]) gate.remember({ uri: `/bad/${retryAfter}` }, 429, retryAfter);
  assert.equal(gate.remaining({ uri: "/bad/invalid" }), null);
  gate.remember({ method: "post", uri: "/payments" }, 429, "60");
  assert.equal(gate.remaining({ uri: "/payments" }), null);
  gate.remember({ uri: "/second" }, 429, "60");
  gate.remember({ uri: "/third" }, 429, "60");
  assert.equal(gate.remaining(read), null, "the memory-only cache has a fixed entry bound");
  assert.ok(gate.remaining({ uri: "/second" }));
  time += 60000;
  assert.equal(gate.remaining({ uri: "/third" }), null);
});
