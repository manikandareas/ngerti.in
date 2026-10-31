import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Background } from "../../../apps/server/src/background";
import { Goals } from "../../../apps/server/src/goals/service";
import { Connections } from "../../../apps/server/src/harness/connections";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const mode = process.argv[2];
const directory = resolve(process.argv[3] ?? ".dev/nma057/crash-state");
const output = process.argv[4] ?? "docs/verification/nma-057/crash.json";
if (mode === "seed") {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const owner = crypto.randomUUID();
  const store = new Store(join(directory, "state.sqlite"), owner);
  const lifecycle = new Lifecycle(store);
  const goals = new Goals(lifecycle);
  const c = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = lifecycle.createAgent({
    name: "Crash proof",
    harness: "codex",
    connection_id: c.id,
  });
  const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
  const begin = (text: string) => {
    const receipt = lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text });
    if (!store.list("binding").length) lifecycle.bind(thread.id, agent.id, crypto.randomUUID());
    const run = lifecycle.claimNext(thread.id, agent.id);
    assert(run?.dispatch_token);
    lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
    return receipt.run;
  };
  const source = begin("Prepare separate reports and wait where input is missing.");
  const input = (title: string) => ({
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title,
    objective: title,
    source_message_id: source.input_message_id,
  });
  const captured = input("Continue the report");
  const key = crypto.randomUUID();
  const ready = store.command(key, captured, () => goals.capture(source.id, captured));
  const report = {
    goal_id: ready.id,
    expected_revision: ready.revision,
    progress: "Inputs checked.",
    disposition: "continue",
    continuation: { at: "2026-10-31T00:00:00.000Z", instruction: "Write the report." },
  };
  const reportKey = crypto.randomUUID();
  store.command(reportKey, report, () => goals.report(source.id, report));
  const waiting = goals.capture(source.id, input("Wait for the missing input"));
  goals.report(source.id, {
    goal_id: waiting.id,
    expected_revision: waiting.revision,
    progress: "Waiting for the owner.",
    disposition: "wait",
  });
  const stopped = goals.capture(source.id, input("Cancelled responsibility"));
  const routine = goals.writeRoutine(source.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    goal_id: null,
    instruction: "Inspect once",
    schedule: { type: "once", at: "2026-10-31T00:00:00.000Z" },
    timezone: "UTC",
  });
  lifecycle.settle(source.id, store.get("run", source.id).dispatch_token as string, "succeeded");
  lifecycle.controlGoal(stopped.id, "stopped");
  lifecycle.fireRoutine(routine.id, new Date("2026-10-31T00:00:01Z"));
  // A different lane simulates accepted native work at the crash, with no terminal receipt.
  const other = lifecycle.createAgent({
    name: "Unknown proof",
    harness: "codex",
    connection_id: c.id,
  });
  const dm = lifecycle.create("thread", { type: "dm", member_agent_ids: [other.id] });
  const admitted = lifecycle.admit({
    thread_id: dm.id,
    agent_id: other.id,
    text: "Work whose acknowledgement is lost.",
  });
  lifecycle.bind(dm.id, other.id, crypto.randomUUID());
  const unknown = lifecycle.claimNext(dm.id, other.id);
  assert(unknown?.dispatch_token);
  lifecycle.started(unknown.id, unknown.dispatch_token, crypto.randomUUID());
  const held = goals.capture(unknown.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Held unknown work",
    objective: "Do not replay unknown effects",
    source_message_id: admitted.message.id,
  });
  const rollback = input("Rolled back responsibility");
  const rollbackKey = crypto.randomUUID();
  const cursor = store.cursor;
  try {
    store.transaction(() => {
      store.command(rollbackKey, rollback, () => goals.capture(source.id, rollback));
      throw new Error("Injected pre-commit failure");
    });
  } catch {}
  assert.equal(store.cursor, cursor);
  await Bun.write(
    join(directory, "probe.json"),
    JSON.stringify({
      owner,
      source: source.id,
      key,
      captured,
      reportKey,
      report,
      waiting: waiting.id,
      stopped: stopped.id,
      routine: routine.id,
      held: held.id,
      unknown: unknown.id,
      rollback,
      rollbackKey,
    }),
  );
  console.log("committed");
  await new Promise(() => {});
} else {
  assert.equal(mode, "verify");
  assert(!existsSync(directory), "Use a fresh directory; this probe never resets existing state.");
  const child = Bun.spawn([process.execPath, import.meta.path, "seed", directory], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const reader = child.stdout.getReader();
  let stdout = "";
  while (!stdout.includes("committed")) {
    const chunk = await reader.read();
    assert(!chunk.done);
    stdout += new TextDecoder().decode(chunk.value);
  }
  const probe = await Bun.file(join(directory, "probe.json")).json();
  const checks: string[] = [];
  assert.throws(
    () => new Store(join(directory, "state.sqlite"), probe.owner),
    /Another application authority/,
  );
  checks.push("second_authority_rejected_while_the_owner_is_alive");
  child.kill("SIGKILL");
  await child.exited;
  let store = new Store(join(directory, "state.sqlite"), probe.owner);
  let lifecycle = new Lifecycle(store);
  let goals = new Goals(lifecycle);
  assert.equal(store.get("goal", probe.waiting).work_state, "waiting");
  assert.equal(store.get("goal", probe.stopped).state, "stopped");
  assert.equal(store.get("run", probe.unknown).status, "unknown");
  checks.push("multi_goal_wait_stop_and_unknown_state_survive_sigkill");
  let cursor = store.cursor;
  assert.equal(
    store.command(probe.key, probe.captured, () => goals.capture(probe.source, probe.captured)).id,
    probe.captured.goal_id,
  );
  store.command(probe.reportKey, probe.report, () => goals.report(probe.source, probe.report));
  assert.equal(store.cursor, cursor);
  checks.push("capture_and_progress_receipts_replay_without_events_or_effects");
  for (let i = 0; i < 4; i++) new Background(lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  assert.equal(store.list("occurrence").length, 1);
  assert.equal(store.list("run").filter((r) => r.goal_id === probe.captured.goal_id).length, 1);
  assert.equal(store.list("run").filter((r) => r.goal_id === probe.held).length, 0);
  checks.push("one_durable_continuation_and_one_occurrence_with_unknown_work_held");
  const count = store.list("run").length;
  cursor = store.cursor;
  store.close();
  store = new Store(join(directory, "state.sqlite"), probe.owner);
  lifecycle = new Lifecycle(store);
  goals = new Goals(lifecycle);
  for (let i = 0; i < 3; i++) new Background(lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  assert.equal(store.cursor, cursor);
  assert.equal(store.list("run").length, count);
  checks.push("second_restart_cannot_duplicate_the_queued_continuation");
  lifecycle.controlGoal(probe.captured.goal_id, "stopped");
  assert(
    store
      .list("run")
      .filter((r) => r.goal_id === probe.captured.goal_id)
      .every((r) => r.status === "cancelled"),
  );
  checks.push("stop_cancels_old_continuation_generation");
  assert(!store.list("goal").some((g) => g.id === probe.rollback.goal_id));
  const retried = store.command(probe.rollbackKey, probe.rollback, () =>
    goals.capture(probe.source, probe.rollback),
  );
  assert.equal(retried.id, probe.rollback.goal_id);
  checks.push("pre_commit_failure_rolls_back_domain_event_and_receipt_then_retries_once");
  store.close();
  await Bun.write(
    output,
    `${JSON.stringify(
      {
        status: "pass",
        checks,
        denominator: checks.length,
        proof_level:
          "Application SIGKILL/SQLite process fixture; no provider crash or power-loss claim.",
        synthetic_unknown_runs: 1,
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ status: "pass", checks }));
}
