import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  return {
    envDir: "../..",
    define: {
      "import.meta.env.VITE_DEV_DIAGNOSTICS": JSON.stringify(
        env.APP_ENV === "development" && env.ENABLE_DEV_DIAGNOSTICS === "true",
      ),
    },
    resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
    plugins: [tailwindcss(), tanstackStart(), nitro({ preset: "node-server" }), react()],
  };
});
