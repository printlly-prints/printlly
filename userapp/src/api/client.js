import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Single Axios instance used by every screen. The base URL comes from
// EXPO_PUBLIC_API_BASE_URL (see .env.example); Expo inlines any env var
// prefixed with EXPO_PUBLIC_ at build time.
const api = axios.create({
  baseURL: process.env.EXPO_PUBLIC_API_BASE_URL,
});

// Attach the stored JWT to every request. AsyncStorage is async, so this
// interceptor has to be async too.
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("token");
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
  const form = new FormData();
  assets.forEach((asset) => {
    form.append("documents", {
      uri: asset.uri,
      name: asset.name || "document.pdf",
      type: asset.mimeType || "application/pdf",
    });
  });

  const { data } = await api.post("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export default api;
