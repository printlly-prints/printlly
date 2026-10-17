import axios from "axios";
import { createReadCooldown } from "../utils/readCooldown";

// Single Axios instance shared by the whole app. Base URL comes from the
// VITE_API_BASE_URL env var (see .env.example) so it can point at any
// backend deployment without code changes.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});
const readCooldown = createReadCooldown();
const readIdentity = config => ({ method: config.method, uri: api.getUri(config), authorization: config.headers?.Authorization || "" });

// Attach the stored JWT (if any) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const blocked = readCooldown.remaining(readIdentity(config));
  if (blocked) {
    const response = { status: 429, statusText: "Too Many Requests", headers: { "retry-after": blocked.retryAfter }, data: null, config };
    return Promise.reject(new axios.AxiosError("Please wait before trying this request again.", "ERR_SERVER_READ_COOLDOWN", config, undefined, response));
  }
  return config;
});

// Only an authenticated 401 expires the current session. In particular,
// /shops/me 404 means no registered shop, not a missing route or expired login.
api.interceptors.response.use(response => response, error => {
  if (error.config && error.code !== "ERR_SERVER_READ_COOLDOWN") {
    const headers = error.response?.headers;
    readCooldown.remember(readIdentity(error.config), error.response?.status, headers?.get?.("retry-after") ?? headers?.["retry-after"]);
  }
  const sent = error.config?.headers?.Authorization;
  const current = localStorage.getItem("token");
  if (error.response?.status === 401 && current && sent === `Bearer ${current}` && !String(error.config?.url || "").startsWith("/auth/")) {
    window.dispatchEvent(new CustomEvent("printlly:session-expired"));
  }
  return Promise.reject(error);
});

export default api;
