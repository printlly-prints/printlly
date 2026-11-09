import assert from "node:assert/strict";
import { createDemoStore } from "../src/demo/store.js";

const store = createDemoStore();
const shops = await store.request("GET", "/shops");
assert.equal(shops.length, 3);
assert.ok(
  shops.every(
    (s) => s._id.startsWith("demo-") && !/demo|sample/i.test(s.shop_name),
  ),
);
assert.equal(
  (await store.request("GET", "/shops", {}, { search: "CopyHub" })).length,
  1,
);
const document = store.addDocument();
const settings = {
  color_mode: "bw",
  copies: 2,
  paper_size: "A4",
  sides: "single",
  services: [],
};
const quotes = await store.request("POST", "/shops/compare-pricing", {
  documents: [{ ...settings, page_count: document.page_count }],
});
const first = quotes[0];
assert.equal(
  first.total_amount,
  document.page_count * 2 * shops[0].pricing.rate_per_page_bw + 3,
);
const order = await store.request("POST", "/orders", {
  shop_id: first.shop_id,
  documents: [{ ...settings, upload_id: document.upload_id }],
});
assert.equal(order.payment_status, "created");
assert.equal(order.otp, undefined);
assert.equal(order.documents[0].original_name, document.original_name);
assert.equal(order.documents[0].page_count, document.page_count);
await assert.rejects(() =>
  store.request("POST", "/demo/advance", { order_id: order._id }),
);
const paid = await store.request("POST", "/demo/pay", { order_id: order._id });
assert.equal(paid.order.payment_status, "paid");
assert.equal(paid.order.total_amount, first.total_amount);
assert.equal(
  (await store.request("POST", "/demo/pay", { order_id: order._id })).order.otp,
  paid.order.otp,
);
for (const expected of ["accepted", "ready_for_pickup", "completed"])
  assert.equal(
    (await store.request("POST", "/demo/advance", { order_id: order._id }))
      .status,
    expected,
  );
assert.equal(
  (await store.request("POST", "/demo/advance", { order_id: order._id }))
    .status,
  "completed",
);
await store.request("POST", "/saved-shops", { shop_id: shops[1]._id });
assert.equal((await store.request("GET", "/saved-shops")).length, 2);
await store.request("DELETE", `/saved-shops/${shops[1]._id}`);
assert.equal((await store.request("GET", "/saved-shops")).length, 1);
await assert.rejects(
  () => store.request("POST", "/payments/razorpay/create-order", {}),
  /unavailable/,
);
await assert.rejects(
  () => store.request("GET", "/unimplemented"),
  /unavailable/,
);
console.log(
  "Passed: sample quotes/order totals, simulated payment, pickup progression, saved shops and real-payment isolation.",
);
