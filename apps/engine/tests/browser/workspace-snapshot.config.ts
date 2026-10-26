import fs from "node:fs";
import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = process.cwd();
const fixture = path.join(root, "apps/engine/tests/browser");
const snapshot = JSON.parse(fs.readFileSync("docs/research/evidence/nma-031/ui-snapshot.json", "utf8"));
const virtual = "\0nma031-recorded-snapshot";
export default defineConfig({
  root: fixture,
  plugins: [
    { name: "recorded-workspace-snapshot", enforce: "pre",
      resolveId(id, importer) { if (id === "./use-direct-message" && importer?.endsWith("direct-message-page.tsx")) return virtual; },
      load(id) { if (id === virtual) return `export function useDirectMessage(){return {snapshot:${JSON.stringify(snapshot)},connection:"connected",error:"",refresh(){},loadEarlier(){},loadingEarlier:false}}`; },
    }, react(), tailwindcss(),
  ],
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("http://127.0.0.1:3038") },
  resolve: { alias: {
    "@clerk/tanstack-react-start": path.join(fixture, "auth.tsx"),
    "@tanstack/react-router": path.join(fixture, "router.tsx"),
    "@": path.join(root, "apps/web/src"),
  } },
  server: { host: "127.0.0.1", port: 3038, strictPort: true, fs: { allow: [root] } },
});
