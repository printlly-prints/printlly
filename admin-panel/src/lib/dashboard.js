export function verificationBreakdown(stats) {
  const counts = [stats.shops_approved, stats.shops_pending_verification, stats.shops_rejected];
  const total = counts.reduce((sum, count) => sum + count, 0);
  return { total, percentages: counts.map((count) => total ? (count / total) * 100 : 0) };
}
