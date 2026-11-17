import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { HarnessError } from "../contracts";

/** Cache only reviewed upstream bytes; resolve the original dependency closure after relocation. */
export function patchedModule(
  sourcePath: string,
  directory: string,
  expected: string,
  transform: (source: string) => string,
) {
  const original = realpathSync(sourcePath);
  const source = readFileSync(original, "utf8");
  if (createHash("sha256").update(source).digest("hex") !== expected)
    throw new HarnessError("VERSION_UNKNOWN");
  const patched = transform(source)
    .replaceAll("import.meta.url", JSON.stringify(pathToFileURL(original).href))
    .replace(/\bfrom (["'])([^"']+)\1/g, (match, quote: string, specifier: string) =>
      specifier.startsWith("node:") || builtinModules.includes(specifier)
        ? match
        : `from ${quote}${import.meta.resolve(specifier, pathToFileURL(original).href)}${quote}`,
    );
  const hash = createHash("sha256").update(patched).digest("hex");
  const cache = join(directory, "acp-adapters");
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  const path = join(cache, `${hash}.mjs`);
  writeFileSync(path, patched, { mode: 0o600 });
  return { path, hash };
}

export function replaceOnce(source: string, before: string, after: string) {
  if (source.split(before).length !== 2) throw new HarnessError("VERSION_UNKNOWN");
  return source.replace(before, after);
}
