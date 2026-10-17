import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/foregroundSoundPolicy.js", import.meta.url), "utf8");
const { canPresentConfirmedCue } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const ready = () => ({ ready: true, active: true, available: true, muted: false, presentedKeys: new Set() });
test("a remote notification shown during initialization never gains a duplicate cue notification", () => {
  const state = ready(); state.ready = false;
  assert.equal(canPresentConfirmedCue(state, "one:PAYMENT_CONFIRMED"), false);
  state.presentedKeys.add("one:PAYMENT_CONFIRMED"); state.ready = true;
  assert.equal(canPresentConfirmedCue(state, "one:PAYMENT_CONFIRMED"), false);
  assert.equal(canPresentConfirmedCue(state, "two:PAYMENT_CONFIRMED"), true);
});
test("background and permission-denied sessions cannot schedule an audible native cue", () => {
  for (const patch of [{ active: false }, { available: false }, { ready: false }]) assert.equal(canPresentConfirmedCue({ ...ready(), ...patch }, "one:ORDER_READY_FOR_PICKUP"), false);
});
test("legacy app mute flags do not suppress confirmed cues after removal of the in-app event mute", () => {
  assert.equal(canPresentConfirmedCue({ ...ready(), muted: true }, "one:ORDER_READY_FOR_PICKUP"), true);
});
