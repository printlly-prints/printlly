export function todayStats(orders, now = new Date()) {
  const today = now.toDateString();
  const placed = orders.filter((order) =>
    order.status !== "cancelled" &&
    order.status !== "expired" &&
    new Date(order.createdAt).toDateString() === today,
  );

  // Sum in paise so the shop's share stays exact after deducting the fee.
  const paise = placed.reduce((sum, order) =>
    sum + Math.round((order.total_amount ?? 0) * 100) - Math.round((order.platform_fee ?? 0) * 100),
  0);
  return { orderCount: placed.length, earnings: paise / 100 };
}
