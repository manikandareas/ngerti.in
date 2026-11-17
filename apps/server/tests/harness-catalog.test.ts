import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertScopedCatalog } from "../src/harness/catalog-policy";
import { CodexAuthorityRpc } from "../src/harness/codex/authority-rpc";
import { type LaunchContext, Redactor } from "../src/harness/context";
import { MuseTransport } from "../src/harness/muse/transport";

test("both native adapters reject private or project MCP configuration before starting a process", () => {
  const root = mkdtempSync(join(tmpdir(), "ngertiin-catalog-"));
  const home = join(root, "home");
  const codex = join(root, "codex");
  const workspace = join(root, "workspace");
  for (const dir of [home, codex, workspace]) mkdirSync(dir, { recursive: true });
  const context: LaunchContext = {
    scoped: true,
    env: { HOME: home, CODEX_HOME: codex },
    state_directory: root,
    redactor: new Redactor(),
    workspace: { id: crypto.randomUUID(), root: workspace, revision: 1 },
  };
  try {
    expect(() => assertScopedCatalog(context)).not.toThrow();
    const file = join(workspace, ".mcp.json");
    writeFileSync(
      file,
      JSON.stringify({ mcpServers: { foreign: { command: "must-never-start" } } }),
    );
    expect(() => new CodexAuthorityRpc("must-never-start", context)).toThrow(
      "CAPABILITY_UNSUPPORTED",
    );
    expect(() => new MuseTransport("must-never-start", context)).toThrow("CAPABILITY_UNSUPPORTED");
    rmSync(file);
    writeFileSync(
      join(codex, "config.toml"),
      '[mcp_servers.foreign]\ncommand="must-never-start"\n',
    );
    expect(() => assertScopedCatalog(context)).toThrow("CAPABILITY_UNSUPPORTED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
