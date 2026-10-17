// Monetary API fields may be numeric strings; absent values are never zero.
export function parseMoney(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function formatRupees(value) {
  const amount = parseMoney(value);
  return amount === null ? "Unavailable" : `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
