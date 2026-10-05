import axios from "axios";

// Single Axios instance shared by the whole app. Base URL comes from the
// VITE_API_BASE_URL env var (see .env.example) so it can point at any
// backend deployment without code changes.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach the stored JWT (if any) to every outgoing request.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
