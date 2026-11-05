const STATES = ["pending", "accepted", "ready_for_pickup", "completed", "cancelled", "expired"];
const DAY = 86400000;
const rounded = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function istDateKey(value) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? new Date(time + 330 * 60000).toISOString().slice(0, 10) : null;
}

function validDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function analyticsDateRange(days = 7, now = new Date()) {
  const endDate = istDateKey(now);
  const length = Number.isInteger(days) && days > 0 && days <= 366 ? days : 7;
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return { startDate: new Date(end - (length - 1) * DAY).toISOString().slice(0, 10), endDate };
}

export function vendorEarnings(order) {
  // The server freezes this at confirmed payment. Do not substitute today's
  // prices, customer totals or unknown commission for that snapshot.
  if (order?.payment_status !== "paid" || order.status !== "completed") return null;
  return typeof order.vendor_amount === "number" && Number.isFinite(order.vendor_amount) && order.vendor_amount >= 0 ? rounded(order.vendor_amount) : null;
}

export function partnerAnalytics(orders, { startDate, endDate }) {
  if (!validDay(startDate) || !validDay(endDate) || startDate > endDate) throw new Error("Choose a valid date range.");
  const duration = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY;
  if (duration > 365) throw new Error("Choose a date range of up to one year.");
  const unique = new Map();
  for (const [index, order] of orders.entries()) unique.set(order._id || `missing-id-${index}`, order);
  const loaded = [...unique.values()];
  const selected = loaded.filter(order => { const day = istDateKey(order.createdAt); return day && day >= startDate && day <= endDate; });
  const counts = Object.fromEntries(STATES.map(state => [state, 0]));
  const queues = { pending: 0, accepted: 0, ready_for_pickup: 0 };
  for (const order of loaded) if (Object.hasOwn(queues, order.status)) queues[order.status] += 1;
  const days = new Map();
  for (let offset = 0; offset <= duration; offset += 1) {
    const date = new Date(Date.parse(`${startDate}T00:00:00Z`) + offset * DAY).toISOString().slice(0, 10);
    days.set(date, { date, orders: 0, completed: 0, earnings: 0, missingEarnings: 0 });
  }
  let knownEarnings = 0, missingEarnings = 0;
  for (const order of selected) {
    if (Object.hasOwn(counts, order.status)) counts[order.status] += 1;
    const day = days.get(istDateKey(order.createdAt)); day.orders += 1;
    if (order.status === "completed") day.completed += 1;
    if (order.status !== "completed" || order.payment_status !== "paid") continue;
    const amount = vendorEarnings(order);
    if (amount === null) { missingEarnings += 1; day.missingEarnings += 1; }
    else { knownEarnings += amount; day.earnings += amount; }
  }
  const series = [...days.values()].map(day => ({ ...day, earnings: day.missingEarnings ? null : rounded(day.earnings) }));
  return { selected, loadedCount: loaded.length, orderCount: selected.length, counts, queues, series,
    earnings: missingEarnings ? null : rounded(knownEarnings), knownEarnings: rounded(knownEarnings), missingEarnings,
    paidCompletedCount: selected.filter(order => order.payment_status === "paid" && order.status === "completed").length,
  };
}

function csvCell(value) {
  let text = String(value ?? "");
  if (/^[=+@\-\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function analyticsCSV(orders, range) {
  const { selected } = partnerAnalytics(orders, range);
  const rows = [["Order ID", "Placed date (IST)", "Order state", "Payment state", "Completed shop earnings (INR)", "Settlement state"]];
  for (const order of selected) rows.push([order._id, istDateKey(order.createdAt), order.status, order.payment_status, vendorEarnings(order), order.settlement_status]);
  return rows.map(row => row.map(csvCell).join(",")).join("\r\n");
}
