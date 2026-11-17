import { join } from "node:path";
import { AcpAdapter } from "../src/harness/acp/adapter";

/** Protocol fixture injection only; production always uses the pinned profile launch. */
export function codexFixture(endpoint: () => string) {
  return new AcpAdapter("codex", endpoint, {
    launch: async (_harness, context) => ({
      executable: process.execPath,
      args: [join(import.meta.dir, "fixtures/codex-acp.ts")],
      context,
      metadata: {},
      instruction_route: "system_prompt",
      adapter_version: "2.6.0",
      runtime_version: "0.169.0",
    }),
  });
}
