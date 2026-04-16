import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3090,
    strictPort: true
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src")
    }
  }
});

