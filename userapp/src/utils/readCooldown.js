// Bounded, in-memory read-only backoff. Never stores server bodies or retries
// requests. Account + fully encoded URL keep unrelated reads independent.
export function createReadCooldown({ now = () => Date.now(), maxEntries = 64 } = {}) {
  const deadlines = new Map();
  const keyFor = ({ method = "get", url, authorization = "" }) => method.toLowerCase() === "get" ? JSON.stringify([authorization, url]) : null;
  const prune = () => { for (const [key, deadline] of deadlines) if (deadline <= now()) deadlines.delete(key); };
  return {
    observe(request, seconds) {
      const key = keyFor(request);
      if (!key || !Number.isFinite(seconds) || seconds <= 0) return;
      prune();
      deadlines.delete(key);
      deadlines.set(key, now() + seconds * 1000);
      while (deadlines.size > maxEntries) deadlines.delete(deadlines.keys().next().value);
    },
    remaining(request) {
      prune();
      const key = keyFor(request);
      return key ? Math.max(0, Math.ceil(((deadlines.get(key) || 0) - now()) / 1000)) : 0;
    },
  };
}
