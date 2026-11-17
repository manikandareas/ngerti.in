import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";

const root = resolve(import.meta.dir, "../../..");
const output = join(root, ".dev/verification/acp-2026-11-16/native-harnesses");
if (existsSync(join(output, "source-archive.json"))) throw new Error("This native harness capture is already sealed.");
mkdirSync(output, { recursive: true });
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = (args: string[], env?: Record<string, string | undefined>) => {
  const result = Bun.spawnSync(args, { cwd: root, env: { ...process.env, ...env } });
  if (result.exitCode)
    throw new Error(`Native harness capture command failed: ${args[0]} ${args[1]}`);
  return result.stdout;
};
const required = [
  ".dev/acp-selected-providers/pi-upstream.json",
  ".dev/acp-selected-providers/pi-upstream-invalid-credential.json",
  ".dev/acp-selected-providers/opencode.json",
  ".dev/acp-native/pi-controls.json",
  ".dev/acp-native-accounts-pi/report.json",
  ".dev/acp-native-accounts-pi/cleanup-audit.json",
  ".dev/acp-browser/native-provider-generic-final/desktop.json",
  ".dev/acp-browser/native-provider-generic-final/mobile.json",
];
for (const path of required) {
  const result = JSON.parse(readFileSync(join(root, path), "utf8"));
  if (!(result.completed ?? result.passed)) throw new Error(`Incomplete native harness capture: ${path}`);
}
const json = (path: string) => JSON.parse(readFileSync(join(root, path), "utf8"));
if (!json(required[2]).provider_failure_delivery_verified || json(required[2]).completed_inference !== false)
  throw new Error("OpenCode failure evidence must not claim completed inference.");
if (json(required[1]).turns[0]?.status !== "failed" || json(required[1]).turns[0]?.diagnostic?.code !== "NATIVE_REJECTED")
  throw new Error("Pi credential failure was not delivered.");
const accounts = json(required[4]);
const cleanup = json(required[5]);
if (accounts.native_key_bytes_persisted !== false || cleanup.checks.length !== 6 ||
    !accounts.lanes.every((lane: { distinct_private_domain: string }) => cleanup.checks.filter((item: { name: string; absent: boolean }) => item.name.includes(lane.distinct_private_domain) && item.absent).length === 3))
  throw new Error("Pi native containment or exact resource cleanup is incomplete.");
for (const path of [".dev/acp-provider-phase-regression.log", ".dev/acp-native-pi-positive-final.log", ".dev/acp-native-pi-invalid-credential-fixed.log", ".dev/acp-native-limit-opencode-final.log", ".dev/acp-native-pi-controls-final.log", ".dev/acp-native-accounts-pi-final.log"])
  if (!/\n \d+ pass\n 0 fail\n/.test(readFileSync(join(root, path), "utf8"))) throw new Error(`Native harness gate is not green: ${path}`);
