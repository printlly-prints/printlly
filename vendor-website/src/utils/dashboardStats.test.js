import assert from "node:assert/strict";
import test from "node:test";
import { countByStatus, pipelineCounts, todayStats } from "./dashboardStats.js";

test("mixed order responses keep terminal branches separate from the active pipeline", () => {
  const orders = [
    { status: "pending" },
    { status: "accepted" },
    { status: "accepted" },
    { status: "ready_for_pickup" },
    { status: "completed" },
    { status: "cancelled" },
    { status: "expired" },
    { status: "unknown" },
  ];

  assert.deepEqual(countByStatus(orders), {
    pending: 1, accepted: 2, ready_for_pickup: 1,
    completed: 1, cancelled: 1, expired: 1,
  });
  assert.deepEqual(pipelineCounts(orders).map(({ key, label, count }) => ({ key, label, count })), [
    { key: "pending", label: "New", count: 1 },
    { key: "accepted", label: "Accepted", count: 2 },
    { key: "ready_for_pickup", label: "Ready", count: 1 },
    { key: "completed", label: "Collected", count: 1 },
  ]);
});

test("today's figures exclude cancelled and expired orders while older queues remain visible", () => {
  const now = new Date(2026, 9, 13, 12);
  const today = new Date(2026, 9, 13, 9).toISOString();
  const previousDay = new Date(2026, 9, 12, 20).toISOString();
  const orders = [
    { status: "pending", createdAt: previousDay, total_amount: 20, platform_fee: 2 },
    { status: "ready_for_pickup", createdAt: previousDay, total_amount: 30, platform_fee: 3 },
    { status: "accepted", createdAt: today, total_amount: 110, platform_fee: 10 },
    { status: "completed", createdAt: today, total_amount: 55, platform_fee: 5 },
    { status: "cancelled", createdAt: today, total_amount: 999, platform_fee: 0 },
    { status: "expired", createdAt: today, total_amount: 999, platform_fee: 0 },
  ];

  assert.deepEqual(todayStats(orders, now), {
    orderCount: 2, pending: 1, readyForPickup: 1, earnings: 150,
    yesterdayOrderCount: 2, yesterdayEarnings: 45,
  });
});
