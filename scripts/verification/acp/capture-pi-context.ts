import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { selectedPiSumopod } from "./native-credentials";

const root = resolve(import.meta.dir, "../../..");
const output = join(root, ".dev/verification/acp-2026-11-16/pi-context");
if (existsSync(join(output, "source-archive.json")))
  throw new Error("This Pi context capture is already sealed.");
mkdirSync(output, { recursive: true });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const json = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
const run = (args: string[], env?: Record<string, string | undefined>) => {
  const result = Bun.spawnSync(args, { cwd: root, env: { ...process.env, ...env } });
  if (result.exitCode) throw new Error(`Pi context capture command failed: ${args[0]} ${args[1]}`);
  return result.stdout;
};
const native = json(".dev/acp-native-context-pi/report.json");
const ui = json(".dev/acp-native-ui/api24/report.json");
const cleanup = json(".dev/acp-native-ui/api24/cleanup-audit.json");
if (
  !native.completed ||
  native.turns.length !== 3 ||
  native.turns.some((turn: { status: string }) => turn.status !== "succeeded") ||
  native.artifact.download_exact_bytes !== true ||
  native.artifact.foreign_workspace_status !== 403 ||
  !Object.values(native.changed_instructions).every((value) => value === true) ||
  !Object.values(native.private_context).every((value) => value === true) ||
  !Object.values(native.skills).every(
    (value) => value === true || value === "not_inherited_or_certified",
  ) ||
  native.provider_credential_bytes_persisted !== false ||
  native.credential_scan_skipped_files !== 0 ||
  !ui.completed ||
  ui.contract_version !== "2.4.0" ||
  ui.checks.length !== 7 ||
  !cleanup.passed ||
  !cleanup.exact_synthetic_keychain_entry_removed ||
  cleanup.ports.length !== 3 ||
  !cleanup.ports.every((port: { closed: boolean }) => port.closed)
)
  throw new Error("Native Pi context or Tauri cleanup evidence is incomplete.");
for (const path of [
  ".dev/acp-native-context-pi-fixed.log",
  ".dev/acp-parallel-tools-fixed.log",
  ".dev/acp-api24-surface-fixed.log",
  ".dev/acp-native-ui-api24.log",
])
  if (
    !/\n \d+ pass\n(?: \d+ filtered out\n)? 0 fail\n/.test(readFileSync(join(root, path), "utf8"))
  )
    throw new Error(`Pi context gate is not green: ${path}`);
const full = readFileSync(join(root, ".dev/acp-backend-all.log"), "utf8");
if (!/600 pass/.test(full) || !/1 fail/.test(full) || !/Ran 601 tests across 79 files/.test(full))
  throw new Error("The full backend result must retain its original one-failure denominator.");
if (json(".dev/acp-pi-context-web-baseline.json").unchanged_from_head !== true)
  throw new Error("The known full web lint baseline has changed.");
const captures = [
  [".dev/acp-native-context-pi/report.json", "pi-context.json"],
  [".dev/acp-native-context-pi-fixed.log", "pi-context.log"],
  [".dev/acp-native-context-pi-final-executed.ts.txt", "pi-context-executed.ts.txt"],
  [".dev/acp-native-context-pi-first.json", "pi-context-before.json"],
  [".dev/acp-native-context-pi-first.log", "pi-context-before.log"],
  [".dev/acp-native-context-pi-executed.ts.txt", "pi-context-before-executed.ts.txt"],
  [".dev/acp-parallel-tools-before.log", "parallel-before.log"],
  [".dev/acp-parallel-tools-fixed.log", "parallel-after.log"],
  [".dev/acp-native-ui/api24/report.json", "native-ui.json"],
  [".dev/acp-native-ui/api24/cleanup-audit.json", "native-ui-cleanup.json"],
  [".dev/acp-native-ui-api24.log", "native-ui.log"],
  [".dev/acp-native-ui-api24-executed.ts.txt", "native-ui-executed.ts.txt"],
  [".dev/acp-backend-all.log", "backend-all.log"],
  [".dev/acp-api24-surface-fixed.log", "api24-surface.log"],
  [".dev/acp-pi-context-types.log", "typecheck.log"],
  [".dev/acp-pi-context-server-check.log", "server-check.log"],
  [".dev/acp-pi-context-web-check.log", "web-full-check.log"],
  [".dev/acp-pi-context-web-source-check.log", "web-source-check.log"],
  [".dev/acp-pi-context-web-baseline.json", "web-lint-baseline.json"],
  [".dev/acp-pi-context-script-check.log", "script-check.log"],
] as const;
const credential = Buffer.from(selectedPiSumopod().apiKey);
for (const [path] of captures)
  if (readFileSync(join(root, path)).includes(credential))
    throw new Error("The selected credential occurs in an evidence file.");
if (
  sha(readFileSync(join(root, captures[2][0]))) !==
  native.source_files.find(
    (file: { path: string }) => file.path === "scripts/verification/acp/native-context.test.ts",
  )?.sha256
)
  throw new Error("The executed Pi probe source does not match its report.");

