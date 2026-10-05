import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. VITE_API_BASE_URL (see .env.example) is
// read at build/dev time via import.meta.env in src/api/axios.js.
export default defineConfig({
  plugins: [react()],
});
