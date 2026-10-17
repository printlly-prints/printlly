import test from "node:test";
import assert from "node:assert/strict";
import { receiptSnapshot } from "../src/utils/receiptSnapshot.js";
test("collapsed receipt includes paper, sides and finishing in its pre-fee amount", () => {
  const quote = { priceBreakdown: { base_subtotal: 36, paper_size_charge: 20, sides_charge: 4, services_charge: 0, platform_fee: 3 }, totalAmount: 63 };
  const receipt = receiptSnapshot(quote);
  assert.equal(receipt.preFeeTotal, 60); assert.equal(receipt.preFeeTotal + receipt.breakdown.platform_fee, receipt.total);
});
test("a created order replaces both the bill and every document's old quote", () => {
  const quote = { priceBreakdown: { base_subtotal: 32, platform_fee: 3 }, totalAmount: 35 };
  const order = { base_subtotal: 40, paper_size_charge: 20, sides_charge: 4, services_charge: 8, platform_fee: 3, total_amount: 75, documents: [{ upload_id: "one", pricing: { document_total: 72 } }] };
  const receipt = receiptSnapshot(quote, order);
  assert.equal(receipt.breakdown, order); assert.equal(receipt.documents, order.documents); assert.equal(receipt.preFeeTotal, 72); assert.equal(receipt.total, 75);
});
test("fractional server prices round for display and absent charges remain unavailable", () => {
  assert.equal(receiptSnapshot({ priceBreakdown: { platform_fee: 4.05 }, totalAmount: 85.05 }).preFeeTotal, 81);
  assert.equal(receiptSnapshot({ priceBreakdown: {}, totalAmount: 85.05 }).preFeeTotal, null);
});