const previous = ["profiles", "cutover", "native-context", "native-harnesses"].map((phase) => {
  const directory = join(root, ".dev/verification/acp-2026-11-16", phase);
  const receipt = JSON.parse(readFileSync(join(directory, "source-archive.json"), "utf8"));
  const expectedPatch =
    receipt.source_patch_gzip_sha256 ?? receipt.patch_gzip_sha256 ?? receipt.archive_sha256;
  if (
    sha(readFileSync(join(directory, "source.patch.gz"))) !== expectedPatch ||
    !(receipt.evidence ?? []).every(
      (item: { path: string; sha256: string }) =>
        sha(readFileSync(join(directory, item.path))) === item.sha256,
    )
  )
    throw new Error(`An earlier sealed capture failed its hash audit: ${phase}`);
  return {
    phase,
    passed: true,
    receipt_sha256: sha(readFileSync(join(directory, "source-archive.json"))),
  };
});
await Bun.write(
  join(output, "previous-captures-audit.json"),
  `${JSON.stringify(previous, null, 2)}\n`,
);

const manifest = JSON.parse(run(["bun", join(import.meta.dir, "manifest.ts")]).toString()) as {
  source_commit: string;
  files: { path: string; state: string; sha256?: string }[];
  managed_executables: { harness: string; version: string | null; path: string; sha256: string }[];
};
manifest.managed_executables = [];
const runtime = new HarnessRuntime();
for (const harness of ["codex", "claude", "opencode", "pi"] as const) {
  const installed = await runtime.detect(harness);
  if (installed.state !== "supported" || !installed.executable)
    throw new Error(`Unsupported captured runtime: ${harness}`);
  const path = realpathSync(installed.executable);
  manifest.managed_executables.push({
    harness,
    version: installed.version,
    path,
    sha256: sha(readFileSync(path)),
  });
  if (harness === "pi") {
    const path = realpathSync(join(dirname(installed.executable), "pi"));
    manifest.managed_executables.push({
      harness: "native-pi",
      version: "1.5.2",
      path,
      sha256: sha(readFileSync(path)),
    });
  }
}
const nativeCodex = await runtime.nativeCodex();
if (nativeCodex.state !== "supported" || !nativeCodex.executable)
  throw new Error("Unsupported captured native Codex.");
manifest.managed_executables.push({
  harness: "native-codex",
  version: nativeCodex.version,
  path: realpathSync(nativeCodex.executable),
  sha256: sha(readFileSync(nativeCodex.executable)),
});
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
  if (result.exitCode !== 1) throw new Error(`Cannot capture new Pi context source: ${file.path}`);
  chunks.push(result.stdout);
}
const patch = Buffer.concat(chunks);
if (patch.includes(credential))
  throw new Error("The selected credential occurs in the source patch.");
const compressed = Bun.gzipSync(patch);
const index = join(root, `.dev/acp-pi-context-index-${crypto.randomUUID()}`);
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
      throw new Error(`Pi context source reconstruction mismatch: ${file.path}`);
  }
} finally {
  rmSync(index, { force: true });
  rmSync(temporary, { force: true });
}
await Bun.write(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
await Bun.write(join(output, "source.patch.gz"), compressed);
const evidence = captures.map(([path, name]) => {
  copyFileSync(join(root, path), join(output, name));
  const bytes = readFileSync(join(output, name));
  return { path: name, bytes: bytes.byteLength, sha256: sha(bytes) };
});
const auditBytes = readFileSync(join(output, "previous-captures-audit.json"));
evidence.push({
  path: "previous-captures-audit.json",
  bytes: auditBytes.byteLength,
  sha256: sha(auditBytes),
});
await Bun.write(join(output, "source-archive.json"), "{}\n");
await Bun.write(join(output, "docs-check.log"), "Capture in progress.\n");
const docs = Bun.spawnSync(["bun", "run", "docs:check"], { cwd: root });
await Bun.write(join(output, "docs-check.log"), Buffer.concat([docs.stdout, docs.stderr]));
if (docs.exitCode) {
  rmSync(join(output, "source-archive.json"), { force: true });
  throw new Error("Pi context documentation check failed.");
}
const docsBytes = readFileSync(join(output, "docs-check.log"));
evidence.push({ path: "docs-check.log", bytes: docsBytes.byteLength, sha256: sha(docsBytes) });
await Bun.write(
  join(output, "source-archive.json"),
  `${JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      baseline: manifest.source_commit,
      source_files: manifest.files.length,
      retired_files: manifest.files.filter((file) => file.state === "retired").length,
      source_patch_bytes: patch.byteLength,
      source_patch_gzip_sha256: sha(compressed),
      reconstruction:
        "pass; apply check and every reconstructed file hash verified using a separate index",
      selected_provider_credential_bytes_persisted: false,
      previous_captures_unchanged: true,
      evidence,
    },
    null,
    2,
  )}\n`,
);
console.log(
  JSON.stringify({
    source_files: manifest.files.length,
    evidence_files: evidence.length,
    reconstruction: "pass",
  }),
);
