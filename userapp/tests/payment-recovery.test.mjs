import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/paymentRecovery.js", import.meta.url), "utf8");
const { paymentRecoveryState, paymentNextStep } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
test("lost confirmation, provider failure and server errors remain uncertain", () => {
  for (const failure of [new Error("network"), { response: { status: 500 } }, { response: { status: 400, data: { message: "refunded automatically" } } }]) {
    const state = paymentRecoveryState({ failure });
    assert.equal(state.reaction, "payment_uncertain");
    assert.doesNotMatch(state.message, /refunded|not charged/);
  }
  assert.equal(paymentRecoveryState({ order: { payment_status: "failed" } }).reaction, "payment_failed");
});
test("checking unpaid payment cannot open another checkout, including failed status", () => {
  for (const payment_status of ["created", "failed", "pending", "unknown"]) {
    const order = { status: "pending", payment_status };
    assert.equal(paymentNextStep(order), "status");
    assert.equal(paymentNextStep(order, { proof: true }), "verify");
  }
  assert.equal(paymentNextStep({ status: "pending", payment_status: "created" }, { allowCheckout: true }), "checkout");
  assert.equal(paymentNextStep({ status: "pending", payment_status: "unknown" }, { allowCheckout: true }), "status");
});
test("only server paid confirms; cancelled and expired unpaid orders are tracked", () => {
  assert.equal(paymentNextStep({ payment_status: "paid", status: "pending" }), "confirmed");
  for (const status of ["cancelled", "expired", "completed"]) assert.equal(paymentNextStep({ status, payment_status: "created" }, { allowCheckout: true }), "track");
  assert.equal(paymentNextStep(null, { allowCheckout: true }), "missing");
  assert.equal(paymentRecoveryState({ cancelled: true }).reaction, "cancelled");
});
