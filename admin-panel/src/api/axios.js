import axios from "axios";

// Single Axios instance for the whole panel. Base URL comes from
// VITE_API_BASE_URL (see .env.example) so this can point at any backend
// deployment without a code change - same pattern as the vendor
// dashboard's own client.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Attach the stored admin JWT to every outgoing request. The token is an
// ordinary one from POST /auth/login - admins have no separate login
// route - it just carries role "admin", which is what every /admin/*
// route checks via requireRole.
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("admin_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default api;
