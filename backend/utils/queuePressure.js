// Operational workload proxy, not printer speed or a promised pickup time.
// Five units per job represent setup; printed page-copies and finishing
// selections keep a 500-page job from looking identical to a single page.
const WINDOW_MINUTES = 60;
const LOW_MINUTES = 15;
const MEDIUM_MINUTES = 35;

function workloadUnits(documents = []) {
  return 5 + documents.reduce((sum, doc) => sum
    + Math.max(0, Number(doc.page_count) || 0) * Math.max(1, Number(doc.copies) || 1)
    + (doc.services?.length || 0) * 10, 0);
}

function calculateQueuePressure({ active = {}, recent = {}, closed = false,
  thresholds = { low_max: 2, medium_max: 6 }, now = new Date() } = {}) {
  const queued = active.queued || 0;
  const ready = active.ready || 0;
  const base = {
    active_orders_count: queued + ready,
    queued_orders_count: queued,
    ready_orders_count: ready,
    rush_level: null,
    rush_basis: closed ? "closed" : "queue_count",
    estimated_clearance_minutes: null,
    throughput_confidence: closed ? "unavailable" : "insufficient",
    throughput_sample_orders: recent.count || 0,
    throughput_window_minutes: WINDOW_MINUTES,
  };
  if (closed) return base;
  const first = new Date(recent.first).getTime();
  const last = new Date(recent.last).getTime();
  const intervalUnits = recent.units - recent.first_units;
  const reliable = recent.count >= 5 && recent.units > 0 && first <= last
    && Number.isFinite(recent.first_units) && recent.first_units > 0 && intervalUnits > 0
    && last - first >= 10 * 60000 && now.getTime() - last <= 15 * 60000
    && last <= now.getTime() && first >= now.getTime() - WINDOW_MINUTES * 60000;
  if (reliable) {
    // Only output after the first observed ready belongs to this interval;
    // its own processing started at an unknown time. Excluding that job also
    // prevents an idle first 50 minutes from diluting ten minutes of output.
    // The ten-minute minimum prevents a short burst becoming instant capacity.
    const unitsPerMinute = intervalUnits / ((last - first) / 60000);
    const minutes = queued ? Math.min(240, Math.max(1,
      Math.ceil((active.units || 0) / unitsPerMinute))) : 0;
    return { ...base, rush_basis: "recent_throughput", throughput_confidence: "observed",
      estimated_clearance_minutes: minutes,
      rush_level: minutes <= LOW_MINUTES ? "low" : minutes <= MEDIUM_MINUTES ? "medium" : "high" };
  }
  return { ...base, rush_level: queued <= thresholds.low_max ? "low"
    : queued <= thresholds.medium_max ? "medium" : "high" };
}

// Identical calculation to workloadUnits, evaluated inside Mongo so no
// documents/filenames/customer information need to leave the aggregation.
const WORKLOAD_EXPRESSION = { $add: [5, { $sum: { $map: {
  input: { $ifNull: ["$documents", []] }, as: "doc", in: { $add: [
    { $multiply: ["$$doc.page_count", "$$doc.copies"] },
    { $multiply: [{ $size: { $ifNull: ["$$doc.services", []] } }, 10] },
  ] },
} } }] };

module.exports = { WINDOW_MINUTES, workloadUnits, calculateQueuePressure, WORKLOAD_EXPRESSION };
