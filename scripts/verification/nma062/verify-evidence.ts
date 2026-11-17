import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = ".dev/verification/nma-062";
function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)],
  );
}
const secrets = new Set<string>();
function collect(value: unknown) {
  if (!value || typeof value !== "object") return;
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "string" && item.length >= 16 && /token|secret|api_?key/i.test(key))
      secrets.add(item);
    else if (item && typeof item === "object") collect(item);
  }
}
for (const value of [process.env.MUSE_API_KEY, process.env.COMPOSIO_API_KEY])
  if (value) secrets.add(value);
collect(await Bun.file(".dev/nma062-native/installation.json").json());
const source = (await Bun.file(".dev/nma060-gate-proof.json").json()).lanes.codex.input
  .connection_id;
collect(await Bun.file(`.dev/nma049-native/connections/${source}/codex/auth.json`).json());
const authored = Bun.spawnSync([
  "git",
  "diff",
  "--name-only",
  "HEAD",
  "--",
  "apps/web-client",
  "apps/server/src/background.ts",
]);
assert.equal(authored.exitCode, 0);
const scope = [
  ...new Set([
    ...files(root),
    ...files("scripts/verification/nma062"),
    ...authored.stdout.toString().trim().split("\n").filter(Boolean),
    ...files("apps/web-client/src/features/conversation/components"),
    ...files("apps/web-client/src/types"),
    "apps/web-client/src/hooks/use-api-resource.ts",
    "apps/web-client/src/lib/workspace-files.ts",
  ]),
].filter((path) => !path.endsWith("SHA256SUMS"));
for (const path of scope) {
  const bytes = readFileSync(path);
  for (const value of secrets)
    assert(!bytes.includes(Buffer.from(value)), `Credential value detected in ${path}`);
}
writeFileSync(
  join(root, "credential-scan.json"),
  `${JSON.stringify({ files_scanned: scope.length, credential_values_checked: secrets.size, matches: 0, credential_values_retained: false }, null, 2)}\n`,
);
const entries = files(root)
  .filter((path) => !path.endsWith("SHA256SUMS"))
  .sort()
  .map(
    (path) =>
      `${createHash("sha256").update(readFileSync(path)).digest("hex")}  ${path.slice(root.length + 1)}`,
  );
writeFileSync(join(root, "SHA256SUMS"), `${entries.join("\n")}\n`);
console.log(
  JSON.stringify({
    files_scanned: scope.length,
    secret_matches: 0,
    immutable_evidence_files: entries.length,
  }),
);
