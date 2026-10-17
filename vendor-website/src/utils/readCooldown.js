/** A bounded, memory-only gate for server-directed GET throttling. */
export function createReadCooldown({ now = Date.now, maxEntries = 64 } = {}) {
  const deadlines = new Map();
  const key = ({ method = "get", uri, authorization = "" }) => String(method).toLowerCase() === "get" ? JSON.stringify([authorization, uri]) : null;
  function purge() {
    const time = now();
    for (const [entry, deadline] of deadlines) if (deadline <= time) deadlines.delete(entry);
  }
  return {
    remaining(request) {
      purge();
      const deadline = deadlines.get(key(request));
      return deadline ? { deadline, retryAfter: new Date(Math.ceil(deadline / 1000) * 1000).toUTCString() } : null;
    },
    remember(request, status, retryAfter) {
      purge();
      const entry = key(request);
      if (!entry || status !== 429 || retryAfter == null || String(retryAfter).trim() === "") return;
      const value = String(retryAfter).trim();
      const numeric = /^\d+(?:\.\d+)?$/.test(value);
      if (!numeric && !/[a-z]{3}/i.test(value)) return;
      const deadline = numeric ? now() + Number(value) * 1000 : Date.parse(value);
      if (!Number.isFinite(deadline) || deadline <= now() || deadline > 8.64e15) return;
      deadlines.delete(entry);
      deadlines.set(entry, deadline);
      while (deadlines.size > maxEntries) deadlines.delete(deadlines.keys().next().value);
    },
  };
}
