import test from "node:test";
import assert from "node:assert/strict";
import { parseMoney, formatRupees } from "../src/utils/money.js";
import { receiptSnapshot } from "../src/utils/receiptSnapshot.js";
import { estimateOrder } from "../src/utils/estimatePricing.js";

test("absent and invalid money stays unavailable while numeric zero survives", () => {
  for (const value of [null, undefined, "", " ", NaN, Infinity, -1, true, [], {}, "₹3", "0x10", "1e2"]) {
    assert.equal(parseMoney(value), null); assert.equal(formatRupees(value), "Unavailable");
  }
  for (const value of [0, "0", " 0.00 "]) assert.equal(formatRupees(value), "₹0");
  assert.equal(parseMoney("63.25"), 63.25);
});

test("unknown confirmed totals never borrow the old quote and unknown fees stay unknown", () => {
  const quote = { priceBreakdown: { platform_fee: 3 }, totalAmount: 63 };
  assert.equal(receiptSnapshot(quote, { total_amount: null, platform_fee: 3 }).total, null);
  for (const fee of [null, undefined, "", "invalid"]) assert.equal(receiptSnapshot({ priceBreakdown: { platform_fee: fee }, totalAmount: 63 }).preFeeTotal, null);
  assert.equal(receiptSnapshot({ priceBreakdown: { platform_fee: 0 }, totalAmount: 63 }).preFeeTotal, 63);
});

const docs = [{ page_count: 2 }], settings = [{ color_mode: "color", copies: 2, paper_size: "A3", sides: "double", services: [] }];
const pricing = { rate_per_page_color: 9, paper_size_rates: { A3: 5 }, sides_extra_rate: 1, services: [] };
test("configuration estimate requires every selected rate and preserves the 63-rupee quote", () => {
  assert.equal(estimateOrder(docs, settings, pricing, { platform_fee_type: "flat", platform_fee_value: "3" }).total_amount, 63);
  for (const changed of [{ ...pricing, rate_per_page_color: null }, { ...pricing, paper_size_rates: {} }, { ...pricing, sides_extra_rate: null }]) assert.equal(estimateOrder(docs, settings, changed, null), null);
  assert.equal(estimateOrder(docs, [{ ...settings[0], services: ["Stapling"] }], pricing, null), null);
  for (const fee of [null, { platform_fee_type: "percentage", platform_fee_value: null }, { platform_fee_type: "flat", platform_fee_value: "" }]) {
    const estimate = estimateOrder(docs, settings, pricing, fee);
    assert.equal(estimate.pre_fee_total, 60); assert.equal(estimate.total_amount, null);
  }
});
