import { strict as assert } from "node:assert";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const state = mkdtempSync(join(tmpdir(), "ngertiin-broker-http-"));
const results: { check: string; status: string; detail?: unknown }[] = [];
let child: ReturnType<typeof Bun.spawn> | undefined;
let base = "";
let token = "";
async function bounded<T>(operation: Promise<T>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("HTTP probe timed out.")), 10000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function start() {
  child = Bun.spawn([process.execPath, "apps/server/src/main.ts"], {
    env: {
      PATH: process.env.PATH,
      APP_ENV: "development",
      NGERTIIN_STATE_DIR: state,
      NGERTIIN_PORT: "0",
    },
    stdout: "pipe",
    stderr: "ignore",
  });
  const reader = (child.stdout as ReadableStream<Uint8Array>).getReader();
  let line = "";
  try {
    while (!line.includes("\n")) {
      const next = await bounded(reader.read());
      assert.equal(next.done, false);
      line += new TextDecoder().decode(next.value);
    }
    const event = JSON.parse(line.split("\n")[0]);
    assert.equal(event.event, "foundation.started");
    base = event.url;
    token = JSON.parse(readFileSync(join(state, "installation.json"), "utf8")).token;
  } finally {
    reader.releaseLock();
  }
}
async function stop() {
  if (child) {
    child.kill("SIGTERM");
    assert.equal(await bounded(child.exited), 0);
    child = undefined;
  }
}
async function request(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await bounded(
    fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": key,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  assert.equal(response.status, 200);
  return response.json();
}
try {
  await start();
  const available = await request("/v1/harnesses");
  assert.deepEqual(
    available.map((row: { harness: string }) => row.harness),
    ["codex", "muse"],
  );
  for (const row of available) {
    assert.ok(["supported", "too_old", "missing", "unknown", "probe_failed"].includes(row.state));
    assert.ok(row.manifest.minimum_version);
  }
  results.push({
    check: "host_executable_detection",
    status: "pass",
    detail: available.map((row: { harness: string; state: string; version: string | null }) => ({
      harness: row.harness,
      state: row.state,
      version: row.version,
    })),
  });
  const contracts = await request("/v1/harness/contracts");
  assert.equal(contracts.capabilities.properties.resume.enum.includes("unknown"), true);
  const readiness = await request("/health/ready");
  assert.equal(readiness.registered_executors, 0);
  assert.equal(readiness.api_readiness_gate, "pending");
  results.push({ check: "broker_contract_without_implicit_native_executor", status: "pass" });
  const command = crypto.randomUUID();
  const input = {
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  };
  const plan = await request("/v1/connections", input, command);
  assert.deepEqual(await request("/v1/connections", input, command), plan);
  const key = await request("/v1/connections", {
    harness: "muse",
    authentication: {
      method: "api_key",
      billing_source: "api_key",
      credential_ref: crypto.randomUUID(),
    },
  });
  assert.equal(plan.login, "unknown");
  assert.equal(key.inference, "not_attempted");
  assert.notEqual(plan.id, key.id);
  results.push({ check: "connection_selection_and_idempotent_receipt", status: "pass" });
  const revoked = await request(`/v1/connections/${plan.id}/revoke`, {});
  assert.equal(revoked.state, "revoked");
  assert.equal(revoked.grant_revision, plan.grant_revision + 1);
  results.push({ check: "durable_connection_revocation", status: "pass" });
  await stop();
  await start();
  const saved = await request("/v1/entities/connection");
  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved.find((row: { id: string }) => row.id === plan.id),
    revoked,
  );
  const events = await request("/v1/events");
  assert.equal(events.events.length, 3);
  results.push({ check: "connection_and_event_replay_after_process_restart", status: "pass" });
  await stop();
  console.log(
    JSON.stringify(
      {
        runtime: `bun@${Bun.version}`,
        planned: 5,
        pass: results.length,
        fail: 0,
        skip: 0,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  if (child) {
    child.kill("SIGKILL");
    await child.exited;
  }
  rmSync(state, { recursive: true, force: true });
}
