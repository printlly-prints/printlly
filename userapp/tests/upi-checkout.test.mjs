import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/razorpayCheckout.js", import.meta.url), "utf8");
const { upiCheckoutOptions, upiIntentUrl } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("the provider only offers UPI and uses Intent instead of collecting a VPA", () => {
  const options = upiCheckoutOptions({ amountInPaise: 4700, currency: "INR", razorpayOrderId: "order_server", keyId: "rzp_test", user: { name: "Name" }, actionColor: "#6D35B1" });
  assert.deepEqual(options.config.display.blocks.upi.instruments, [{ method: "upi" }]);
  assert.deepEqual(options.config.display.sequence, ["block.upi"]);
  assert.equal(options.config.display.preferences.show_default_blocks, false);
  assert.equal(options.webview_intent, true);
  assert.equal(options.prefill.method, "upi");
  assert.equal(options.order_id, "order_server");
});
test("only a UPI payment Intent can cross into another app", () => {
  const url = "upi://pay?pa=provider%40upi&am=47";
  assert.equal(upiIntentUrl(url), url);
  assert.equal(upiIntentUrl("intent://pay?pa=provider%40upi#Intent;scheme=upi;package=example;end"), "upi://pay?pa=provider%40upi");
  for (const bad of ["intent://settings#Intent;scheme=android;end", "intent://pay#Intent;scheme=https;end", "upi://settings", "javascript:alert(1)", "https://example.com", "file:///private"]) assert.equal(upiIntentUrl(bad), null);
});
