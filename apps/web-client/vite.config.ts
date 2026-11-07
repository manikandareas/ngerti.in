import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import { fileIcons } from "./build/file-icons.js";
import { pdfAssets } from "./build/pdf-assets.js";

// Development-only, loopback bridge. Installation credentials never enter the browser bundle.
const target = process.env.NGERTIIN_API_URL ?? "http://127.0.0.1:8000";
const stateDirectory = resolve(
  fileURLToPath(new URL("../../", import.meta.url)),
  process.env.NGERTIIN_STATE_DIR ?? ".dev/harness-first",
);
const apiProxy: ProxyOptions = {
  target,
  configure(proxy) {
    proxy.on("proxyReq", (request) => {
      try {
        const installation = JSON.parse(
          readFileSync(resolve(stateDirectory, "installation.json"), "utf8"),
        );
        request.setHeader("Authorization", `Bearer ${installation.token}`);
      } catch {
        request.removeHeader("Authorization");
      }
    });
  },
};
const localApiGuard: Plugin = {
  name: "local-api-origin",
  configureServer(server) {
    server.middlewares.use(guard);
  },
  configurePreviewServer(server) {
    server.middlewares.use(guard);
  },
};
const guard: import("vite").Connect.NextHandleFunction = (request, response, next) => {
  if (!/^\/(v1|health)\//.test(request.url ?? "")) return next();
  const host = request.headers.host ?? "";
  const origin = request.headers.origin;
  if (
    !/^(127\.0\.0\.1|localhost):\d+$/.test(host) ||
    (origin && origin !== `http://${host}`) ||
    request.headers["sec-fetch-site"] === "cross-site"
  ) {
    response.statusCode = 403;
    response.end();
    return;
  }
  next();
};

export default defineConfig({
  plugins: [localApiGuard, pdfAssets(), fileIcons(), react(), tailwindcss()],
  server: { proxy: { "/v1": apiProxy, "/health": apiProxy } },
  preview: { proxy: { "/v1": apiProxy, "/health": apiProxy } },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
