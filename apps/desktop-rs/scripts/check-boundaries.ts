import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { cargo, directory } from "./cargo";

const child = Bun.spawn(
  [
    cargo,
    "metadata",
    "--locked",
    "--format-version",
    "1",
    "--filter-platform",
    "aarch64-apple-darwin",
  ],
  { cwd: directory, stdout: "pipe", stderr: "inherit" },
);
const metadata = await new Response(child.stdout).json();
assert.equal(await child.exited, 0);
const byId = new Map(metadata.packages.map((p: { id: string }) => [p.id, p]));
const nodes = new Map(
  metadata.resolve.nodes.map((n: { id: string; dependencies: string[] }) => [n.id, n.dependencies]),
);
for (const name of ["ngertiin-client", "ngertiin-avatar"]) {
  const entry = metadata.packages.find((p: { name: string }) => p.name === name);
  const visited = new Set<string>();
  const visit = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const p = byId.get(id) as { name: string };
    assert(
      !/^(gpui|ngertiin-desktop|objc2|lb-wry)/.test(p.name),
      `${name} must remain GPUI/platform independent: ${p.name}`,
    );
    for (const next of nodes.get(id) as string[]) visit(next);
  };
  visit(entry.id);
}
const colors = JSON.parse(await readFile(resolve(directory, "assets/theme-tokens.json"), "utf8"));
for await (const file of new Bun.Glob("crates/**/*.rs").scan({ cwd: directory })) {
  const source = await readFile(resolve(directory, file), "utf8");
  for (const match of source.matchAll(/\b(?:p|palette)\.color\("([^"]+)"\)/g))
    for (const mode of ["light", "dark"])
      assert(
        typeof colors[mode][match[1]] === "string",
        `Unknown ${mode} palette token ${match[1]} in ${file}`,
      );
  assert(
    !/apps\/web-client\/dist|ReactDOM|createRoot|pdfjs/.test(source),
    `Browser application/PDF shell in ${file}`,
  );
  if (/WebView::build|WebViewBuilder::new/.test(source))
    assert.equal(file, "crates/desktop/src/platform/embedded.rs");
}
console.log("Dependency direction and rendering ownership passed.");
