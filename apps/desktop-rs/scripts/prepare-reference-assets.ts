import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import * as icons from "../../web-client/node_modules/@hugeicons/core-free-icons";
import { resolveFileIcon } from "../../web-client/src/features/conversation/lib/file-icon-manifest";
import { directory, repository } from "./cargo";

const frozen = JSON.parse(
  await readFile(resolve(directory, "verification/reference-v1/manifest.json"), "utf8"),
);
const exported = new Set<string>();
for (const file of frozen.product_module_paths as string[]) {
  const source = await readFile(resolve(repository, file), "utf8");
  for (const match of source.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*["']@hugeicons\/core-free-icons["']/g,
  ))
    for (const name of match[1].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]))
      if (name) exported.add(name);
}
for (const name of exported) {
  const data = (icons as Record<string, unknown>)[name] as [string, Record<string, unknown>][];
  if (!Array.isArray(data)) throw new Error(`Missing original icon ${name}`);
  const body = data
    .map(
      ([tag, properties]) =>
        `<${tag} ${Object.entries(properties)
          .filter(([k]) => k !== "key")
          .map(
            ([k, v]) =>
              `${k.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`)}="${String(v).replaceAll('"', "&quot;")}"`,
          )
          .join(" ")}/>`,
    )
    .join("");
  await writeFile(
    resolve(directory, `assets/icons/${name}.svg`),
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`,
  );
}
const formatRoot = resolve(directory, "assets/format-icons");
const webRoot = resolve(repository, "apps/web-client/dist");
const manifestPath = "file-icons/material-5.40.0/manifest.json";
const manifest = JSON.parse(await readFile(resolve(webRoot, manifestPath), "utf8"));
await mkdir(formatRoot, { recursive: true });
await cp(resolve(webRoot, manifestPath), resolve(formatRoot, "manifest.json"));
await cp(resolve(webRoot, "file-icons/material-5.40.0/LICENSE"), resolve(formatRoot, "LICENSE"));
for (const filename of new Set(Object.values(manifest.icons) as string[]))
  await cp(resolve(webRoot, "file-icons/material-5.40.0", filename), resolve(formatRoot, filename));
const examples: Record<string, string> = {};
for (const name of [
  "report.pdf",
  "workspace.ts",
  "main.go",
  "Dockerfile",
  "data.json",
  "report.csv",
  "README.md",
  "package.json",
]) {
  const icon = resolveFileIcon(manifest, name, { light: true });
  if (!icon) throw new Error(`Missing format icon for ${name}`);
  const filename = basename(icon);
  examples[name] = filename;
  await cp(resolve(webRoot, icon.slice(1)), resolve(formatRoot, filename));
}
await writeFile(resolve(formatRoot, "examples.json"), `${JSON.stringify(examples, null, 2)}\n`);
console.log(
  `${exported.size} product Hugeicons and ${Object.keys(examples).length} format-icon examples prepared.`,
);
