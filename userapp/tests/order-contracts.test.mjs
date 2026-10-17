import assert from "node:assert/strict";
import test from "node:test";
import { ORDER_STEPS, completedOrderStepCount, pickupCodeForOrder } from "../src/utils/orderState.js";
import { navigateToOrder } from "../src/utils/orderNavigation.js";
import { createPaymentAttemptGuard, paymentRecoveryAction } from "../src/utils/paymentAttempt.js";

const paid = { _id: "order-1", status: "ready_for_pickup", payment_status: "paid", otp: "012345" };

test("pickup codes require confirmed payment, a live state and exactly six server digits", () => {
  assert.equal(pickupCodeForOrder(paid), "012345");
  for (const status of ["pending", "accepted", "ready_for_pickup"]) {
    assert.equal(pickupCodeForOrder({ ...paid, status }), "012345");
  }
  for (const payment_status of [undefined, null, "created", "failed", "pending"]) {
    assert.equal(pickupCodeForOrder({ ...paid, payment_status }), null);
  }
  for (const status of ["cancelled", "expired", "completed", "printing", undefined]) {
    assert.equal(pickupCodeForOrder({ ...paid, status }), null);
  }
  for (const otp of [undefined, null, 12345, "12345", "1234567", " 123456", "123456 ", "12a456", {}, [123456]]) {
    assert.equal(pickupCodeForOrder({ ...paid, otp }), null);
  }
  assert.equal(pickupCodeForOrder({ ...paid, otp: 123456 }), "123456");
});

test("timeline only marks real backend lifecycle states", () => {
  assert.deepEqual(ORDER_STEPS.map((step) => step.key), ["pending", "accepted", "ready_for_pickup", "completed"]);
  for (const [index, step] of ORDER_STEPS.entries()) assert.equal(completedOrderStepCount(step.key), index + 1);
  for (const status of ["printing", "cancelled", "expired", undefined]) assert.equal(completedOrderStepCount(status), 0);
});

test("ready navigation cannot reveal malformed or unpaid codes; closed orders never retry payment", () => {
  const calls = [];
  const navigation = { navigate: (...args) => calls.push(args) };
  navigateToOrder(navigation, paid);
  assert.equal(calls.pop()[0], "PickupOtp");
  for (const order of [{ ...paid, otp: "123" }, { ...paid, payment_status: undefined }]) {
    navigateToOrder(navigation, order);
    assert.equal(calls.pop()[0], "OrderTracking");
  }
  navigateToOrder(navigation, { ...paid, payment_status: "created" });
  assert.equal(calls.pop()[0], "Payment");
  for (const status of ["cancelled", "expired"]) {
    navigateToOrder(navigation, { ...paid, status, payment_status: "created" });
    assert.equal(calls.pop()[0], "OrderTracking");
  }
});

test("success is verified once and dismissal/failure cannot interrupt server confirmation", () => {
  const guard = createPaymentAttemptGuard();
  const id = guard.begin();
  assert.equal(guard.startVerification(id), false);
  assert.equal(guard.open(id), true);
  assert.equal(guard.startVerification(id), true);
  assert.equal(guard.startVerification(id), false);
  assert.equal(guard.closeCheckout(id), false);
  assert.equal(guard.finishVerification(id, true), true);
  assert.equal(guard.finishVerification(id, true), false);
  assert.equal(guard.closeCheckout(id), false);
});

test("retry fences callbacks and server results from old attempts", () => {
  const guard = createPaymentAttemptGuard();
  const first = guard.begin();
  guard.open(first);
  guard.startVerification(first);
  assert.equal(guard.finishVerification(first, false), true);
  const second = guard.begin();
  assert.equal(guard.open(first), false);
  assert.equal(guard.open(second), true);
  assert.equal(guard.startVerification(first), false);
  assert.equal(guard.closeCheckout(first), false);
  assert.equal(guard.finishVerification(first, true), false);
  assert.equal(guard.startVerification(second), true);
  assert.equal(guard.finishVerification(second, true), true);
});

test("unmount suppresses late checkout and verification callbacks", () => {
  const guard = createPaymentAttemptGuard();
  const id = guard.begin();
  guard.open(id);
  guard.startVerification(id);
  guard.dispose();
  assert.equal(guard.isCurrent(id), false);
  assert.equal(guard.finishVerification(id, true), false);
  assert.equal(guard.closeCheckout(id), false);
});

test("uncertain verification preserves original proof until the server confirms payment", () => {
  // Covers a committed verification with a dropped response and later webhook confirmation.
  assert.equal(paymentRecoveryAction(paid, true), "confirmed");
  for (const payment_status of ["created", "failed", undefined]) {
    assert.equal(paymentRecoveryAction({ ...paid, payment_status }, true), "verify");
  }
  assert.equal(paymentRecoveryAction({ ...paid, payment_status: "created" }, false), "checkout");
  for (const status of ["expired", "cancelled", "completed"]) {
    assert.equal(paymentRecoveryAction({ ...paid, status }, true), "track");
  }
  assert.throws(() => paymentRecoveryAction(undefined, true), /Could not find this order/);
});

test("preparation and reconciliation cannot start overlapping provider requests", () => {
  const guard = createPaymentAttemptGuard();
  const id = guard.begin();
  assert.equal(guard.begin(), null);
  assert.equal(guard.failPreparation(id), true);
  const retry = guard.begin();
  assert.notEqual(retry, id);
  assert.equal(guard.failPreparation(id), false);
  assert.equal(guard.open(retry), true);
  assert.equal(guard.begin(), null);
});
