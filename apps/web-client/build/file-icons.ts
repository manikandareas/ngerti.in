import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join } from "node:path";
import { generateManifest, type Manifest } from "material-icon-theme";
import type { Plugin } from "vite";
import {
  FILE_ICON_BASE,
  type FileIconManifest,
  type IconAssociations,
} from "../src/features/conversation/lib/file-icon-manifest.js";

/** Generate associations at build time; only local SVGs and JSON reach the browser. */
export function fileIcons(): Plugin {
  const directory = dirname(
    createRequire(import.meta.url).resolve("material-icon-theme/package.json"),
  );
  const source: Manifest = generateManifest({ activeIconPack: "none" });
  const associations = (theme: Manifest): IconAssociations => ({
    file: theme.file,
    folder: theme.folder,
    folderExpanded: theme.folderExpanded,
    fileNames: theme.fileNames,
    fileExtensions: theme.fileExtensions,
    folderNames: theme.folderNames,
    folderNamesExpanded: theme.folderNamesExpanded,
    languageIds: theme.languageIds,
  });
  const icons = Object.fromEntries(
    Object.entries<{ iconPath: string }>(source.iconDefinitions ?? {}).map(([id, definition]) => [
      id,
      basename(definition.iconPath),
    ]),
  );
  const manifest: FileIconManifest = {
    ...associations(source),
    icons,
    light: source.light ? associations(source.light) : undefined,
  };
  const assets = new Map<string, string | Buffer>([
    ["manifest.json", JSON.stringify(manifest)],
    ["LICENSE", readFileSync(join(directory, "LICENSE"))],
    ...[...new Set(Object.values(icons))].map((name): [string, Buffer] => [
      name,
      readFileSync(join(directory, "icons", name)),
    ]),
  ]);
  return {
    name: "local-file-icons",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0] ?? "";
        if (!path.startsWith(`${FILE_ICON_BASE}/`)) return next();
        const name = path.slice(FILE_ICON_BASE.length + 1);
        const asset = assets.get(name);
        if (asset === undefined) {
          response.statusCode = 404;
          response.end();
          return;
        }
        response.setHeader(
          "Content-Type",
          name.endsWith(".svg")
            ? "image/svg+xml"
            : name.endsWith(".json")
              ? "application/json"
              : "text/plain",
        );
        response.end(asset);
      });
    },
    generateBundle() {
      for (const [name, source] of assets)
        this.emitFile({ type: "asset", fileName: `${FILE_ICON_BASE.slice(1)}/${name}`, source });
    },
  };
}
