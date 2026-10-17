import assert from "node:assert/strict";
import test from "node:test";
import { analyticsCSV, analyticsDateRange, istDateKey, partnerAnalytics, vendorEarnings } from "./partnerAnalytics.js";
const range = { startDate: "2026-10-14", endDate: "2026-10-14" };
const paid = { _id: "1", createdAt: "2026-10-13T20:00:00Z", status: "completed", payment_status: "paid", vendor_amount: 36, total_amount: 39, platform_fee: 3, settlement_status: "unsettled" };

test("analytics boundaries use IST, including orders placed after local midnight", () => {
  assert.equal(istDateKey(paid.createdAt), "2026-10-14");
  assert.deepEqual(analyticsDateRange(7, new Date("2026-10-13T20:00:00Z")), { startDate: "2026-10-08", endDate: "2026-10-14" });
  const data = partnerAnalytics([paid, { ...paid, _id: "2", createdAt: "2026-10-13T18:00:00Z", status: "pending" }], range);
  assert.equal(data.orderCount, 1); assert.equal(data.queues.pending, 1); assert.equal(data.earnings, 36);
});

test("only confirmed completed vendor snapshots count as earnings; missing values stay unknown", () => {
  for (const status of ["pending", "accepted", "ready_for_pickup", "cancelled", "expired"]) assert.equal(vendorEarnings({ ...paid, status }), null);
  assert.equal(vendorEarnings({ ...paid, payment_status: "created" }), null);
  const data = partnerAnalytics([paid, { ...paid, _id: "2", vendor_amount: null }], range);
  assert.equal(data.earnings, null); assert.equal(data.knownEarnings, 36); assert.equal(data.missingEarnings, 1); assert.equal(data.series[0].earnings, null);
  assert.equal(vendorEarnings({ ...paid, vendor_amount: 0 }), 0);
});

test("overlapping fetched pages are deduplicated and each backend branch remains separate", () => {
  const data = partnerAnalytics([paid, paid, { ...paid, _id: "2", status: "cancelled" }, { ...paid, _id: "3", status: "expired" }], range);
  assert.equal(data.loadedCount, 3); assert.equal(data.earnings, 36); assert.equal(data.counts.completed, 1); assert.equal(data.counts.cancelled, 1); assert.equal(data.counts.expired, 1);
  assert.throws(() => partnerAnalytics([], { startDate: "2026-02-30", endDate: "2026-10-14" }), /valid/);
  assert.throws(() => partnerAnalytics([], { startDate: "2024-01-01", endDate: "2026-10-14" }), /one year/);
});

test("CSV uses the same filtered snapshots and escapes spreadsheet formula cells", () => {
  const csv = analyticsCSV([{ ...paid, _id: '=HYPERLINK("x")' }, { ...paid, _id: "other", createdAt: "2026-10-12T12:00:00Z" }], range);
  assert.match(csv, /"'\=HYPERLINK\(""x""\)"/); assert.doesNotMatch(csv, /"other"/); assert.match(csv, /"36","unsettled"/);
});
