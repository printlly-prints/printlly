// Short, human-quotable reference for an order, derived from its real
// MongoDB _id - the same derivation the customer app uses
// (userapp/src/utils/orderRef.js), so a customer reading "PL8E2CC" down the
// phone and a vendor searching for it are looking at the same string.
//
// Deliberately derived rather than stored: there is no order-number
// counter in the backend, and inventing one here would produce a number
// that matches nothing in the database.
export function orderRef(order) {
  const id = String(order?._id || "");
  return id ? `PL${id.slice(-6).toUpperCase()}` : "—";
}
