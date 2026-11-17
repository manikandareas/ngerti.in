import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { CONTRACT_VERSION } from "../../../apps/server/src/contracts";

/** Capture source hashes only; private installation/provider configuration is excluded. */
export async function captureSource() {
  const root = resolve(import.meta.dir, "../../..");
  const paths = [
    "package.json",
    "apps/server/package.json",
    "bun.lock",
    ...[
      "config",
      "contracts",
      "cua",
      "desktop",
      "domain-runtime",
      "domains",
      "operations",
      "processes",
      "service",
      "setup-domains",
      "tools",
      "view",
      "view-gateway",
    ].map((name) => `apps/server/src/machines/${name}.ts`),
    ...[
      "api.ts",
      "api-contract.ts",
      "api/http.ts",
      "api/machines.ts",
      "auth/service.ts",
      "contracts.ts",
      "contracts/errors.ts",
      "main.ts",
      "organizations/data.ts",
      "persistence/access-context.ts",
      "persistence/execution-schema.ts",
      "store.ts",
      "artifacts.ts",
      "workspaces/service.ts",
      "workspaces/tools.ts",
      "harness/tools.ts",
      "harness/instructions.ts",
      "harness/context.ts",
      "harness/product-tool-contracts.ts",
      "harness/acp/connection.ts",
      "harness/acp/session.ts",
      "harness/codex/authority-rpc.ts",
      "harness/codex/workspace-policy.ts",
      "harness/muse/transport.ts",
    ].map((name) => `apps/server/src/${name}`),
    ...["ngertiin-browser.desktop", "chromium-policy.json", "start-browser.sh", "compose.yaml"].map(
      (name) => `infra/machine/${name}`,
    ),
    ...["evidence.ts", "native.test.ts", "harnesses.test.ts", "contract.test.ts"].map(
      (name) => `scripts/verification/nma076/${name}`,
    ),
  ];
  const git = Bun.spawn(["git", "rev-parse", "HEAD"], {
    cwd: root,
    stdout: "pipe",
    stderr: "ignore",
  });
  const baseline = (await new Response(git.stdout).text()).trim();
  if (await git.exited) throw new Error("Source baseline capture failed.");
  return {
    baseline,
    contract_version: CONTRACT_VERSION,
    bun: Bun.version,
    files: Object.fromEntries(
      await Promise.all(
        paths.map(async (path) => [
          path,
          createHash("sha256")
            .update(Buffer.from(await Bun.file(resolve(root, path)).arrayBuffer()))
            .digest("hex"),
        ]),
      ),
    ),
  };
}
