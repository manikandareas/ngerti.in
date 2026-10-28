import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = process.cwd();
const fixture = path.join(root, "apps/engine/tests/browser");
const meta = JSON.parse(fs.readFileSync(".dev/nma-035/private/auth/private.json", "utf8"));
export default defineConfig({
  root: fixture,
  plugins: [react(), tailwindcss()],
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:3028") },
  resolve: {
    alias: {
      "@clerk/tanstack-react-start": path.join(fixture, "closure-auth.tsx"),
      "@tanstack/react-router": path.join(fixture, "router.tsx"),
      "@": path.join(root, "apps/web/src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 3028,
    strictPort: true,
    fs: { allow: [root] },
    proxy: {
      "/api": meta.base,
      "/user": "http://127.0.0.1:3029",
      "/config": "http://127.0.0.1:3029",
      "/capture": "http://127.0.0.1:3029",
      "/session": "http://127.0.0.1:3029",
    },
  },
});
