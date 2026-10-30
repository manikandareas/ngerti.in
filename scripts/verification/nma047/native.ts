import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { spawnMspConnection } from "@muse-code/sdk";

const directory = fileURLToPath(new URL(".", import.meta.url));
async function bounded<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("SDK fixture timed out")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
const codex = Bun.which("codex");
const results: Record<string, unknown>[] = [];
const cleanEnv = Object.fromEntries(
  ["PATH", "HOME", "TMPDIR", "SYSTEMROOT"].flatMap((key) =>
    process.env[key] ? [[key, process.env[key]]] : [],
  ),
);
if (codex) {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-codex-compat-"));
  const version = (await Bun.$`${codex} --version`.text()).trim();
  const child = spawn(codex, ["app-server", "--listen", "stdio://"], {
    env: { ...cleanEnv, CODEX_HOME: home },
    stdio: ["pipe", "pipe", "ignore"],
  });
  try {
    const response = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Codex initialize timed out")), 15_000);
      const lines = createInterface({ input: child.stdout });
      child.once("error", reject);
      child.once("exit", () => {
        clearTimeout(timer);
        reject(new Error("Codex exited before initialize"));
      });
      lines.on("line", (line) => {
        const frame = JSON.parse(line);
        if (frame.id === 1) {
          clearTimeout(timer);
          lines.close();
          frame.error ? reject(new Error("Codex initialize rejected")) : resolve(frame.result);
        }
      });
      child.stdin.write(
        `${JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "ngertiin_compat", version: "1.0.0" } } })}\n`,
      );
    });
    assert.equal(typeof response.userAgent, "string");
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    results.push({
      check: "codex_app_server_initialize",
      status: "pass",
      version,
      evidence_level: "native_protocol_handshake",
      login: "not_attempted",
      inference: "not_attempted",
      billing: "not_verified",
    });
  } finally {
    child.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      if (child.exitCode !== null) resolve();
      else child.once("exit", () => resolve());
    });
    rmSync(home, { recursive: true, force: true });
  }
} else
  results.push({
    check: "codex_app_server_initialize",
    status: "skip",
    reason: "Executable missing",
  });

const handshake = spawnMspConnection({
  command: process.execPath,
  args: [join(directory, "msp-fixture.ts")],
  env: cleanEnv,
  shutdownTimeoutMs: 1000,
});
try {
  const host = await bounded(
    handshake.initialize({ clientInfo: { name: "ngertiin_compat", version: "1.0.0" } }),
  );
  assert.equal(host.initializeResult.schema.version, 1);
  assert.equal(host.fingerprintWarning, undefined);
  assert.deepEqual(
    await bounded(host.connection.request("fixture/echo", { text: "SDK round trip" })),
    { text: "SDK round trip" },
  );
  results.push({
    check: "muse_sdk_spawn_and_round_trip",
    status: "pass",
    sdk: "@muse-code/sdk@1.4.12",
    host: "protocol_fixture",
    evidence_level: "contract_fixture",
    native_muse_cli: "not_tested",
    login: "not_attempted",
    inference: "not_attempted",
    billing: "not_verified",
  });
  await host.close();
} finally {
  await handshake.close();
}
console.log(JSON.stringify({ runtime: `bun@${Bun.version}`, planned: 2, results }, null, 2));
