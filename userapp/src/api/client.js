import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, DEMO_MODE, SESSION_KEYS } from "../config/runtime";
import { demoAdapter } from "../demo/store";

// Single Axios instance used by every screen. The base URL comes from
// EXPO_PUBLIC_API_BASE_URL (see .env.example); Expo inlines any env var
// prefixed with EXPO_PUBLIC_ at build time.
const api = axios.create({
  baseURL: API_BASE_URL,
  ...(DEMO_MODE ? { adapter: demoAdapter } : {}),
});

// Attach the stored JWT to every request. AsyncStorage is async, so this
// interceptor has to be async too.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem(SESSION_KEYS.token);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
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
export async function uploadDocuments(assets) {
  if (DEMO_MODE) throw new Error("Could not add this file. Please try again.");
  const form = new FormData();
  assets.forEach((asset) => {
    if (asset.file) {
      form.append("documents", asset.file, asset.name);
      return;
    }
    form.append("documents", {
      uri: asset.uri,
      name: asset.name || "document.pdf",
      type: asset.mimeType || "application/pdf",
    });
  });

  try {
    const { data } = await api.post("/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  } catch (error) {
    const response = error.response;
    if (
      response?.status === 400 &&
      Array.isArray(response.data?.failed) &&
      Array.isArray(response.data?.succeeded)
    )
      return response.data;
    throw error;
  }
}

export default api;
