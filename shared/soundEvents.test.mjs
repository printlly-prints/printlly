import test from "node:test";
import assert from "node:assert/strict";
import { confirmedSoundEvent, createSoundLedger } from "./soundEvents.js";

const order = { _id: "order1", status: "pending", payment_status: "paid" };
const payment = { event: "PAYMENT_CONFIRMED", orderId: "order1" };

test("payment cues require matching server-paid orders, never provider return", () => {
  assert.equal(confirmedSoundEvent(payment, { ...order, payment_status: "created" }), null);
  assert.equal(confirmedSoundEvent({ ...payment, orderId: "other" }, order), null);
  assert.equal(confirmedSoundEvent({ event: "success", orderId: "order1" }, order), null);
  assert.equal(confirmedSoundEvent(payment, order).cue, "payment_confirmed");
});

test("ready and cancellation cues require their actual confirmed states", () => {
  const ready = { event: "ORDER_READY_FOR_PICKUP", orderId: "order1" };
  assert.equal(confirmedSoundEvent(ready, order), null);
  assert.equal(confirmedSoundEvent(ready, { ...order, status: "ready_for_pickup" }).cue, "ready_for_pickup");
  assert.equal(confirmedSoundEvent({ event: "cancelled", orderId: "order1" }, order), null);
  assert.equal(confirmedSoundEvent({ event: "ORDER_CANCELLED", orderId: "order1" }, { ...order, status: "cancelled" }).cue, "order_cancelled");
});

test("API, socket and push duplicates share one persisted semantic key", () => {
  const confirmed = confirmedSoundEvent(payment, order);
  const ledger = createSoundLedger();
  assert.equal(ledger.claim(confirmed), true);
  assert.equal(ledger.claim({ ...confirmed }), false);
  assert.equal(createSoundLedger({ initialKeys: ledger.keys() }).claim(confirmed), false);
});

test("muted or background events are consumed without replay on resume", () => {
  for (const options of [{ enabled: false }, { foreground: false }]) {
    const ledger = createSoundLedger();
    const confirmed = confirmedSoundEvent(payment, order);
    assert.equal(ledger.claim(confirmed, options), false);
    assert.equal(ledger.claim(confirmed), false);
  }
});

test("generic cues cannot layer over specific playback; completion is race-safe", () => {
  const ledger = createSoundLedger();
  const paid = confirmedSoundEvent(payment, order);
  const ready = confirmedSoundEvent({ event: "ORDER_READY_FOR_PICKUP", orderId: "order1" }, { ...order, status: "ready_for_pickup" });
  assert.equal(ledger.claim(paid), true);
  assert.equal(ledger.claim({ cue: "notification", key: "other:ORDER_ACCEPTED" }), false);
  assert.equal(ledger.claim(ready), true);
  ledger.finish(paid.key);
  assert.equal(ledger.claim({ cue: "notification", key: "third:ORDER_ACCEPTED" }), false);
  ledger.finish(ready.key);
  assert.equal(ledger.claim({ cue: "notification", key: "fourth:ORDER_ACCEPTED" }), true);
});
