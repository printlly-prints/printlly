// These are presentation families, never new API status values.
export function recoveryForError(error, { notFound = "not_found" } = {}) {
  const status = error?.response?.status;
  if (status === 401) return { reaction: "access_expired", title: "Your session has ended.", message: "Sign in again to continue.", requiresSignIn: true };
  if (status === 403) return { reaction: "access_expired", title: "This access is unavailable.", message: "Return to a page you can access or ask for help." };
  if (status === 404 || status === 410) return { reaction: notFound, title: notFound === "shop_unavailable" ? "This shop is unavailable." : "This item is no longer here.", message: notFound === "shop_unavailable" ? "Choose another available print shop." : "Go back and choose another item." };
  if (status === 429) return { reaction: "payment_uncertain", title: "Let’s give it a moment.", message: "Too many requests. Wait before trying again.", retryAfterSeconds: retryAfterSeconds(error.response?.headers?.["retry-after"]) };
  if (status >= 500) return { reaction: "service_unavailable", title: "We’ll be back shortly.", message: "Printlly is temporarily unavailable. Please try again." };
  if (!error?.response && (error?.isAxiosError || error?.request || ["ERR_NETWORK", "ECONNABORTED", "ETIMEDOUT"].includes(error?.code))) return { reaction: "offline", title: "You’re offline.", message: "We couldn’t connect. Reconnect and try again; your current work stays here." };
  return { reaction: "service_unavailable", title: "We couldn’t complete that request.", message: "Please try again or get help if the problem continues." };
}
export function retryAfterSeconds(value, now = Date.now()) {
  if (value == null || value === "") return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, Math.ceil((date - now) / 1000)) : 0;
}
