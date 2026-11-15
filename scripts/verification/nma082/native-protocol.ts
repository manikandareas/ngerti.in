import { randomUUID } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { Redactor } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";

if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
process.umask(0o077);
const results: {
  harness: string;
  status: string;
  login?: string;
  code?: string;
  diagnostic?: string;
}[] = [];
for (const adapter of [
  new CodexAdapter(() => "http://127.0.0.1:8000/v1/harness/tools"),
  new MuseAdapter(() => "http://127.0.0.1:8000/v1/harness/tools"),
]) {
  const directory = mkdtempSync(`/srv/ngertiin/${adapter.harness}-protocol-`);
  for (const child of [".codex", ".config", ".cache", ".local/share", "workspace", "tmp"])
    mkdirSync(join(directory, child), { recursive: true, mode: 0o700 });
  let client: Awaited<ReturnType<typeof adapter.connect>> | undefined;
  try {
    client = await adapter.connect({
      executable: `/opt/ngertiin/bin/${adapter.harness}`,
      connection_id: randomUUID(),
      agent_id: randomUUID(),
      thread_id: randomUUID(),
      state_directory: directory,
      redactor: new Redactor(),
      ephemeralAuth: true,
      env: {
        PATH: "/opt/ngertiin/bin:/usr/bin:/bin",
        LANG: "C.UTF-8",
        HOME: directory,
        CODEX_HOME: join(directory, ".codex"),
        TMPDIR: join(directory, "tmp"),
        XDG_CONFIG_HOME: join(directory, ".config"),
        XDG_CACHE_HOME: join(directory, ".cache"),
        XDG_DATA_HOME: join(directory, ".local/share"),
      },
      workspace: { id: randomUUID(), revision: 1, root: join(directory, "workspace") },
      machine: { id: randomUUID(), root: "/home/cua/workspace" },
      signal: AbortSignal.timeout(25000),
    });
    const inspection = await client.inspect();
    if (inspection.login === "authenticated")
      throw new Error("A private empty native home unexpectedly acquired credentials.");
    results.push({ harness: adapter.harness, status: "pass", login: inspection.login });
  } catch (error) {
    const code =
      error &&
      typeof error === "object" &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z_]+$/.test(error.code)
        ? error.code
        : "PROTOCOL_PROBE_FAILED";
    results.push({
      harness: adapter.harness,
      status: "fail",
      code,
      diagnostic:
        error instanceof Error
          ? error.message.replaceAll(directory, "<private-probe>").slice(0, 1000)
          : "Unknown native protocol failure.",
    });
  } finally {
    await client?.close();
    rmSync(directory, { recursive: true, force: true });
  }
}
const report = {
  pass: results.filter((result) => result.status === "pass").length,
  fail: results.filter((result) => result.status === "fail").length,
  results,
  boundary:
    "Actual adapters initialize, inspect unauthenticated native state and close on Linux. No provider credentials, login, inference, billing or useful product tools are claimed.",
};
writeFileSync("/srv/ngertiin/native-protocol-report.json", JSON.stringify(report, null, 2), {
  mode: 0o600,
});
console.log(JSON.stringify(report));
if (report.fail) process.exitCode = 1;
