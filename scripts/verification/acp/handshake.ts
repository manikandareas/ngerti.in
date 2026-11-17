import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AcpConnection } from "../../../apps/server/src/harness/acp/connection";
import { Redactor } from "../../../apps/server/src/harness/context";

// No host credentials/settings are inherited. This probe never sends a model prompt.
const directory = resolve(process.argv[2] ?? "scripts/verification/acp/runtime/node_modules/.bin");
const results: unknown[] = [];
for (const [profile, binary, args] of [
  ["codex", "codex-acp", []],
  ["claude", "claude-agent-acp", []],
  ["opencode", "opencode", ["acp"]],
  ["pi-upstream", "pi-acp", []],
  ["pi-openma", "openma-pi-acp", []],
] as const) {
  const state = mkdtempSync(join(tmpdir(), "ngertiin-acp-handshake-"));
  const home = join(state, "home");
  for (const path of [
    home,
    join(home, ".codex"),
    join(home, ".config"),
    join(home, ".local/share"),
    join(state, "workspace"),
  ])
    mkdirSync(path, { recursive: true, mode: 0o700 });
  let peer: AcpConnection | undefined;
  const row: Record<string, unknown> = {
    profile,
    inference: "not_attempted",
    login: "not_attempted",
  };
  try {
    const executable = realpathSync(join(directory, binary));
    row.executable_sha256 = createHash("sha256").update(readFileSync(executable)).digest("hex");
    peer = new AcpConnection(
      executable,
      [...args],
      {
        state_directory: state,
        redactor: new Redactor(),
        env: {
          PATH: `${directory}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          HOME: home,
          USERPROFILE: home,
          CODEX_HOME: join(home, ".codex"),
          CLAUDE_CONFIG_DIR: join(home, ".claude"),
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_DATA_HOME: join(home, ".local/share"),
          XDG_CACHE_HOME: join(home, ".cache"),
          XDG_STATE_HOME: join(home, ".local/state"),
          PI_CODING_AGENT_DIR: join(home, ".pi/agent"),
          NO_BROWSER: "1",
          LANG: "C",
        },
      },
      { update: async () => {}, permission: async () => ({ outcome: { outcome: "cancelled" } }) },
    );
    const initialized = await peer.bounded(
      peer.agent.request("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "ngertiin-handshake", version: "1.0.0" },
        clientCapabilities: {},
      }),
      15_000,
    );
    row.handshake = initialized.protocolVersion === 1 ? "pass" : "fail";
    row.agent = initialized.agentInfo;
    row.capabilities = initialized.agentCapabilities;
    row.auth_methods = initialized.authMethods?.map((method) => method.id);
    try {
      const session = await peer.bounded(
        peer.agent.request("session/new", {
          cwd: join(state, "workspace"),
          mcpServers: [],
        }),
        15_000,
      );
      row.session = "pass";
      row.config_categories = session.configOptions?.map((option) => option.category ?? option.id);
    } catch (error) {
      row.session = "rejected";
      row.session_error_code =
        error && typeof error === "object" && "code" in error ? error.code : "transport_error";
    }
  } catch {
    row.handshake = "fail";
  } finally {
    await peer?.close();
    rmSync(state, { recursive: true, force: true });
  }
  results.push(row);
}
const output = { timestamp: new Date().toISOString(), sdk: "2.7.0", protocol: 1, results };
console.log(JSON.stringify(output, null, 2));
