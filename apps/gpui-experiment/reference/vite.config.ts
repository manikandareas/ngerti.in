import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const directory = fileURLToPath(new URL(".", import.meta.url));
const require = createRequire(resolve(directory, "../../web-client/package.json"));
const { defineConfig } = await import(require.resolve("vite"));
const { default: react } = await import(require.resolve("@vitejs/plugin-react"));
const { default: tailwind } = await import(require.resolve("@tailwindcss/vite"));

export default defineConfig({
  root: directory,
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@": resolve(directory, "../../web-client/src"),
      react: resolve(directory, "../../web-client/node_modules/react"),
      "react-dom": resolve(directory, "../../web-client/node_modules/react-dom"),
      "next-themes": require.resolve("next-themes"),
      "@hugeicons/react": require.resolve("@hugeicons/react"),
      "@hugeicons/core-free-icons": require.resolve("@hugeicons/core-free-icons"),
    },
  },
  build: { outDir: resolve(directory, "../assets/reference"), emptyOutDir: true },
});
