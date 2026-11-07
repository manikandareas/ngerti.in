import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";

/** Keep PDF font/CMap/decoder resources on the same application origin in dev and builds. */
export function pdfAssets(): Plugin {
  const directory = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
  const folders = ["cmaps", "standard_fonts", "wasm"];
  return {
    name: "pdf-preview-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith("/pdfjs/")) return next();
        const match = /^\/pdfjs\/(cmaps|standard_fonts|wasm)\/([\w.-]+)$/.exec(path);
        if (!match || match[2].includes("..")) {
          response.statusCode = 404;
          response.end();
          return;
        }
        try {
          const bytes = readFileSync(join(directory, match[1], match[2]));
          response.setHeader(
            "Content-Type",
            match[2].endsWith(".wasm")
              ? "application/wasm"
              : match[2].endsWith(".js")
                ? "text/javascript"
                : "application/octet-stream",
          );
          response.end(bytes);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
    generateBundle() {
      for (const folder of folders)
        for (const entry of readdirSync(join(directory, folder), { withFileTypes: true })) {
          if (!entry.isFile()) continue;
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${entry.name}`,
            source: readFileSync(join(directory, folder, entry.name)),
          });
        }
    },
  };
}
