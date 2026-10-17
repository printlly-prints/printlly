import test from "node:test";
import assert from "node:assert/strict";
import { createWebEventSounds } from "./webEventSounds.js";

function harness(options = {}) {
  const audios = []; let stored = [];
  const player = createWebEventSounds({ createAudio: src => { const audio = { src, paused: false, currentTime: 1, pause() { this.paused = true; }, async play() {} }; audios.push(audio); return audio; }, foreground: () => true, persist: keys => { stored = keys; }, ...options });
  return { player, audios, keys: () => stored };
}
const ready = { _id: "order-one", payment_status: "paid", status: "ready_for_pickup" };
const event = { orderId: "order-one", event: "ORDER_READY_FOR_PICKUP" };

test("socket and API echoes play one confirmed cue across an adapter reload", async () => {
  const first = harness();
  assert.equal(await first.player.confirm(event, ready), true);
  assert.equal(await first.player.confirm(event, ready), false);
  assert.equal(first.audios.length, 1);
  const reloaded = harness({ keys: first.keys() });
  assert.equal(await reloaded.player.confirm(event, ready), false);
  assert.equal(reloaded.audios.length, 0);
});
test("hidden or muted confirmed events are consumed without a later replay", async () => {
  let visible = false;
  const scenario = harness({ foreground: () => visible });
  assert.equal(await scenario.player.confirm(event, ready), false);
  visible = true;
  assert.equal(await scenario.player.confirm(event, ready), false);
  assert.equal(scenario.audios.length, 0);
  const muted = harness({ enabled: () => false });
  assert.equal(await muted.player.confirm(event, ready), false);
  assert.equal(muted.keys().length, 1);
});
test("interruption stops playback and cannot replay the same confirmation", async () => {
  const scenario = harness();
  await scenario.player.confirm(event, ready);
  scenario.player.interrupt();
  assert.equal(scenario.audios[0].paused, true);
  assert.equal(scenario.audios[0].currentTime, 0);
  assert.equal(await scenario.player.confirm(event, ready), false);
  assert.equal(await scenario.player.confirm({ orderId: ready._id, event: "PAYMENT_CONFIRMED" }, { ...ready, payment_status: "pending" }), false);
});
