import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const output = join(root, "docs/verification/acp-2026-11-16/cutover");
if (existsSync(join(output, "source-archive.json")))
  throw new Error("This cutover capture is already sealed.");
mkdirSync(output, { recursive: true });
const run = (args: string[], env?: Record<string, string | undefined>) => {
  const result = Bun.spawnSync(args, { cwd: root, env: { ...process.env, ...env } });
  if (result.exitCode) throw new Error(`Capture command failed: ${args[0]} ${args[1]}`);
  return result.stdout;
};
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const manifest = JSON.parse(run(["bun", join(import.meta.dir, "manifest.ts")]).toString()) as {
  source_commit: string;
  files: { path: string; state: string; sha256?: string }[];
};
const backend = readFileSync(join(root, ".dev/acp-cutover-backend-final.log"), "utf8");
if (!/\n \d+ pass\n 0 fail\n/.test(backend)) throw new Error("Backend acceptance is not green.");
for (const file of [
  ".dev/acp-native-ui/report.json",
  ".dev/acp-native/codex-controls.json",
  ".dev/acp-browser/cutover-desktop/desktop.json",
  ".dev/acp-browser/cutover-mobile/mobile.json",
]) {
  if (JSON.parse(readFileSync(join(root, file), "utf8")).completed !== true)
    throw new Error(`Incomplete acceptance capture: ${file}`);
}
const paths = manifest.files.map((file) => file.path);
const tracked = paths.filter(
  (path) =>
    !Bun.spawnSync(["git", "ls-files", "--error-unmatch", "--", path], { cwd: root }).exitCode,
);
const chunks = [run(["git", "diff", "--binary", manifest.source_commit, "--", ...tracked])];
for (const path of paths.filter((path) => !tracked.includes(path))) {
  const result = Bun.spawnSync(["git", "diff", "--no-index", "--binary", "--", "/dev/null", path], {
    cwd: root,
  });
  if (result.exitCode !== 1) throw new Error(`Cannot capture new source: ${path}`);
  chunks.push(result.stdout);
}
const patch = Buffer.concat(chunks);
const compressed = Bun.gzipSync(patch);
const index = join(root, `.dev/acp-cutover-index-${crypto.randomUUID()}`);
const patchFile = join(root, `.dev/acp-cutover-patch-${crypto.randomUUID()}`);
try {
  await Bun.write(patchFile, patch);
  run(["git", "read-tree", manifest.source_commit], { GIT_INDEX_FILE: index });
  run(["git", "apply", "--cached", "--check", patchFile], { GIT_INDEX_FILE: index });
  run(["git", "apply", "--cached", patchFile], { GIT_INDEX_FILE: index });
  for (const file of manifest.files) {
    const recovered = Bun.spawnSync(["git", "show", `:${file.path}`], {
      cwd: root,
      env: { ...process.env, GIT_INDEX_FILE: index },
    });
    if (
      file.state === "retired"
        ? recovered.exitCode === 0
        : recovered.exitCode !== 0 || sha(recovered.stdout) !== file.sha256
    )
      throw new Error(`Reconstructed source does not match manifest: ${file.path}`);
  }
} finally {
  rmSync(index, { force: true });
  rmSync(patchFile, { force: true });
}
await Bun.write(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await Bun.write(join(output, "source.patch.gz"), compressed);
const captures: [string, string][] = [
  [".dev/acp-cutover-backend-final.log", "backend.log"],
  [".dev/acp-cutover-final-types.log", "typecheck.log"],
  [".dev/acp-cutover-final-build.log", "build.log"],
  [".dev/acp-cutover-final-changed-check.log", "changed-source-check.log"],
  [".dev/acp-cutover-docs-final.log", "docs-check.log"],
  [".dev/acp-cutover-native.log", "native-codex.log"],
  [".dev/acp-native/codex-subscription.json", "native-codex.json"],
  [".dev/acp-native-controls.log", "native-controls.log"],
  [".dev/acp-native/codex-controls.json", "native-controls.json"],
  [".dev/acp-managed-install-final.log", "managed-install.json"],
  [".dev/acp-managed-profiles.json", "managed-profiles.json"],
  [".dev/acp-native-ui.log", "tauri.log"],
  [".dev/acp-native-ui/report.json", "tauri.json"],
  [".dev/acp-cutover-browser-desktop.log", "browser-desktop.log"],
  [".dev/acp-cutover-browser-mobile.log", "browser-mobile.log"],
];
for (const name of ["desktop", "mobile"]) {
  const prefix = `.dev/acp-browser/cutover-${name}`;
  captures.push([`${prefix}/${name}.json`, `browser-${name}.json`]);
  for (const image of ["form", "picker", "progress", "provider", "last"])
    captures.push([`${prefix}/${name}-${image}.png`, `browser-${name}-${image}.png`]);
}
const evidence = [];
for (const [source, name] of captures) {
  if (!existsSync(join(root, source))) throw new Error(`Missing acceptance capture: ${source}`);
  copyFileSync(join(root, source), join(output, name));
  const bytes = readFileSync(join(output, name));
  evidence.push({ path: name, bytes: bytes.byteLength, sha256: sha(bytes) });
}
const observations = readFileSync(join(output, "tauri-observations.json"));
evidence.push({
  path: "tauri-observations.json",
  bytes: observations.byteLength,
  sha256: sha(observations),
});
mkdirSync(join(output, "attempts"), { recursive: true });
for (const name of [
  "acp-native-ui-attempt-1",
  "acp-final-backend-regression",
  "acp-command-regression",
  "acp-command-browser-desktop-attempt",
  "acp-command-browser-mobile-attempt",
  "acp-cutover-backend-loaded",
]) {
  const path = join(root, `.dev/${name}.log`);
  if (existsSync(path)) copyFileSync(path, join(output, "attempts", `${name}.log`));
}
await Bun.write(
  join(output, "source-archive.json"),
  `${JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      baseline: manifest.source_commit,
      scope:
        "ACP runtime, retained Codex account authority, product/API consumers, tests and current verification entrypoints; unrelated persistence and other owner changes excluded",
      source_files: paths.length,
      retired_files: manifest.files.filter((file) => file.state === "retired").length,
      patch_bytes: patch.byteLength,
      patch_gzip_bytes: compressed.byteLength,
      patch_gzip_sha256: sha(compressed),
      baseline_apply_check: "pass using a separate temporary Git index; working index untouched",
      reconstructed_source_hashes: "pass for every captured present/retired path",
      evidence,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify({
    source_files: paths.length,
    evidence_files: evidence.length,
    baseline_apply_check: "pass",
  }),
);