const manifest = JSON.parse(run(["bun", join(import.meta.dir, "manifest.ts")]).toString()) as {
  source_commit: string;
  files: { path: string; state: string; sha256?: string }[];
  managed_executables?: { harness: string; version: string | null; path: string; sha256: string }[];
};
manifest.managed_executables = [];
const runtime = new HarnessRuntime();
for (const harness of ["codex", "claude", "opencode", "pi"] as const) {
  const installed = await runtime.detect(harness);
  if (installed.state !== "supported" || !installed.executable) throw new Error(`Unsupported captured runtime: ${harness}`);
  const path = realpathSync(installed.executable);
  manifest.managed_executables.push({ harness, version: installed.version, path, sha256: sha(readFileSync(path)) });
  if (harness === "pi") {
    const native = realpathSync(join(dirname(installed.executable), "pi"));
    manifest.managed_executables.push({ harness: "native-pi", version: "1.5.2", path: native, sha256: sha(readFileSync(native)) });
  }
}
const nativeCodex = await runtime.nativeCodex();
if (nativeCodex.state !== "supported" || !nativeCodex.executable) throw new Error("Unsupported captured native Codex.");
manifest.managed_executables.push({ harness: "native-codex", version: nativeCodex.version, path: realpathSync(nativeCodex.executable), sha256: sha(readFileSync(nativeCodex.executable)) });
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
const index = join(root, `.dev/acp-harness-index-${crypto.randomUUID()}`);
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
  [
    ".dev/acp-provider-phase-regression.log",
    "regression.log"
  ],
  [
    ".dev/acp-provider-phase-types-final.log",
    "typecheck.log"
  ],
  [
    ".dev/acp-provider-phase-server-check.log",
    "server-check.log"
  ],
  [
    ".dev/acp-provider-phase-web-check.log",
    "web-check.log"
  ],
  [
    ".dev/acp-provider-limit-web-build.log",
    "web-build.log"
  ],
  [
    ".dev/acp-native-pi-positive-final.log",
    "pi-positive.log"
  ],
  [
    ".dev/acp-selected-providers/pi-upstream.json",
    "pi-positive.json"
  ],
  [
    ".dev/acp-native-pi-invalid-credential-fixed.log",
    "pi-invalid.log"
  ],
  [
    ".dev/acp-selected-providers/pi-upstream-invalid-credential.json",
    "pi-invalid.json"
  ],
  [
    ".dev/acp-native-pi-invalid-credential.log",
    "pi-invalid-before.log"
  ],
  [
    ".dev/acp-pi-invalid-before.json",
    "pi-invalid-before.json"
  ],
  [
    ".dev/acp-native-pi-controls-final.log",
    "pi-controls.log"
  ],
  [
    ".dev/acp-native/pi-controls.json",
    "pi-controls.json"
  ],
  [
    ".dev/acp-native-accounts-pi-final.log",
    "pi-accounts.log"
  ],
  [
    ".dev/acp-native-accounts-pi/report.json",
    "pi-accounts.json"
  ],
  [
    ".dev/acp-native-accounts-pi/cleanup-audit.json",
    "cleanup-audit.json"
  ],
  [
    ".dev/acp-native-accounts-pi-executed.ts.txt",
    "pi-accounts-executed.ts.txt"
  ],
  [
    ".dev/acp-native-limit-opencode-final.log",
    "opencode-limit.log"
  ],
  [
    ".dev/acp-selected-providers/opencode.json",
    "opencode-limit.json"
  ],
  [
    ".dev/acp-opencode-events.log",
    "opencode-events.log"
  ],
  [
    ".dev/acp-opencode-events-report.json",
    "opencode-events.json"
  ],
  [
    ".dev/acp-opencode-events-executed.ts.txt",
    "opencode-events-executed.ts.txt"
  ],
  [
    ".dev/acp-opencode-event-hook-executed.ts.txt",
    "opencode-event-hook-executed.ts.txt"
  ],
  [
    ".dev/acp-selected-pi-openma.log",
    "pi-openma.log"
  ],
  [
    ".dev/acp-selected-providers/pi-openma.json",
    "pi-openma.json"
  ],
  [
    ".dev/acp-native-provider-generic-browser.log",
    "browser-initial.log"
  ],
  [
    ".dev/acp-native-provider-generic-browser-desktop-final.log",
    "desktop.log"
  ],
  [
    ".dev/acp-native-provider-generic-browser-mobile-final.log",
    "mobile.log"
  ],
  [
    ".dev/acp-browser/native-provider-generic-final/desktop.json",
    "desktop.json"
  ],
  [
    ".dev/acp-browser/native-provider-generic-final/desktop-native-provider.png",
    "desktop-native-provider.png"
  ],
  [
    ".dev/acp-browser/native-provider-generic-final/mobile.json",
    "mobile.json"
  ],
  [
    ".dev/acp-browser/native-provider-generic-final/mobile-native-provider.png",
    "mobile-native-provider.png"
  ]
];
const evidence = captures.map(([path, name]) => {
  copyFileSync(join(root, path), join(output, name));
  const bytes = readFileSync(join(output, name));
  return { path: name, bytes: bytes.byteLength, sha256: sha(bytes) };
});
// All referenced evidence/source files now exist before checking the final report links.
await Bun.write(join(output, "source-archive.json"), "{}\n");
await Bun.write(join(output, "docs-check.log"), "Capture in progress.\n");
const docs = Bun.spawnSync(["bun", "run", "docs:check"], { cwd: root });
await Bun.write(join(output, "docs-check.log"), Buffer.concat([docs.stdout, docs.stderr]));
if (docs.exitCode) {
  rmSync(join(output, "source-archive.json"), { force: true });
  throw new Error("Native harness documentation check failed.");
}
const docsBytes = readFileSync(join(output, "docs-check.log"));
evidence.push({ path: "docs-check.log", bytes: docsBytes.byteLength, sha256: sha(docsBytes) });
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
