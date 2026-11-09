export const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
export const DEMO_MODE = process.env.EXPO_PUBLIC_DEMO_MODE === "true" ||
  (!API_BASE_URL && process.env.EXPO_PUBLIC_DEMO_MODE !== "false");
export const SESSION_KEYS = DEMO_MODE
  ? { token: "paprout-demo-token", user: "paprout-demo-user" }
  : { token: "token", user: "user" };
