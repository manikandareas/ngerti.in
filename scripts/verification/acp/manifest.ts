import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(import.meta.dir, "../../..");
const runtime = join(import.meta.dir, "runtime/node_modules");
const digest = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const packages = [
  "@agentclientprotocol/codex-acp",
  "@openai/codex",
  "@agentclientprotocol/claude-agent-acp",
  "@anthropic-ai/claude-agent-sdk",
  "opencode-ai",
  "pi-acp",
  "@openma/pi-acp",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-ai",
].map((name) => {
  const path = join(runtime, name, "package.json");
  return {
    name,
    version: JSON.parse(readFileSync(path, "utf8")).version,
    package_sha256: digest(path),
  };
});
const sourceFiles = [
  "apps/server/package.json",
  "bun.lock",
  "apps/server/src/harness/acp/connection.ts",
  "apps/server/src/harness/acp/session.ts",
  "apps/server/src/harness/acp/projection.ts",
  "apps/server/src/harness/session-tools.ts",
  "apps/server/src/harness/tools.ts",
  "apps/server/src/runs/activity.ts",
  "apps/server/src/harness/muse/tools.ts",
  "apps/server/src/harness/broker.ts",
  "apps/server/src/harness/contracts.ts",
  "apps/server/src/harness/client.ts",
  "apps/server/src/harness/context.ts",
  "apps/server/src/harness/process.ts",
  "apps/server/src/lifecycle.ts",
  "apps/server/tests/acp.test.ts",
  "apps/server/tests/session-tools.test.ts",
  "apps/server/tests/fixtures/acp-agent.ts",
  "apps/server/tests/harness.test.ts",
  "scripts/verification/acp/handshake.ts",
  "scripts/verification/acp/sessions.ts",
  "scripts/verification/acp/runtime/package.json",
  "scripts/verification/acp/runtime/package-lock.json",
  ...readdirSync(join(root, "apps/server/src/harness/acp"))
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `apps/server/src/harness/acp/${file}`),
  "apps/server/src/harness/providers.ts",
  "apps/server/src/harness/native-configuration.ts",
  "apps/server/src/harness/accounts.ts",
  "apps/server/src/harness/connections.ts",
  "apps/server/src/harness/availability.ts",
  "apps/server/src/harness/catalog-policy.ts",
  "apps/server/src/harness/instructions.ts",
  "apps/server/src/harness/interaction-contracts.ts",
  "apps/server/src/run-controls.ts",
  "apps/server/src/runs/contracts.ts",
  "apps/server/src/runs/native-progress.ts",
  "apps/server/src/contracts.ts",
  "apps/server/src/api-responses.ts",
  "apps/server/src/api-contract.ts",
  "apps/server/src/agents/contracts.ts",
  "apps/server/src/api/harness.ts",
  "apps/server/src/main.ts",
  "apps/server/tests/acp-adapter.test.ts",
  "apps/server/tests/acp-api.test.ts",
  "apps/server/tests/controls.test.ts",
  "scripts/verification/acp/profiles.ts",
  "scripts/verification/acp/native.test.ts",
  "scripts/verification/acp/native-credentials.ts",
  "docs/contracts/2.3.0.json",
  "docs/contracts/2.4.0.json",
  "scripts/verification/acp/fixtures/retired-source.json",
  "docs/architecture/acp-harnesses.md",
  "docs/architecture/api-consumer-contract.md",
  "docs/architecture/server-organizations-api.md",
  "docs/architecture/provider-connections.md",
  "docs/development/source-adoption.md",
  "docs/development/history.md",
  "docs/README.md",
  "docs/backlog/README.md",
  "docs/development/acceptance.md",
  "apps/desktop/src-tauri/src/credential_store.rs",
  "apps/desktop/src-tauri/src/profile.rs",
  "apps/desktop/src-tauri/src/gateway.rs",
  "apps/desktop/src-tauri/src/host.rs",
  "docs/architecture/workspace-artifact-api.md",
  "docs/research/acp-harness-integration-2026-11-16.md",
  "apps/server/src/api-access.ts",
  "apps/server/src/artifacts.ts",
  "apps/server/src/api.ts",
  "apps/server/src/background.ts",
  "apps/server/src/config.ts",
  "apps/server/src/contracts/base.ts",
  "apps/server/src/conversations/creation.ts",
  "apps/server/src/harness/codex/accounts.ts",
  "apps/server/src/harness/codex/authority.ts",
  "apps/server/src/harness/codex/authority-rpc.ts",
  "apps/server/src/harness/codex/models.ts",
  "apps/server/src/harness/codex/native.ts",
  "apps/server/src/harness/inherited-skills.ts",
  "apps/server/src/harness/login-readiness.ts",
  "apps/server/src/harness/runtime.ts",
  "apps/server/src/harness/selection-contracts.ts",
  "apps/server/src/harness/updater.ts",
  "apps/server/src/learning/contracts.ts",
  "apps/server/src/organizations/data-contracts.ts",
  "apps/server/tests/agents.test.ts",
  "apps/server/tests/workspaces.test.ts",
  "apps/server/tests/bootstrap.test.ts",
  "apps/server/tests/cancellation-adapters.test.ts",
  "apps/server/tests/codex.test.ts",
  "apps/server/tests/goals/adapters.test.ts",
  "apps/server/tests/groups/adapters.test.ts",
  "apps/server/tests/harness-catalog.test.ts",
  "apps/server/tests/learning/adapters.test.ts",
  "apps/server/tests/organizations/readiness-helpers.ts",
  "apps/server/tests/organizations/readiness.test.ts",
  "apps/server/tests/routing-recovery.test.ts",
  "apps/server/tests/acp-fixture.ts",
  "apps/server/tests/fixtures/codex-acp.ts",
  "apps/server/tests/fixtures/codex-authority.ts",
  "scripts/verification/nma076/evidence.ts",
  "scripts/verification/nma076/harnesses.test.ts",
  "scripts/verification/nma077/codex-key-storage.test.ts",
  "scripts/verification/nma079/native.test.ts",
  "scripts/verification/nma082/deployed-checkpoint.ts",
  "scripts/verification/nma082/native-protocol.ts",
  ...readdirSync(import.meta.dir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => `scripts/verification/acp/${file}`),
];
const retirement = JSON.parse(
  readFileSync(join(root, "scripts/verification/acp/fixtures/retired-source.json"), "utf8"),
) as { revision: string; paths: string[] };
const changedWeb = Bun.spawnSync(["git", "diff", "--name-only", "--", "apps/web-client/src"], {
  cwd: root,
});
const newWeb = Bun.spawnSync(
  ["git", "ls-files", "--others", "--exclude-standard", "--", "apps/web-client/src"],
  { cwd: root },
);
if (changedWeb.exitCode || newWeb.exitCode)
  throw new Error("Cannot capture consumer source inventory.");
