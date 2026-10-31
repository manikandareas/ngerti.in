import assert from "node:assert/strict";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Entity } from "../../../apps/server/src/contracts";

const base = "http://127.0.0.1:49959";
const state = ".dev/nma049-native";
const privatePath = ".dev/nma060/cancellation-proof.json";
const output = "docs/verification/nma-060/cancellation";
const phase = process.argv[2];
type Family = "codex" | "muse";
type Lane = {
  connection_id: string;
  agent_id: string;
  thread_id: string;
  credential_ref?: string;
  run?: {
    command_id: string;
    text: string;
    id?: string;
    steer_key?: string;
    steer_text?: string;
    steer?: unknown;
  };
};
const proof = (
  (await Bun.file(privatePath).exists()) ? await Bun.file(privatePath).json() : { lanes: {} }
) as { lanes: Partial<Record<Family, Lane>>; credential_ref?: string; muse_connection?: string };
const { token } = await Bun.file(join(state, "installation.json")).json();
const report: Record<string, unknown> = {
  phase,
  captured_at: new Date().toISOString(),
  evidence_level: "native_via_application_http",
  checks: [],
};
const checks: string[] = [];
async function save() {
  await Bun.write(privatePath, `${JSON.stringify(proof, null, 2)}\n`);
  await Bun.write(
    `${output}/native-${phase}.json`,
    `${JSON.stringify({ ...report, checks }, null, 2)}\n`,
  );
}
async function api(path: string, body?: unknown, key: string = crypto.randomUUID()) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  const value = await response.json();
  assert.equal(response.status, 200, `${path}: ${value.error?.code ?? response.status}`);
  return value;
}
try {
  if (phase === "provision") {
    assert.equal(
      Object.keys(proof.lanes).length,
      0,
      "Proof already provisioned; do not create replacement identities.",
    );
    const connections = (await api("/v1/entities/connection")) as Entity<"connection">[];
    const codex = connections.find(
      (c) =>
        c.harness === "codex" &&
        c.state === "active" &&
        c.authentication.billing_source === "subscription" &&
        c.login === "authenticated",
    );
    assert(codex);
    const key = process.env.MUSE_API_KEY;
    assert(key, "Explicit developer-credit Muse key is unavailable.");
    proof.credential_ref = crypto.randomUUID();
    mkdirSync(join(state, "credentials"), { recursive: true, mode: 0o700 });
    writeFileSync(join(state, "credentials", proof.credential_ref), key, {
      flag: "wx",
      mode: 0o600,
    });
    chmodSync(join(state, "credentials", proof.credential_ref), 0o600);
    await save();
    const muse = (await api("/v1/connections", {
      harness: "muse",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: proof.credential_ref,
      },
    })) as Entity<"connection">;
    proof.muse_connection = muse.id;
    await save();
    const configurations = [];
    for (const [family, connection, model] of [
      ["codex", codex, "gpt-6.1-sol"],
      ["muse", muse, "muse-spark-1.3"],
    ] as const) {
      const inspected = await api(`/v1/connections/${connection.id}/inspect`, {});
      assert.equal(
        inspected.effective_billing_source,
        family === "codex" ? "subscription" : "api_key",
      );
      assert(inspected.models.some((entry: { id: string }) => entry.id === model));
      const agent = await api("/v1/agents", {
        name: `Cancellation proof ${family}`,
        harness: family,
        connection_id: connection.id,
        model_id: model,
        reasoning: "medium",
        instructions:
          "This is an isolated one-time cancellation verification. Do not create or change goals, Routine, skills, memory, browser profiles or external applications. Use only the specifically requested control checks. Interpret the user's cancellation from context and use your scoped control tool; do not claim a native stop from your own prose.",
      });
      const thread = await api(`/v1/agents/${agent.id}/dm`, {});
      proof.lanes[family] = {
        connection_id: connection.id,
        agent_id: agent.id,
        thread_id: thread.id,
        ...(family === "muse" ? { credential_ref: proof.credential_ref } : {}),
      };
      await save();
      configurations.push({
        harness: family,
        model,
        connection_id: connection.id,
        auth_method: inspected.authentication.method,
        billing: inspected.effective_billing_source,
        model_count: inspected.models.length,
        capabilities: inspected.capabilities,
      });
    }
    report.configurations = configurations;
    checks.push(
      "selected_codex_subscription_and_muse_developer_credit_connections_in_existing_owner",
    );
  } else if (phase === "codex" || phase === "muse") {
    const lane = proof.lanes[phase];
    assert(lane);
    await api(`/v1/threads/${lane.thread_id}/sessions`, { agent_id: lane.agent_id });
    lane.run ??= {
      command_id: crypto.randomUUID(),
      text:
        phase === "codex"
          ? "Run the single harmless native shell command `sleep 15` in your authorized workspace for a cancellation control check. Do not call any product tools first. After it finishes, describe briefly what you observed. No file changes, background jobs or external operations."
          : 'The user now says "gajadi deh" about the current work. Interpret this correction in context and use the appropriate scoped tool to stop only this run. Leave goals and Routine active; do no other work.',
    };
    await save();
    const admitted = await api(
      "/v1/runs",
      { agent_id: lane.agent_id, thread_id: lane.thread_id, text: lane.run.text },
      lane.run.command_id,
    );
    lane.run.id = admitted.run.id;
    await save();
    const began = Date.now(),
      deadline = began + 180000;
    let current = admitted.run as Entity<"run">;
    while (Date.now() < deadline) {
      current = await api(`/v1/entities/run/${lane.run.id}`);
      report.run = current;
      if (
        phase === "codex" &&
        current.status === "running" &&
        current.native_run_id &&
        current.native_tools.some((t) => t.name === "commandExecution") &&
        !lane.run.steer
      ) {
        lane.run.steer_key ??= crypto.randomUUID();
        lane.run.steer_text ??=
          'The user now says "gajadi deh" about the current work. Interpret this correction in context and use the appropriate scoped tool to stop only this run. Leave goals and Routine active; do no other work.';
        await save();
        lane.run.steer = await api(
          `/v1/runs/${current.id}/steer`,
          { text: lane.run.steer_text, expected_native_run_id: current.native_run_id },
          lane.run.steer_key,
        );
        report.steer = lane.run.steer;
        await save();
      }
      if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) break;
      await Bun.sleep(250);
    }
    report.elapsed_ms = Date.now() - began;
    await save();
    assert(
      current.product_tools.includes("ngertiin.cancel_run"),
      "Native agent did not invoke the cancellation tool.",
    );
    assert.notEqual(current.cancellation, "none");
    assert(
      ["cancelled", "succeeded"].includes(current.status),
      `Retain unresolved/native failure: ${current.status}`,
    );
    if (current.status === "cancelled") assert.equal(current.cancellation, "confirmed");
    report.native_terminal = current.status;
    checks.push("natural_language_cancellation_triggered_scoped_native_product_tool");
    if (phase === "codex") {
      assert(lane.run.steer);
      checks.push("native_steering_delivered_correction_during_active_shell_work");
    }
    const cursor = (await api(`/v1/threads/${lane.thread_id}/snapshot`)).cursor;
    const replay = await api(
      "/v1/runs",
      { agent_id: lane.agent_id, thread_id: lane.thread_id, text: lane.run.text },
      lane.run.command_id,
    );
    assert.equal(replay.run.id, current.id);
    assert.equal((await api(`/v1/threads/${lane.thread_id}/snapshot`)).cursor, cursor);
    checks.push("original_admission_receipt_retry_does_not_repeat_native_run");
  } else if (phase === "cleanup") {
    const agents = new Set(Object.values(proof.lanes).map((lane) => lane.agent_id));
    const runs = ((await api("/v1/entities/run")) as Entity<"run">[]).filter((r) =>
      agents.has(r.agent_id),
    );
    for (const run of runs)
      if (["queued", "dispatching", "running", "cancel_requested"].includes(run.status))
        await api(`/v1/runs/${run.id}/cancel`, {});
    const goals = ((await api("/v1/entities/goal")) as Entity<"goal">[]).filter((g) =>
      agents.has(g.agent_id),
    );
    const routines = ((await api("/v1/entities/routine")) as Entity<"routine">[]).filter((r) =>
      agents.has(r.agent_id),
    );
    for (const goal of goals)
      if (["active", "paused"].includes(goal.state))
        await api(`/v1/goals/${goal.id}/control`, { state: "stopped" });
    for (const routine of routines)
      if (routine.state !== "stopped")
        await api(`/v1/routines/${routine.id}/control`, {
          expected_revision: routine.revision,
          state: "stopped",
        });
    if (proof.muse_connection) await api(`/v1/connections/${proof.muse_connection}/revoke`, {});
    if (proof.credential_ref)
      rmSync(join(state, "credentials", proof.credential_ref), { force: true });
    report.runs = runs.map((r) => ({ id: r.id, status: r.status, cancellation: r.cancellation }));
    report.goals = goals.length;
    report.routines = routines.length;
    checks.push("proof_connection_revoked_and_only_task_credential_copy_removed");
    assert.equal(
      goals.length,
      0,
      "Unexpected proof responsibility was stopped but remains an acceptance failure.",
    );
    assert.equal(
      routines.length,
      0,
      "Unexpected proof schedule was stopped but remains an acceptance failure.",
    );
    assert(
      runs.every(
        (run) => !["queued", "dispatching", "running", "cancel_requested"].includes(run.status),
      ),
    );
    const codex = proof.lanes.codex;
    assert(codex);
    const original = await api(`/v1/entities/connection/${codex.connection_id}`);
    assert.equal(original.state, "active");
    assert.equal(original.authentication.billing_source, "subscription");
    const retained = await Bun.file("docs/verification/nma-059/receipts-cleanup.json").json();
    const unknowns = retained.effects.filter(
      (effect: { state: string }) => effect.state === "unknown",
    );
    assert.equal(unknowns.length, 2);
    for (const previous of unknowns) {
      const current = await api(`/v1/entities/app_effect/${previous.id}`);
      assert.equal(current.state, "unknown");
      assert.equal(current.fingerprint, previous.fingerprint);
    }
    checks.push("original_subscription_connection_and_two_retained_app_unknown_effects_preserved");
  } else throw new Error("Unknown cancellation verification phase.");
} catch (error) {
  report.error = error instanceof Error ? error.message : "Verification failed.";
  process.exitCode = 1;
} finally {
  report.completed_at = new Date().toISOString();
  await save();
  console.log(
    JSON.stringify({
      phase,
      checks,
      error: report.error ?? null,
      native_terminal: report.native_terminal ?? null,
    }),
  );
}
