import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createReadCooldown } from "../utils/readCooldown";
import { retryAfterSeconds } from "../utils/requestRecovery";

// Single Axios instance used by every screen. The base URL comes from
// EXPO_PUBLIC_API_BASE_URL (see .env.example); Expo inlines any env var
// prefixed with EXPO_PUBLIC_ at build time.
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL,
});
const readCooldown = createReadCooldown();
const readIdentity = config => ({ method: config.method || "get", url: api.getUri(config), authorization: config.headers?.Authorization || "" });
const authFailureListeners = new Set();
export function onAuthenticatedRequestExpired(listener) {
  authFailureListeners.add(listener);
  return () => authFailureListeners.delete(listener);
}
api.interceptors.response.use(response => response, error => {
  const authorization = error.config?.headers?.Authorization;
  // A rejected login is a field error, not an expired current session.
  if (error.response?.status === 401 && authorization && !/^\/auth\/(login|register)(?:\?|$)/.test(error.config?.url || "")) {
    authFailureListeners.forEach(listener => listener(authorization));
  }
  if (error.response?.status === 429 && error.config && !error.isReadCooldown) {
    readCooldown.observe(readIdentity(error.config), retryAfterSeconds(error.response.headers?.["retry-after"]));
  }
  return Promise.reject(error);
});

// Attach the stored JWT to every request. AsyncStorage is async, so this
// interceptor has to be async too.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const remaining = readCooldown.remaining(readIdentity(config));
  if (remaining > 0) {
    // Reject this read locally with only the actual backoff metadata. Polling,
    // focus refresh and pull-to-refresh cannot bypass the server's deadline.
    const error = new Error("Please wait before checking again.");
    error.isAxiosError = true;
    error.isReadCooldown = true;
    error.config = config;
    error.response = { status: 429, headers: { "retry-after": String(remaining) } };
    throw error;
  }
  return config;
});

// Uploads one or more picked PDFs to the backend in a single request,
// field name "documents" (matches multer's upload.array("documents", 10)
// on the server). The server extracts each file's real page count itself
// - the app never computes or sends one.
//
// Returns { succeeded, failed }: succeeded entries carry an upload_id
// (not the file URL - POST /orders looks that up server-side) plus the
// server-computed page_count; failed entries carry original_name + a
// reason, for files that were rejected without ever reaching Cloudinary.
export async function uploadDocuments(assets, { signal } = {}) {
  const form = new FormData();
  assets.forEach((asset) => {
    if (asset.file) form.append("documents", asset.file, asset.name || "document.pdf");
    else form.append("documents", {
      uri: asset.uri,
      name: asset.name || "document.pdf",
      type: asset.mimeType || "application/pdf",
    });
  });

  try {
    const { data } = await api.post("/upload", form, {
      signal, headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (error) {
    const data = error.response?.data;
    if (error.response?.status === 400 && Array.isArray(data?.succeeded) && Array.isArray(data?.failed)) return data;
    throw error;
  }
}

export default api;
