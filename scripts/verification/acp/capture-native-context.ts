import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const output = join(root, ".dev/verification/acp-2026-11-16/native-context");
if (existsSync(join(output, "source-archive.json")))
  throw new Error("This native context capture is already sealed.");
mkdirSync(output, { recursive: true });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = (args: string[], env?: Record<string, string | undefined>) => {
  const result = Bun.spawnSync(args, { cwd: root, env: { ...process.env, ...env } });
  if (result.exitCode)
    throw new Error(`Native context capture command failed: ${args[0]} ${args[1]}`);
  return result.stdout;
};
for (const path of [
  ".dev/acp-native-context/report.json",
  ".dev/acp-native-accounts/report.json",
  ".dev/acp-native-accounts/cleanup-audit.json",
]) {
  const result = JSON.parse(readFileSync(join(root, path), "utf8"));
  if (!(result.completed ?? result.passed)) throw new Error(`Incomplete native capture: ${path}`);
}
if (
  !/\n \d+ pass\n 0 fail\n/.test(
    readFileSync(join(root, ".dev/acp-artifact-regression.log"), "utf8"),
  )
)
  throw new Error("Artifact regression is not green.");
const manifest = JSON.parse(run(["bun", join(import.meta.dir, "manifest.ts")]).toString()) as {
  source_commit: string;
  files: { path: string; state: string; sha256?: string }[];
};
const tracked = manifest.files
  .filter(
    (file) =>
      !Bun.spawnSync(["git", "ls-files", "--error-unmatch", "--", file.path], { cwd: root })
        .exitCode,
  )
  .map((file) => file.path);
const chunks = [run(["git", "diff", "--binary", manifest.source_commit, "--", ...tracked])];
for (const file of manifest.files.filter((file) => !tracked.includes(file.path))) {
  const result = Bun.spawnSync(
    ["git", "diff", "--no-index", "--binary", "--", "/dev/null", file.path],
    { cwd: root },
  );
  if (result.exitCode !== 1) throw new Error(`Cannot capture new native source: ${file.path}`);
  chunks.push(result.stdout);
}
const patch = Buffer.concat(chunks);
const compressed = Bun.gzipSync(patch);
const index = join(root, `.dev/acp-context-index-${crypto.randomUUID()}`);
const temporary = `${index}.patch`;
try {
  await Bun.write(temporary, patch);
  run(["git", "read-tree", manifest.source_commit], { GIT_INDEX_FILE: index });
  run(["git", "apply", "--cached", "--check", temporary], { GIT_INDEX_FILE: index });
  run(["git", "apply", "--cached", temporary], { GIT_INDEX_FILE: index });
  for (const file of manifest.files) {
    const value = Bun.spawnSync(["git", "show", `:${file.path}`], {
      cwd: root,
      env: { ...process.env, GIT_INDEX_FILE: index },
    });
    if (
      file.state === "retired"
        ? !value.exitCode
        : value.exitCode !== 0 || sha(value.stdout) !== file.sha256
    )
      throw new Error(`Native source reconstruction mismatch: ${file.path}`);
  }
} finally {
  rmSync(index, { force: true });
  rmSync(temporary, { force: true });
}
await Bun.write(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await Bun.write(join(output, "source.patch.gz"), compressed);
const captures = [
  [".dev/acp-native-context.log", "native-context.log"],
  [".dev/acp-native-context/report.json", "native-context.json"],
  [".dev/acp-native-accounts.log", "native-accounts.log"],
  [".dev/acp-native-accounts/report.json", "native-accounts.json"],
  [".dev/acp-native-accounts/cleanup-audit.json", "cleanup-audit.json"],
  [".dev/acp-native-accounts-executed.ts.txt", "native-accounts-executed.ts.txt"],
  [".dev/acp-nullable-artifact-before.log", "artifact-before.log"],
  [".dev/acp-native-accounts-first.log", "accounts-setup-attempt.log"],
  [".dev/acp-native-accounts-first.json", "accounts-setup-attempt.json"],
  [".dev/acp-artifact-regression.log", "regression.log"],
  [".dev/acp-artifact-typecheck.log", "typecheck.log"],
  [".dev/acp-native-context-source-check.log", "source-check.log"],
  [".dev/acp-native-context-docs.log", "docs-check.log"],
];
const evidence = captures.map(([path, name]) => {
  copyFileSync(join(root, path), join(output, name));
  const bytes = readFileSync(join(output, name));
  return { path: name, bytes: bytes.byteLength, sha256: sha(bytes) };
});
await Bun.write(
  join(output, "source-archive.json"),
  `${JSON.stringify({ timestamp: new Date().toISOString(), baseline: manifest.source_commit, source_files: manifest.files.length, retired_files: manifest.files.filter((file) => file.state === "retired").length, source_patch_bytes: patch.byteLength, source_patch_gzip_sha256: sha(compressed), reconstruction: "pass; apply check and every reconstructed file hash verified using a separate index", evidence }, null, 2)}\n`,
);
console.log(
  JSON.stringify({
    source_files: manifest.files.length,
    evidence_files: evidence.length,
    reconstruction: "pass",
  }),
);
