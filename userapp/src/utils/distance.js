// "1.2 km away" from the backend's distance_km (already rounded to one
// decimal). Returns null when there's no distance - the customer hasn't
// shared location, or the shop hasn't set one - so callers can hide the
// label or fall back to a placeholder.
export function formatDistance(distanceKm) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 0.1) return "Less than 0.1 km away";
  return `${distanceKm.toFixed(1)} km away`;
}

// The same distance for a compact card, where the word "away" is both
// obvious from context and too wide to afford: a 155px shop card has
// about 130px of text, which "Chandrabani  ·  0.1 km away" overflows and
// "Chandrabani  ·  0.1 km" does not. Same null contract as above.
export function formatDistanceShort(distanceKm) {
  if (typeof distanceKm !== "number" || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 0.1) return "<0.1 km";
  return `${distanceKm.toFixed(1)} km`;
}
