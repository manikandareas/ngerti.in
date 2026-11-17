import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AcpConnection } from "../../../apps/server/src/harness/acp/connection";
import { AcpSession } from "../../../apps/server/src/harness/acp/session";
import { Redactor } from "../../../apps/server/src/harness/context";
import { SessionTools } from "../../../apps/server/src/harness/session-tools";

// Two real peers exercise the shared module without provider credentials or inference.
const binaries = resolve(process.argv[2] ?? "scripts/verification/acp/runtime/node_modules/.bin");
const results: unknown[] = [];
for (const [profile, executable, args] of [
  ["claude", "claude-agent-acp", []],
  ["opencode", "opencode", ["acp"]],
] as const) {
  const state = mkdtempSync(join(tmpdir(), "ngertiin-acp-sessions-"));
  const home = join(state, "home");
  const workspace = join(state, "workspace");
  for (const path of [home, workspace]) mkdirSync(path, { recursive: true, mode: 0o700 });
  const row: Record<string, unknown> = {
    profile,
    inference: "not_attempted",
    useful_tool: "not_attempted",
  };
  let current: AcpSession | undefined;
  async function connect() {
    const tools = new SessionTools(() => "http://127.0.0.1:1");
    const redactor = new Redactor();
    let session: AcpSession | undefined;
    const connection = new AcpConnection(
      join(binaries, executable),
      [...args],
      {
        state_directory: state,
        redactor,
        env: {
          HOME: home,
          USERPROFILE: home,
          PATH: `${binaries}:${process.env.PATH ?? "/usr/bin:/bin"}`,
          CLAUDE_CONFIG_DIR: join(home, ".claude"),
          XDG_CONFIG_HOME: join(home, ".config"),
          XDG_DATA_HOME: join(home, ".local/share"),
          XDG_CACHE_HOME: join(home, ".cache"),
          XDG_STATE_HOME: join(home, ".local/state"),
          NO_BROWSER: "1",
          LANG: "C",
        },
      },
      {
        update: async (update) => {
          await session?.update(update);
        },
        permission: async (request, signal) =>
          session ? session.permission(request, signal) : { outcome: { outcome: "cancelled" } },
      },
    );
    try {
      const init = await connection.bounded(
        connection.agent.request("initialize", { protocolVersion: 1, clientCapabilities: {} }),
      );
      row.agent = init.agentInfo;
      session = new AcpSession(connection, tools, init, redactor, workspace, "");
      return session;
    } catch (error) {
      await connection.close();
      await tools.close();
      throw error;
    }
  }
  try {
    current = await connect();
    const identity = await current.open();
    row.new_session = "pass";
    const models = current.models();
    row.model_count = models.length;
    const chosen = models[1] ?? models[0];
    if (!chosen) throw new Error("No advertised model.");
    await current.configure(identity, { model_id: chosen.id, reasoning: null });
    row.model_selection = "pass";
    const oldGeneration = current.connection.generation;
    const oldToken = current.tools.token;
    await current.close();
    current = await connect();
    row.fresh_process = oldGeneration !== current.connection.generation;
    row.fresh_tools = oldToken !== current.tools.token;
    await current.open(identity);
    row.explicit_reload = "pass";
  } catch (error) {
    row.error_code =
      error && typeof error === "object" && "code" in error ? error.code : "operation_failed";
    row.remaining = "unverified";
  } finally {
    await current?.close();
    rmSync(state, { recursive: true, force: true });
  }
  results.push(row);
}
console.log(
  JSON.stringify(
    { timestamp: new Date().toISOString(), sdk: "2.7.0", protocol: 1, results },
    null,
    2,
  ),
);
