import { strict as assert } from "node:assert";
import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const state = mkdtempSync(join(tmpdir(), "ngertiin-process-proof-"));
const children = new Set<ChildProcess>();
async function end(child: ChildProcess, signal: "SIGTERM" | "SIGKILL") {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  process.kill(-(child.pid ?? 0), signal);
  await exited;
  // `make` can exit before its Bun descendants finish graceful cleanup.
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      process.kill(-(child.pid ?? 0), 0);
    } catch {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Development process group did not shut down");
}
async function start() {
  const child = spawn("make", ["dev"], {
    cwd: root,
    detached: true,
    env: { ...process.env, APP_ENV: "development", NGERTIIN_STATE_DIR: state, NGERTIIN_PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  const url = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Foundation startup timed out")), 15_000);
    child.once("error", reject);
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Foundation exited before startup"));
    });
    child.stderr?.resume();
    const lines = createInterface({ input: child.stdout ?? process.stdin });
    lines.on("line", (line) => {
      const content = line.slice(line.indexOf("{"));
      if (!content.startsWith("{")) return;
      const event = JSON.parse(content);
      if (event.event === "foundation.started") {
        clearTimeout(timer);
        resolve(event.url);
      }
    });
  });
  return { child, url };
}
let token = "";
async function api(url: string, path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  assert.equal(response.status, 200, `HTTP ${path}`);
  return response.json();
}
const checks: string[] = [];
try {
  const first = await start();
  const installation = JSON.parse(readFileSync(join(state, "installation.json"), "utf8"));
  token = installation.token;
  const ready = await api(first.url, "/health/ready");
  assert.equal(ready.registered_executors, 1);
  assert.equal(ready.api_readiness_gate, "pending");
  checks.push("make_dev_boots_without_hermes_postgres_or_provider_keys");
  const agent = await api(first.url, "/v1/agents", {
    name: "Process proof",
    harness: "codex",
    connection_id: crypto.randomUUID(),
  });
  const thread = await api(first.url, "/v1/threads", { type: "dm", member_agent_ids: [agent.id] });
  const key = crypto.randomUUID();
  const input = {
    thread_id: thread.id,
    agent_id: agent.id,
    text: "Preserve this message after SIGKILL.",
  };
  const admitted = await api(first.url, "/v1/runs", input, key);
  assert.deepEqual(await api(first.url, "/v1/runs", input, key), admitted);
  checks.push("http_idempotent_admission");
  await api(first.url, "/v1/routines", {
    thread_id: thread.id,
    agent_id: agent.id,
    instruction: "Inspect after tab closure",
    schedule: { type: "once", at: new Date().toISOString() },
    timezone: "UTC",
  });
  const deadline = Date.now() + 5000;
  while ((await api(first.url, "/v1/entities/occurrence")).length === 0) {
    assert.ok(Date.now() < deadline, "Background scheduler did not fire");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const occurrences = await api(first.url, "/v1/entities/occurrence");
  assert.equal(occurrences.length, 1);
  checks.push("background_scheduler_runs_without_a_browser");
  const page = await api(first.url, "/v1/events?limit=1");
  const remaining = await api(first.url, `/v1/events?after=${page.next_cursor}`);
  assert.ok(remaining.events.every((event: { cursor: number }) => event.cursor > page.next_cursor));
  checks.push("http_event_cursor_replay");
  const contender = spawn(process.execPath, ["apps/server/src/main.ts"], {
    cwd: root,
    env: { ...process.env, APP_ENV: "development", NGERTIIN_STATE_DIR: state, NGERTIIN_PORT: "0" },
    stdio: "ignore",
  });
  children.add(contender);
  const contenderExit = await new Promise<number | null>((resolve) =>
    contender.once("exit", resolve),
  );
  assert.notEqual(contenderExit, 0);
  checks.push("second_authority_rejected");
  await end(first.child, "SIGKILL");
  const second = await start();
  assert.deepEqual(
    JSON.parse(readFileSync(join(state, "installation.json"), "utf8")),
    installation,
  );
  assert.deepEqual(await api(second.url, "/v1/runs", input, key), admitted);
  assert.equal((await api(second.url, `/v1/entities/run/${admitted.run.id}`)).status, "queued");
  assert.deepEqual(await api(second.url, "/v1/entities/occurrence"), occurrences);
  checks.push("sigkill_restart_preserves_identity_receipts_and_schedule_dedup");
  await end(second.child, "SIGTERM");
  checks.push("graceful_shutdown");
  // Fault fixture: persist a native-accepted dispatch, then kill that process without cleanup.
  const fault = spawn(
    process.execPath,
    [
      "-e",
      `
    import { Store } from './apps/server/src/store';
    import { Lifecycle } from './apps/server/src/lifecycle';
    const store = new Store(process.env.NGERTIIN_PROBE_DB, process.env.NGERTIIN_PROBE_OWNER);
    const lifecycle = new Lifecycle(store);
    lifecycle.bind(process.env.NGERTIIN_PROBE_THREAD, process.env.NGERTIIN_PROBE_AGENT, 'fault-fixture-session');
    const run = lifecycle.claimNext(process.env.NGERTIIN_PROBE_THREAD, process.env.NGERTIIN_PROBE_AGENT);
    lifecycle.started(run.id, run.dispatch_token);
    console.log(JSON.stringify({ run_id: run.id }));
    setInterval(() => {}, 1000);
  `,
    ],
    {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        NGERTIIN_PROBE_DB: join(state, "ngertiin.sqlite"),
        NGERTIIN_PROBE_OWNER: installation.owner_id,
        NGERTIIN_PROBE_THREAD: thread.id,
        NGERTIIN_PROBE_AGENT: agent.id,
      },
      stdio: ["ignore", "pipe", "ignore"],
    },
  );
  children.add(fault);
  const runningId = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Fault fixture timed out")), 5000);
    const lines = createInterface({ input: fault.stdout ?? process.stdin });
    lines.once("line", (line) => {
      clearTimeout(timeout);
      resolve(JSON.parse(line).run_id);
    });
  });
  await end(fault, "SIGKILL");
  const third = await start();
  const orphan = await api(third.url, `/v1/entities/run/${runningId}`);
  assert.equal(orphan.status, "unknown");
  assert.equal(orphan.outcome, "unknown");
  await end(third.child, "SIGTERM");
  const finalStore = new Store(join(state, "ngertiin.sqlite"), installation.owner_id);
  const finalLifecycle = new Lifecycle(finalStore);
  assert.equal(finalLifecycle.claimNext(thread.id, agent.id), null);
  finalStore.close();
  checks.push("sigkill_native_acceptance_fixture_becomes_unknown_and_blocks_replay");
  console.log(
    JSON.stringify(
      {
        runtime: `bun@${Bun.version}`,
        evidence_level: "local_process_and_http_with_controlled_dispatch_fault",
        planned: 8,
        pass: checks.length,
        fail: 0,
        skip: 0,
        checks,
      },
      null,
      2,
    ),
  );
} finally {
  for (const child of children) await end(child, "SIGKILL");
  rmSync(state, { recursive: true, force: true });
}
