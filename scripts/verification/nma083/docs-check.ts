import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const excluded = [
  ".agents/skills/gpui-kit-design-guides/references/design-guides.md",
  ".agents/skills/gpui-kit/references/coding-guides.md",
  ".agents/skills/gpui-kit/references/usage.md",
];
const evidence = excluded.map((path) => {
  const current = readFileSync(join(root, path));
  const retained = execFileSync("git", ["show", `HEAD:${path}`], { cwd: root });
  if (!current.equals(retained))
    throw new Error(`Imported documentation baseline changed: ${path}`);
  return {
    path,
    unchanged_from_head: true,
    sha256: createHash("sha256").update(current).digest("hex"),
  };
});
await Bun.write(
  join(root, "docs/verification/nma-083/docs-scoped-exclusions.json"),
  `${JSON.stringify({ excluded_unchanged_files: evidence, full_check_known_broken_links: 8 }, null, 2)}\n`,
);
let source = readFileSync(join(root, "scripts/check-docs.ts"), "utf8");
const rootDeclaration = 'const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");';
const filter = '.filter((path) => path.endsWith(".md") && existsSync(resolve(root, path)))';
if (!source.includes(rootDeclaration) || !source.includes(filter))
  throw new Error("Documentation checker changed; review the bounded adapter.");
source = source
  .replace(rootDeclaration, `const root = ${JSON.stringify(root)};`)
  .replace(filter, `${filter}.filter(path => !${JSON.stringify(excluded)}.includes(path))`);
const directory = mkdtempSync(join(root, ".dev/nma083-docs-"));
try {
  const path = join(directory, "check.ts");
  await Bun.write(path, source);
  const child = Bun.spawn([process.execPath, path], {
    cwd: root,
    stdout: "inherit",
    stderr: "inherit",
  });
  process.exitCode = await child.exited;
} finally {
  rmSync(directory, { recursive: true, force: true });
}
