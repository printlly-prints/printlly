// The single definition of "this order is owed to the vendor".
//
// Lives here, not in either controller, because BOTH sides read it: the
// admin's pending list and settle action (controllers/settlementController.js)
// and the vendor's own GET /shops/me/settlements
// (controllers/shopController.js). A vendor being shown a pending total
// the admin's screen disagrees with would be worse than either screen
// showing nothing at all, and two copies of this object is exactly how
// that happens.
//
//   status "completed"    - the work is done and handed over. An order
//                           still printing is not owed yet.
//   payment_status "paid" - the CUSTOMER actually paid us. A completed
//                           order that was never paid owes the vendor
//                           nothing, and carries no vendor_amount to
//                           pay out.
//   settlement_status     - not already recorded in a settlement batch.
//
// Note this is about a transfer an admin makes BY HAND, outside the
// platform. Nothing in this codebase moves money.
const SETTLEABLE = {
  status: "completed",
  payment_status: "paid",
  settlement_status: "unsettled",
};

// Money, to paise. Summing floats across a batch of orders otherwise
// leaves a tail like 1234.5600000000002 in a figure someone is going to
// compare against a bank statement.
function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

module.exports = { SETTLEABLE, round2 };
