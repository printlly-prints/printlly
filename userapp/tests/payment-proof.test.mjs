import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const source = await fs.readFile(new URL("../src/utils/paymentProofStore.js", import.meta.url), "utf8");
const { createPaymentProofStore } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const checkout = { amountInPaise: 4700, currency: "INR", razorpayOrderId: "order_original", keyId: "rzp_test_example" };
const proof = { razorpay_order_id: "order_original", razorpay_payment_id: "pay_captured", razorpay_signature: "server-verified-signature" };
function memory() { const data = new Map(); return { data, async getItem(key) { return data.get(key); }, async setItem(key, value) { data.set(key, value); }, async removeItem(key) { data.delete(key); } }; }
test("captured payment proof and original provider order survive an app restart", async () => {
  const storage = memory(), scope = { accountId: "customer-a", orderId: "print-order-a" };
  await createPaymentProofStore(storage, scope).save(checkout, proof);
  assert.deepEqual(await createPaymentProofStore(storage, scope).read(), { version: 1, ...scope, checkout, proof });
});
test("a checkout opened before interruption resumes the same provider ID without proof", async () => {
  const storage = memory(), scope = { accountId: "customer-a", orderId: "print-order-a" };
  await createPaymentProofStore(storage, scope).save(checkout);
  assert.equal((await createPaymentProofStore(storage, scope).read()).checkout.razorpayOrderId, "order_original");
});
test("accounts and orders cannot read each other's verification proof", async () => {
  const storage = memory();
  await createPaymentProofStore(storage, { accountId: "a", orderId: "one" }).save(checkout, proof);
  assert.equal(await createPaymentProofStore(storage, { accountId: "b", orderId: "one" }).read(), null);
  assert.equal(await createPaymentProofStore(storage, { accountId: "a", orderId: "two" }).read(), null);
});
test("storage failure or mismatched proof cannot silently discard recovery data", async () => {
  const store = createPaymentProofStore({ async getItem() { throw new Error("disk unavailable"); }, async setItem() { throw new Error("disk unavailable"); } }, { accountId: "a", orderId: "one" });
  await assert.rejects(store.read(), /disk unavailable/);
  await assert.rejects(store.save(checkout, proof), /disk unavailable/);
  await assert.rejects(createPaymentProofStore(memory(), { accountId: "a", orderId: "one" }).save(checkout, { ...proof, razorpay_order_id: "order_other" }), /does not match/);
});
test("corrupt recovery data blocks a fresh checkout without exposing stored fragments", async () => {
  const store = createPaymentProofStore({ async getItem() { return '{"razorpay_signature":"private-fragment"'; } }, { accountId: "a", orderId: "one" });
  await assert.rejects(store.read(), (error) => /could not be read/.test(error.message) && !error.message.includes("private-fragment"));
});
