/** Classify the affected request, never turn an API 404 into a route redirect. */
export function recoveryState(error, now = Date.now()) {
  const status = error?.response?.status;
  const headers = error?.response?.headers;
  const retryAfter = headers?.get?.("retry-after") ?? headers?.["retry-after"];
  let retryAt = 0;
  if (retryAfter != null) {
    const seconds = Number(retryAfter);
    retryAt = Number.isFinite(seconds) ? now + Math.max(0, seconds) * 1000 : Date.parse(retryAfter) || 0;
  }
  if (status === 401) return { reaction: "access_expired", session: true, retryAt: 0 };
  if (status === 403 || status === 410) return { reaction: "access_expired", session: false, retryAt: 0 };
  if (status === 404) return { reaction: "not_found", retryAt: 0 };
  if (status === 429) return { reaction: "payment_uncertain", rateLimited: true, retryAt };
  if (status >= 500) return { reaction: "service_unavailable", retryAt };
  if (!status && (error?.isAxiosError || error?.code === "ECONNABORTED" || error?.code === "ERR_NETWORK")) return { reaction: "offline", retryAt: 0 };
  return { reaction: "service_unavailable", retryAt: 0 };
}

export const RECOVERY_COPY = {
  offline: { title: "You’re offline.", message: "Reconnect to continue with your prints." },
  service_unavailable: { title: "We’ll be back shortly.", message: "Printlly is temporarily unavailable. Please try again in a moment." },
  not_found: { title: "This page has moved.", message: "Let’s get you back to your prints." },
  access_expired: { title: "This access has ended.", message: "This item is no longer available with your current access." },
  payment_uncertain: { title: "Let’s give it a moment.", message: "Too many requests. Wait a little before trying this request again." },
};
