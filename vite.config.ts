import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5175,
    watch: { ignored: ["**/artifacts/**"] },
    proxy: {
      "/supabase": {
        target: "https://project-tracker-seven-eta.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
