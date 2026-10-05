import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Same Vite + React setup as the vendor dashboard. The port is pinned to
// 5174 so this can run alongside web/ (5173) and the Expo dev server
// without either having to move.
export default defineConfig({
  plugins: [react()],
  server: { port: 5174 },
});
