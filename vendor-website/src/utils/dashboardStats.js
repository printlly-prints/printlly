// Everything the dashboard shows is derived HERE, from the same
// GET /orders/shop/:shopId array the Orders page already uses. There is
// no analytics endpoint in this backend, and inventing one client-side
// would mean inventing the numbers too - so every figure below is a
// reduction over real orders, and anything that cannot be derived from
// them is simply not shown.
//
// Kept as pure functions (no React, no fetch) so they can be run and
// checked outside a browser.

// A shop's EARNINGS are not the order total. total_amount includes the
// platform's commission, which the shop never receives - showing it as
// "Today's earnings" would overstate every number on the page. What the
// shop earns is the sum of its own price components, which is exactly
// total_amount minus platform_fee.
export function shopEarnings(order) {
  const total = order.total_amount ?? 0;
  const fee = order.platform_fee ?? 0;
  return round2(total - fee);
}

export function round2(n) {
  return Math.round(n * 100) / 100;
}

export function isSameDay(value, reference = new Date()) {
  const date = new Date(value);
  return (
    date.getDate() === reference.getDate() &&
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

// Cancelled and expired orders are not work done and not money kept, so
// they are excluded from every count and total. They stay reachable on
// the Orders page's own tabs.
const COUNTS_AS_WORK = (order) => order.status !== "cancelled" && order.status !== "expired";

export function countByStatus(orders) {
  const counts = { pending: 0, accepted: 0, ready_for_pickup: 0, completed: 0, cancelled: 0, expired: 0 };
  for (const order of orders) {
    if (counts[order.status] !== undefined) counts[order.status] += 1;
  }
  return counts;
}

// The four KPI cards. "Today" is the vendor's local day, which is the one
// they think in.
export function todayStats(orders, now = new Date()) {
  const today = orders.filter((o) => isSameDay(o.createdAt, now) && COUNTS_AS_WORK(o));

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayOrders = orders.filter((o) => isSameDay(o.createdAt, yesterday) && COUNTS_AS_WORK(o));

  const counts = countByStatus(orders);

  return {
    orderCount: today.length,
    // Pending and ready are deliberately NOT restricted to today: an
    // order placed at 11pm yesterday still needs accepting this morning,
    // and hiding it because the date rolled over is how orders get
    // missed. These are queues, not day totals.
    pending: counts.pending,
    readyForPickup: counts.ready_for_pickup,
    earnings: round2(today.reduce((sum, o) => sum + shopEarnings(o), 0)),
    yesterdayOrderCount: yesterdayOrders.length,
    yesterdayEarnings: round2(yesterdayOrders.reduce((sum, o) => sum + shopEarnings(o), 0)),
  };
}

// Percentage change against yesterday, or null when there is nothing to
// compare against. Null renders as "no orders yesterday" rather than
// "↑ 100%", which is what a divide-by-zero would otherwise produce.
export function percentChange(current, previous) {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

// Today's earnings, split by what the money was actually charged for.
// Printing / paper / double-sided come from each document's stored
// pricing; finishing services are grouped by their SNAPSHOTTED name, so a
// service the shop has since renamed still reports under the name it was
// sold as.
export function earningsBreakdown(orders, now = new Date()) {
  const today = orders.filter((o) => isSameDay(o.createdAt, now) && COUNTS_AS_WORK(o));

  let printing = 0;
  let paper = 0;
  let sides = 0;
  let platformFee = 0;
  const services = new Map();

  for (const order of today) {
    platformFee += order.platform_fee ?? 0;
    for (const doc of order.documents || []) {
      printing += doc.pricing?.base ?? 0;
      paper += doc.pricing?.paper_charge ?? 0;
      sides += doc.pricing?.sides_charge ?? 0;
      for (const service of doc.services || []) {
        services.set(service.name, round2((services.get(service.name) || 0) + (service.rate || 0)));
      }
    }
  }

  const rows = [
    { label: "Printing", value: round2(printing) },
    { label: "Paper size", value: round2(paper) },
    { label: "Double-sided", value: round2(sides) },
    ...[...services].map(([label, value]) => ({ label, value })),
  ].filter((row) => row.value > 0);

  return {
    rows,
    total: round2(rows.reduce((sum, r) => sum + r.value, 0)),
    // Shown as a deduction, not hidden: the vendor should be able to see
    // why their earnings differ from what the customer paid.
    platformFee: round2(platformFee),
  };
}

// Last 7 days including today, oldest first - the shape the bar chart
// wants. Both series come from the same pass so a bar's height and its
// tooltip can never disagree.
export function weeklySeries(orders, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const day = new Date(now);
    day.setDate(day.getDate() - i);
    const dayOrders = orders.filter((o) => isSameDay(o.createdAt, day) && COUNTS_AS_WORK(o));
    days.push({
      key: day.toISOString().slice(0, 10),
      label: day.toLocaleDateString([], { weekday: "short" }),
      isToday: i === 0,
      orders: dayOrders.length,
      earnings: round2(dayOrders.reduce((sum, o) => sum + shopEarnings(o), 0)),
    });
  }
  return days;
}

// Shop performance over whatever window was fetched. Deliberately
// returns `sampleSize` too: the API caps a page at 100 orders, so these
// are "your last N", not lifetime figures, and the UI says so rather
// than implying a total the backend never sent.
//
// Average preparation time is measured from placement to the transition
// that made the order ready. updatedAt is the LAST transition, so it is
// only a true "ready at" for orders sitting in ready_for_pickup - a
// completed order's updatedAt is when it was collected, which includes
// however long the customer took to walk in. Only the former is counted.
export function shopPerformance(orders) {
  const counts = countByStatus(orders);
  const finished = counts.completed + counts.cancelled + counts.expired;
  const completionRate = finished ? Math.round((counts.completed / finished) * 100) : null;

  const prepSamples = orders
    .filter((o) => o.status === "ready_for_pickup" && o.createdAt && o.updatedAt)
    .map((o) => (new Date(o.updatedAt) - new Date(o.createdAt)) / 60000)
    .filter((minutes) => minutes >= 0);

  const avgPrepMinutes = prepSamples.length
    ? Math.round(prepSamples.reduce((a, b) => a + b, 0) / prepSamples.length)
    : null;

  return {
    completed: counts.completed,
    completionRate,
    avgPrepMinutes,
    prepSampleSize: prepSamples.length,
    sampleSize: orders.length,
  };
}

// The pipeline follows confirmed backend states. Accepting an order does
// not tell us whether printing has started.
export const PIPELINE = [
  { key: "pending", label: "New", hint: "Needs accepting" },
  { key: "accepted", label: "Accepted", hint: "Accepted by your shop" },
  { key: "ready_for_pickup", label: "Ready", hint: "Waiting for pickup" },
  { key: "completed", label: "Collected", hint: "Handed over" },
];

export function pipelineCounts(orders) {
  const counts = countByStatus(orders);
  return PIPELINE.map((step) => ({ ...step, count: counts[step.key] ?? 0 }));
}

// Total sheets to run: pages x copies, per document. This is the number a
// vendor uses to judge how long a job will take, and it is not the same
// as the page count.
export function orderSheets(order) {
  return (order.documents || []).reduce((sum, d) => sum + (d.page_count || 0) * (d.copies || 1), 0);
}

export function orderPages(order) {
  return (order.documents || []).reduce((sum, d) => sum + (d.page_count || 0), 0);
}
