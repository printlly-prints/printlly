import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/cuePermission.js", import.meta.url), "utf8");
const { requestCuePermission } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("explicit cue enable requests local permission without registering a push token", async () => {
  let requests = 0;
  assert.equal(await requestCuePermission({ async getPermissionsAsync() { return { granted: false, canAskAgain: true }; }, async requestPermissionsAsync() { requests++; return { granted: true }; } }), true);
  assert.equal(requests, 1);
});
test("denied permission remains denied and cannot pretend cue delivery is enabled", async () => {
  assert.equal(await requestCuePermission({ async getPermissionsAsync() { return { granted: false, canAskAgain: true }; }, async requestPermissionsAsync() { return { granted: false }; } }), false);
});
test("existing permission or a blocked OS prompt never causes another permission request", async () => {
  for (const permission of [{ granted: true, canAskAgain: true }, { granted: false, canAskAgain: false }]) {
    let requests = 0;
    assert.equal(await requestCuePermission({ async getPermissionsAsync() { return permission; }, async requestPermissionsAsync() { requests++; throw new Error("Unexpected prompt"); } }), permission.granted);
    assert.equal(requests, 0);
  }
});
