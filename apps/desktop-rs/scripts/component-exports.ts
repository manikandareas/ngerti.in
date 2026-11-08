/** Verify only the gallery's known exports against the original fixture bytes. */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { directory, repository } from "./cargo";

const profile = join(homedir(), "Library/Application Support/Ngertiin Rust Development");
const exports = join(profile, "component-exports");
const source = await readFile(resolve(directory, "crates/desktop/src/features/content.rs"), "utf8");
const markdown = source.match(/let markdown_source="((?:\\.|[^"\\])*)"\.to_owned\(\);/);
if (!markdown) throw new Error("Markdown fixture changed; review the expected source.");
const rows = Array.from({ length: 10000 }, (_, r) =>
  Array.from({ length: 20 }, (_, c) => `Row ${r} · cell ${c}`).join(","),
);
const largeSource = Array.from(
  { length: 100000 },
  (_, i) => `// source ${String(i).padStart(6, "0")}   `,
)
  .join("\n")
  .padEnd(2097152, " ");
const fixtures: Record<string, Uint8Array> = {
  "large.ts": Buffer.from(largeSource),
  "source.ts": Buffer.from(
    `// Read-only TypeScript fixture\n${Array.from({ length: 800 }, (_, i) => `export const item${i} = { label: "Row ${i}", ready: true };\n`).join("")}`,
  ),
  "table.csv": Buffer.from(
    [Array.from({ length: 20 }, (_, i) => `Column ${i + 1}`).join(","), ...rows].join("\r\n"),
  ),
  "document.md": Buffer.from(JSON.parse(`"${markdown[1]}"`)),
  "image.png": await readFile(join(profile, "foundation-probes-v1/fur-0.png")),
  "document.html": await readFile(resolve(directory, "assets/static-document.html")),
  "long.pdf": await readFile(resolve(directory, "verification/nma-067/pdf/long.pdf")),
  "protected.pdf": await readFile(resolve(directory, "verification/nma-067/pdf/protected.pdf")),
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const candidates = await Promise.all(
  (await readdir(exports))
    .filter((name) =>
      /-(large\.ts|source\.ts|table\.csv|document\.md|image\.png|document\.html)$|\.pdf$/.test(
        name,
      ),
    )
    .map(async (name) => ({ name, sha256: hash(await readFile(join(exports, name))) })),
);
const checks = Object.entries(fixtures).map(([name, bytes]) => {
  const sha256 = hash(bytes);
  const matching = candidates.filter((c) => c.sha256 === sha256).map((c) => c.name);
  return {
    fixture: name,
    bytes: bytes.length,
    sha256,
    matching_exports: matching,
    passed: matching.length > 0,
  };
});
await writeFile(
  resolve(repository, "docs/verification/nma-067/components/original-exports.json"),
  `${JSON.stringify({ version: 1, checked_at_utc: new Date().toISOString(), checks, passed: checks.every((c) => c.passed) }, null, 2)}\n`,
);
console.log(checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.fixture}`).join("\n"));
if (checks.some((c) => !c.passed)) process.exitCode = 1;
