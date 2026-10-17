// History and live delivery can overlap. Merge by server identity so a
// history response cannot erase a reply received while it was in flight.
export function mergeSupportMessages(existing, incoming) {
  const byId = new Map(existing.map((message) => [String(message._id), message]));
  for (const message of incoming) byId.set(String(message._id), message);
  return [...byId.values()].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}
