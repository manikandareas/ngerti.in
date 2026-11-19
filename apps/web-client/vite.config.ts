import { fileURLToPath, URL } from "node:url";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, type Plugin, type ProxyOptions } from "vite";
import { fileIcons } from "./build/file-icons.js";
import { pdfAssets } from "./build/pdf-assets.js";

// The loopback dev proxy preserves cookie authentication and validates its caller before forwarding.
const target = process.env.NGERTIIN_API_URL ?? "http://127.0.0.1:8000";
const authOrigin = process.env.NGERTIIN_AUTH_URL || "http://127.0.0.1:3001";
const apiProxy: ProxyOptions = {
  target,
  configure(proxy) {
    proxy.on("proxyReq", (request) => {
      request.setHeader("Origin", authOrigin);
    });
  },
};
const proxy = {
  // The media upgrade must preserve the browser's Origin for the API's viewer authorization.
  "^/v1/machine/viewer/[a-f0-9]{64}/media(?:\\?|$)": { target, ws: true },
  "/v1": apiProxy,
  "/health": apiProxy,
  "/api/auth": apiProxy,
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
  if (!/^\/(v1|health|api\/auth)\//.test(request.url ?? "")) return next();
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

export default defineConfig(({ mode }) => ({
  devtools: mode === "analysis" ? { apply: "build" } : false,
  plugins: [
    localApiGuard,
    pdfAssets(),
    fileIcons(),
    react(),
    mode !== "without-react-compiler" &&
      babel({ presets: [reactCompilerPreset({ compilationMode: "annotation" })] }),
    tailwindcss(),
  ],
  server: { proxy },
  preview: { proxy },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
}));