const files = [
  ...new Set([
    ...sourceFiles,
    ...retirement.paths,
    ...[changedWeb, newWeb].flatMap((result) =>
      result.stdout.toString().trim().split("\n").filter(Boolean),
    ),
  ]),
]
  .sort()
  .map((path) => {
    if (existsSync(join(root, path)))
      return { path, state: "present", sha256: digest(join(root, path)) };
    if (!retirement.paths.includes(path)) throw new Error(`Missing captured source: ${path}`);
    const original = Bun.spawnSync(["git", "show", `${retirement.revision}:${path}`], {
      cwd: root,
    });
    if (original.exitCode) throw new Error(`Cannot recover retired source: ${path}`);
    return {
      path,
      state: "retired",
      baseline_sha256: createHash("sha256").update(original.stdout).digest("hex"),
    };
  });
const executables = [
  "codex-acp",
  "codex",
  "claude-agent-acp",
  "opencode",
  "pi-acp",
  "openma-pi-acp",
].map((name) => {
  const path = realpathSync(join(runtime, ".bin", name));
  return { name, path: relative(root, path), sha256: digest(path) };
});
console.log(
  JSON.stringify(
    {
      timestamp: new Date().toISOString(),
      source_commit: Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root })
        .stdout.toString()
        .trim(),
      source_state: "working_tree",
      platform: process.platform,
      arch: process.arch,
      bun: Bun.version,
      sdk: "2.7.0",
      protocol: 1,
      packages,
      executables,
      files,
    },
    null,
    2,
  ),
);
