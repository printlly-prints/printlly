// Payout details, shared by the form that edits them (ShopProfile) and
// the page that depends on them (Earnings).

// Mirrors the backend's own check in PATCH /shops/me/payout
// (controllers/shopController.js): 4 letters, a literal 0, then 6
// alphanumerics. The fifth character is reserved by RBI and is always 0,
// which is the part a typo most often gets wrong.
//
// Validated here as well as there so a vendor is told before they submit,
// not after a round trip. The BACKEND is still what actually enforces it -
// this is a courtesy, and the server's rejection is handled either way.
export const IFSC_REGEX = /^[A-Za-z]{4}0[A-Za-z0-9]{6}$/;

// "Enough to be paid by." A settlement is a manual UPI or bank transfer
// an admin makes by hand, so either route on its own is workable: a UPI
// id alone is payable, and so is a full bank triple. What is not payable
// is a half-filled bank block - an account number with no IFSC gives an
// admin nothing they can act on.
export function hasPayoutDetails(shop) {
  const p = shop?.payout;
  if (!p) return false;
  const bank = !!(p.account_holder_name && p.account_number && p.ifsc_code);
  return bank || !!p.upi_id;
}

// Amounts here are money a vendor will compare against their own bank
// statement, so they get grouped Indian-style (1,20,450) rather than
// printed raw. Kept to whole rupees unless there are paise to show -
// "₹450" reads better than "₹450.00" in a list of them.
export function formatRupees(amount) {
  const n = Number(amount) || 0;
  const hasPaise = Math.round(n * 100) % 100 !== 0;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}
