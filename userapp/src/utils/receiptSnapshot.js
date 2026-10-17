// A created order replaces the comparison quote as the entire receipt.
// Never mix a new catalogue rate or an old document total into that snapshot.
import { parseMoney } from "./money.js";

export function receiptSnapshot({ priceBreakdown, totalAmount }, createdOrder) {
  const breakdown = createdOrder || priceBreakdown;
  const total = parseMoney(createdOrder ? createdOrder.total_amount : totalAmount);
  const fee = parseMoney(breakdown?.platform_fee), amount = total;
  const preFeeTotal = amount !== null && fee !== null && amount >= fee ? Math.round((amount - fee) * 100) / 100 : null;
  return { breakdown, total, preFeeTotal, documents: createdOrder?.documents || null };
}
