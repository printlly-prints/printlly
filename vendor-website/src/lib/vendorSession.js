export const SESSION_KEY = "paprout:vendor-session";

export function readVendorSession() {
  try {
    const stored = localStorage.getItem(SESSION_KEY);
    const session = stored
      ? JSON.parse(stored)
      : { token: localStorage.getItem("token"), user: JSON.parse(localStorage.getItem("user")) };
    return typeof session?.token === "string" && session.user ? session : null;
  } catch {
    return null;
  }
}

export function writeVendorSession(session) {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  if (!session) localStorage.removeItem(SESSION_KEY);
}
