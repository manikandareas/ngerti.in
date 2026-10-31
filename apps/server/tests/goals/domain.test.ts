import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../../src/api";
import { Artifacts } from "../../src/artifacts";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Conversations } from "../../src/conversations";
import { dueWindow, firstDue } from "../../src/goals/schedule";
import { Goals } from "../../src/goals/service";
import { Groups } from "../../src/groups/service";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function setup() {
  f = fixture();
  return new Goals(f.lifecycle);
}
function start(runId?: string) {
  const queued = runId
    ? f.store.get("run", runId)
    : f.admit("Please prepare the report and its follow-up.").run;
  if (
    !f.store
      .list("binding")
      .some((b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id)
  )
    f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(queued.thread_id, queued.agent_id) as Entity<"run">;
  expect(run.id).toBe(queued.id);
  f.lifecycle.started(run.id, run.dispatch_token as string, crypto.randomUUID());
  return f.store.get("run", run.id);
}
function capture(goals: Goals, run: Entity<"run">, title = "Prepare the report") {
  return goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title,
    objective: `${title} using verified inputs.`,
    source_message_id: run.input_message_id,
  });
}
function finish(run: Entity<"run">, outcome: "succeeded" | "failed" | "unknown" = "succeeded") {
  f.lifecycle.settle(run.id, run.dispatch_token as string, outcome);
}
function artifact(run: Entity<"run">) {
  const files = new Artifacts(f.lifecycle);
  const workspace = files.workspaces.get(run.workspace_id as string);
  files.workspaces
    .files(workspace.id)
    .create(`result-${run.id}.txt`, Buffer.from("Verified: 19 + 23 = 42."));
  return files.publish(
    crypto.randomUUID(),
    {
      workspace_id: workspace.id,
      run_id: run.id,
      path: `result-${run.id}.txt`,
      media_type: "text/plain",
    },
    () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
}
function routine(goals: Goals, run: Entity<"run">, goalId: string | null = null) {
  return goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    goal_id: goalId,
    instruction: "Inspect changes and report only a relevant update.",
    timezone: "Asia/Makassar",
    schedule: { type: "heartbeat", anchor_at: "2026-10-31T00:00:00.000Z", every_ms: 1000 },
  });
}

test("multiple responsibilities retain their own source/objective/progress and correction identity after restart", () => {
  let goals = setup();
  const run = start();
  const first = capture(goals, run);
  const second = capture(goals, run, "Check the final figures");
  goals.report(run.id, {
    goal_id: second.id,
    expected_revision: second.revision,
    progress: "Waiting for the final figures.",
    disposition: "wait",
  });
  const corrected = goals.capture(run.id, {
    goal_id: first.id,
    expected_revision: first.revision,
    title: "Prepare a concise report",
    objective: "Use the corrected scope.",
    source_message_id: run.input_message_id,
  });
  expect(corrected.generation).toBe(2);
  expect(() =>
    goals.capture(run.id, {
      goal_id: first.id,
      expected_revision: 1,
      title: "Stale",
      objective: "Old scope",
      source_message_id: run.input_message_id,
    }),
  ).toThrow("CONFLICT");
  finish(run);
  f.restart();
  goals = new Goals(f.lifecycle);
  const state = goals.list({ thread_id: f.thread.id, agent_id: f.agent.id });
  expect(state.goals).toHaveLength(2);
  expect(state.goals[0]).toMatchObject({
    id: first.id,
    objective: "Use the corrected scope.",
    source_message_ids: [run.input_message_id],
  });
  expect(state.goals[1]).toMatchObject({
    id: second.id,
    work_state: "waiting",
    progress: "Waiting for the final figures.",
  });
});

test("capture rejects foreign, deleted and automatic trigger source identities", () => {
  const goals = setup();
  const run = start();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  const foreign = f.lifecycle.admit({
    thread_id: group.id,
    agent_id: f.agent.id,
    text: "Private context",
  });
  expect(() =>
    goals.capture(run.id, {
      goal_id: crypto.randomUUID(),
      expected_revision: 0,
      title: "Wrong source",
      objective: "Wrong",
      source_message_id: foreign.message.id,
    }),
  ).toThrow("SCOPE_DENIED");
  finish(run);
  const r = routine(goals, run);
  f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const scheduled = start(f.store.list("occurrence")[0].run_id);
  expect(() => capture(goals, scheduled)).toThrow("SCOPE_DENIED");
});

test("continuation admission is durable and repeated ticks/restart do not create another run", () => {
  let goals = setup();
  const run = start();
  const goal = capture(goals, run);
  goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Inputs verified.",
    disposition: "continue",
    continuation: { at: "2026-10-31T00:00:00.000Z", instruction: "Write the verified result." },
  });
  goals.advance(new Date("2026-10-31T00:00:01Z"));
  expect(f.store.list("run")).toHaveLength(1);
  finish(run);
  goals.advance(new Date("2026-10-31T00:00:01Z"));
  const queued = f.store.get("goal", goal.id).current_run_id;
  const cursor = f.store.cursor;
  goals.advance(new Date("2026-10-31T00:00:02Z"));
  expect(f.store.cursor).toBe(cursor);
  f.restart();
  goals = new Goals(f.lifecycle);
  goals.advance(new Date("2026-10-31T00:00:03Z"));
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.get("goal", goal.id).current_run_id).toBe(queued);
  const messages = new Conversations(f.lifecycle).snapshot(f.thread.id).messages;
  expect(messages).toHaveLength(2);
  expect(messages.some((m) => m.purpose === "continuation")).toBe(false);
  expect(messages.find((m) => m.author === "agent")?.text).toContain("Inputs verified.");
});

test("unknown native outcome never becomes a retry, completion or second scheduled effect", () => {
  let goals = setup();
  const run = start();
  const goal = capture(goals, run);
  routine(goals, run, goal.id);
  f.restart();
  goals = new Goals(f.lifecycle);
  for (let i = 0; i < 4; i++) new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.get("run", run.id).status).toBe("unknown");
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("occurrence")).toHaveLength(0);
  expect(f.store.get("goal", goal.id).state).toBe("active");
});

for (const disposition of ["wait", "blocked"] as const) {
  test(`${disposition} has no busy-loop, even with an associated heartbeat and after restart`, () => {
    const goals = setup();
    const run = start();
    const goal = capture(goals, run);
    routine(goals, run, goal.id);
    goals.report(run.id, {
      goal_id: goal.id,
      expected_revision: f.store.get("goal", goal.id).revision,
      progress: "Need a missing input.",
      disposition,
    });
    finish(run);
    f.restart();
    for (let i = 0; i < 4; i++) new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
    expect(f.store.list("run")).toHaveLength(1);
    expect(f.store.list("occurrence")).toHaveLength(0);
    expect(f.store.get("goal", goal.id).work_state).toBe(
      disposition === "wait" ? "waiting" : "blocked",
    );
  });
}

test("completion requires verified nonempty produced bytes and successful native settlement", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  const report = {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "The report contains the checked result.",
    disposition: "completed",
  };
  expect(() => goals.report(run.id, report)).toThrow("CONFLICT");
  const metadata = f.lifecycle.create("artifact", {
    thread_id: run.thread_id,
    agent_id: run.agent_id,
    run_id: run.id,
    media_type: "text/plain",
    sha256: "a".repeat(64),
    storage_key: "not-real-bytes",
  });
  expect(() => goals.report(run.id, { ...report, evidence_artifact_ids: [metadata.id] })).toThrow(
    "SCOPE_DENIED",
  );
  const result = artifact(run);
  goals.report(run.id, { ...report, evidence_artifact_ids: [result.id] });
  goals.advance();
  expect(f.store.get("goal", goal.id).state).toBe("active");
  finish(run);
  goals.advance();
  goals.advance();
  expect(f.store.get("goal", goal.id)).toMatchObject({
    state: "completed",
    evidence_artifact_ids: [result.id],
    continuation_at: null,
  });
  expect(f.store.list("run")).toHaveLength(1);
});

test("failed or stopped runs cannot finalize pending completion or publish deferred late results", () => {
  const goals = setup();
  const source = start();
  capture(goals, source);
  const r = routine(goals, source);
  finish(source);
  const occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = start((occurrence as Entity<"occurrence">).run_id);
  f.lifecycle.appendAnswer(run.id, "Unconfirmed update", "partial");
  expect(f.store.answer(run.id)).toBeNull();
  f.lifecycle.cancel(run.id);
  expect(() => f.lifecycle.appendAnswer(run.id, "Late result")).toThrow("STALE_DISPATCH");
  f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  expect(f.store.answer(run.id)).toBeNull();
  expect(() => artifact(source)).toThrow();
});

test("calendar schedules honor IANA wall time and skip DST gaps and repeated fall-back instants", () => {
  const daily = { type: "calendar" as const, local_time: "02:30", weekdays: [0, 1, 2, 3, 4, 5, 6] };
  expect(firstDue(daily, "America/New_York", new Date("2026-03-08T06:00:00Z"))).toBe(
    "2026-03-09T06:30:00.000Z",
  );
  const fall = { ...daily, local_time: "01:30" };
  expect(firstDue(fall, "America/New_York", new Date("2026-11-01T04:00:00Z"))).toBe(
    "2026-11-01T05:30:00.000Z",
  );
  expect(firstDue(fall, "America/New_York", new Date("2026-11-01T05:30:00.001Z"))).toBe(
    "2026-11-02T06:30:00.000Z",
  );
  expect(
    firstDue(
      { ...daily, local_time: "09:00", weekdays: [1] },
      "Asia/Makassar",
      new Date("2026-10-31T00:00:00Z"),
    ),
  ).toBe("2026-11-02T01:00:00.000Z");
  expect(
    dueWindow(daily, "UTC", "2026-10-01T02:30:00.000Z", new Date("2026-10-31T05:00:00Z")),
  ).toEqual({ scheduled_for: "2026-10-31T02:30:00.000Z", next: "2026-11-01T02:30:00.000Z" });
});

test("heartbeat coalesces missed occurrences and changed schedules invalidate old queued generation", () => {
  const goals = setup();
  const run = start();
  const original = routine(goals, run);
  finish(run);
  const occurrence = f.lifecycle.fireRoutine(original.id, new Date("2026-10-31T00:00:10.500Z"));
  expect(occurrence?.scheduled_for).toBe("2026-10-31T00:00:10.000Z");
  const current = f.store.get("routine", original.id);
  const updated = goals.writeRoutine(run.id, {
    routine_id: current.id,
    expected_revision: current.revision,
    goal_id: null,
    instruction: "New instruction",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00.000Z" },
  });
  expect(updated.generation).toBe(2);
  expect(f.store.get("run", (occurrence as Entity<"occurrence">).run_id).status).toBe("cancelled");
  f.restart();
  const bg = new Background(f.lifecycle);
  bg.tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.list("occurrence")).toHaveLength(1);
  bg.tick(new Date("2026-11-02T00:00:00Z"));
  expect(f.store.list("occurrence")).toHaveLength(2);
});

test("quiet scheduled output has no streamed or final bubble, while relevant output publishes once", () => {
  const goals = setup();
  const source = start();
  const r = routine(goals, source);
  finish(source);
  let occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  let run = start((occurrence as Entity<"occurrence">).run_id);
  f.lifecycle.appendAnswer(run.id, "Checking...", "partial");
  expect(f.store.answer(run.id)).toBeNull();
  goals.noUpdate(run.id);
  f.lifecycle.appendAnswer(run.id, "No changes.");
  finish(run);
  expect(f.store.answer(run.id)).toBeNull();
  occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:01Z"));
  run = start((occurrence as Entity<"occurrence">).run_id);
  f.lifecycle.appendAnswer(run.id, "A meaningful change is ready.");
  expect(f.store.answer(run.id)).toBeNull();
  finish(run);
  expect(f.store.answer(run.id)?.text).toBe("A meaningful change is ready.");
  expect(
    new Conversations(f.lifecycle)
      .snapshot(f.thread.id)
      .messages.filter((m) => m.author === "agent"),
  ).toHaveLength(1);
});

test("quiet cannot hide a result artifact, human request or explicit blocker", () => {
  const goals = setup();
  const source = start();
  const r = routine(goals, source);
  finish(source);
  const occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = start((occurrence as Entity<"occurrence">).run_id);
  artifact(run);
  expect(() => goals.noUpdate(run.id)).toThrow("CONFLICT");
  expect(() => goals.noUpdate(source.id)).toThrow("CONFLICT");
});

test("stop run preserves future Routine responsibility without replaying the cancelled run", () => {
  const goals = setup();
  const source = start();
  const goal = capture(goals, source);
  const r = routine(goals, source, goal.id);
  f.lifecycle.cancel(source.id);
  f.lifecycle.settle(source.id, source.dispatch_token as string, "cancelled");
  goals.advance();
  f.restart();
  new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.get("goal", goal.id).state).toBe("active");
  expect(f.store.get("goal", goal.id).work_state).toBe("ready");
  expect(f.store.get("routine", r.id).state).toBe("active");
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.get("run", source.id).status).toBe("cancelled");
});

test("pause/resume preserves an independently paused Routine; stop fences queued work across restart", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  const first = routine(goals, run, goal.id);
  const second = routine(goals, run, goal.id);
  finish(run);
  goals.controlRoutine(run, {
    routine_id: first.id,
    expected_revision: first.revision,
    state: "paused",
  });
  f.lifecycle.controlGoal(goal.id, "paused");
  f.lifecycle.controlGoal(goal.id, "active");
  expect(f.store.get("routine", first.id).state).toBe("paused");
  expect(f.store.get("routine", second.id).state).toBe("active");
  goals.advance();
  const current = f.store.get("goal", goal.id);
  const continuation = current.current_run_id;
  f.lifecycle.controlGoal(goal.id, "stopped");
  f.restart();
  new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.get("run", continuation as string).status).toBe("cancelled");
  expect(f.store.list("routine").every((r) => r.state === "stopped")).toBe(true);
});

test("goal handoff/HITL retains one task owner; stop invalidates descendant tasks and replies", () => {
  const goals = setup();
  const peer = f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const thread = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const groups = new Groups(f.lifecycle);
  const route = groups.send(thread.id, { text: "Prepare a reviewed report", agent_id: f.agent.id });
  const run = start(f.store.get("peer_task", route.task_id as string).current_run_id);
  const goal = capture(goals, run);
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Review the report",
    purpose: "review",
  });
  finish(run);
  groups.advance();
  goals.advance();
  expect(f.store.list("run")).toHaveLength(2);
  const peerRun = start(child.current_run_id);
  const request = groups.askUser(peerRun.id, { purpose: "input", question: "Which format?" });
  finish(peerRun);
  f.lifecycle.controlGoal(goal.id, "stopped");
  f.restart();
  new Background(f.lifecycle).tick();
  expect(f.store.list("peer_task").every((t) => t.state === "cancelled")).toBe(true);
  expect(f.store.get("human_request", request.id).state).toBe("cancelled");
  expect(() =>
    new Groups(f.lifecycle).reply(request.id, {
      expected_revision: request.revision,
      text: "Markdown",
    }),
  ).toThrow("CONFLICT");
  expect(f.store.list("run")).toHaveLength(2);
});

test("scoped structured capture retries commit once and self-stop returns its receipt then revokes tools", async () => {
  const goals = setup();
  const connections = new Connections(f.lifecycle);
  const c = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(c, { capabilities: { ...c.capabilities, product_tools: "supported" } });
  const run = start();
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(run);
  const input = {
    command_id: crypto.randomUUID(),
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Durable work",
    objective: "Produce verified work",
    source_message_id: run.input_message_id,
  };
  const receipts = await Promise.all(
    Array.from({ length: 12 }, () =>
      tools.call(lease.token, lease.scope, "ngertiin.capture_goal", input),
    ),
  );
  expect(receipts.every((r) => JSON.stringify(r) === JSON.stringify(receipts[0]))).toBe(true);
  expect(goals.list(run).goals).toHaveLength(1);
  const stopped = (await tools.call(lease.token, lease.scope, "ngertiin.control_goal", {
    command_id: crypto.randomUUID(),
    goal_id: input.goal_id,
    expected_revision: 1,
    state: "stopped",
  })) as Entity<"goal">;
  expect(stopped.state).toBe("stopped");
  await expect(tools.call(lease.token, lease.scope, "ngertiin.list_goals", {})).rejects.toThrow(
    "STALE_DISPATCH",
  );
});

test("HTTP contracts expose goal/Routine commands, snapshot/replay and authenticated idempotent updates", async () => {
  setup();
  const run = start();
  const token = "x".repeat(64);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  const input = {
    run_id: run.id,
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Report",
    objective: "Verify the report",
    source_message_id: run.input_message_id,
  };
  const key = crypto.randomUUID();
  const request = (path: string, body?: unknown, authenticated = true) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: body ? "POST" : "GET",
        headers: {
          ...(authenticated ? { Authorization: `Bearer ${token}` } : {}),
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  expect((await request("/v1/goals/capture", input, false)).status).toBe(401);
  const first = await request("/v1/goals/capture", input);
  expect(first.status).toBe(200);
  const receipt = await first.json();
  const cursor = f.store.cursor;
  expect(await (await request("/v1/goals/capture", input)).json()).toEqual(receipt);
  expect(f.store.cursor).toBe(cursor);
  const document = await (await request("/v1/contracts")).json();
  expect(document.version).toBe("1.8.0");
  expect(document.commands.report_goal).toBeDefined();
  const snapshot = await (await request(`/v1/threads/${run.thread_id}/snapshot`)).json();
  expect(snapshot.goals[0].id).toBe(input.goal_id);
  const inventory = await (
    await request(`/v1/threads/${run.thread_id}/goals?agent_id=${run.agent_id}`)
  ).json();
  expect(inventory.goals).toHaveLength(1);
});

test("an active linked Routine owns its wakeups and cannot race a second continuation", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  routine(goals, run, goal.id);
  const current = f.store.get("goal", goal.id);
  expect(() =>
    goals.report(run.id, {
      goal_id: goal.id,
      expected_revision: current.revision,
      progress: "Scheduled",
      disposition: "continue",
      continuation: { at: "2026-10-31T00:00:00.000Z", instruction: "Do the same work" },
    }),
  ).toThrow("CONFLICT");
  goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "The Routine owns checks.",
    disposition: "scheduled",
  });
  finish(run);
  new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.list("occurrence")).toHaveLength(1);
  expect(f.store.list("run").filter((r) => r.goal_id === goal.id && !r.routine_id)).toHaveLength(0);
});

test("completion from an unsuccessful native run remains blocked with evidence retained", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  const result = artifact(run);
  goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Produced bytes but native turn did not finish.",
    disposition: "completed",
    evidence_artifact_ids: [result.id],
  });
  finish(run, "failed");
  goals.advance();
  expect(f.store.get("goal", goal.id)).toMatchObject({
    state: "active",
    work_state: "blocked",
    evidence_artifact_ids: [result.id],
  });
  expect(f.store.list("run")).toHaveLength(1);
});

test("explicit resume continues a stopped known run while unknown source receipts remain fenced", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  f.lifecycle.controlGoal(goal.id, "paused");
  f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  f.lifecycle.controlGoal(goal.id, "active");
  goals.advance();
  const next = f.store.get("goal", goal.id).current_run_id;
  expect(next).not.toBe(run.id);
  expect(f.store.get("run", next as string).status).toBe("queued");
  const native = start(next as string);
  f.restart();
  f.lifecycle.controlGoal(goal.id, "paused");
  f.lifecycle.controlGoal(goal.id, "active");
  new Goals(f.lifecycle).advance();
  expect(f.store.get("run", native.id).status).toBe("unknown");
  expect(f.store.list("run")).toHaveLength(2);
});

test("membership removal and readd cannot revive goal or standalone Routine generations", () => {
  const goals = setup();
  const peer = f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const source = f.lifecycle.admit({
    thread_id: group.id,
    agent_id: f.agent.id,
    text: "Track this responsibility",
  });
  const run = start(source.run.id);
  const goal = capture(goals, run);
  const r = routine(goals, run);
  finish(run);
  const groups = new Groups(f.lifecycle);
  const removed = groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  groups.membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(f.store.get("goal", goal.id).state).toBe("stopped");
  expect(f.store.get("routine", r.id).state).toBe("stopped");
  expect(f.store.list("run")).toHaveLength(1);
});

test("completion rechecks evidence bytes after reporting and blocks a tampered artifact", () => {
  const goals = setup();
  const run = start();
  const goal = capture(goals, run);
  const result = artifact(run);
  goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Result prepared.",
    disposition: "completed",
    evidence_artifact_ids: [result.id],
  });
  writeFileSync(join(new Artifacts(f.lifecycle).blobRoot, result.storage_key), "Changed bytes");
  finish(run);
  goals.advance();
  expect(f.store.get("goal", goal.id)).toMatchObject({ state: "active", work_state: "blocked" });
  expect(f.store.get("goal", goal.id).progress).toContain("evidence could not be verified");
});

test("a meaningful artifact after a quiet decision restores final publication", () => {
  const goals = setup();
  const source = start();
  const r = routine(goals, source);
  finish(source);
  const occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = start((occurrence as Entity<"occurrence">).run_id);
  goals.noUpdate(run.id);
  artifact(run);
  expect(f.store.get("run", run.id).publication).toBe("deferred");
  f.lifecycle.appendAnswer(run.id, "A useful result is available.");
  finish(run);
  expect(f.store.answer(run.id)?.text).toBe("A useful result is available.");
});

test("a source run cannot undo its yield, publish future result bytes or complete the deferred goal", async () => {
  const goals = setup();
  const c = new Connections(f.lifecycle);
  const connection = c.get(f.store.get("agent", f.agent.id).connection_id);
  c.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const run = start();
  const goal = capture(goals, run);
  const result = artifact(run);
  const deferred = goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "First stage is ready.",
    disposition: "continue",
    continuation: { at: "2026-11-02T00:00:00.000Z", instruction: "Do the future stage." },
  });
  expect(() =>
    goals.report(run.id, {
      goal_id: goal.id,
      expected_revision: deferred.revision,
      progress: "Ran early",
      disposition: "completed",
      evidence_artifact_ids: [result.id],
    }),
  ).toThrow("RESPONSIBILITY_DEFERRED");
  expect(() =>
    goals.capture(run.id, {
      goal_id: goal.id,
      expected_revision: deferred.revision,
      title: goal.title,
      objective: goal.objective,
      source_message_id: run.input_message_id,
    }),
  ).toThrow("RESPONSIBILITY_DEFERRED");
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(f.store.get("run", run.id));
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.create_file", {
      command_id: crypto.randomUUID(),
      path: "early-final.txt",
      text: "Too early",
    }),
  ).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  const files = new Artifacts(f.lifecycle);
  files.workspaces
    .files(run.workspace_id as string)
    .create("native-early.txt", Buffer.from("Untrusted native early write"));
  expect(() =>
    files.publish(
      crypto.randomUUID(),
      {
        workspace_id: run.workspace_id,
        run_id: run.id,
        path: "native-early.txt",
        media_type: "text/plain",
      },
      () => {},
    ),
  ).toThrow("RESPONSIBILITY_DEFERRED");
  f.lifecycle.appendAnswer(run.id, "I already finished the future stage.");
  finish(run);
  expect(f.store.answer(run.id)?.text).toContain("First stage is ready.");
  expect(f.store.answer(run.id)?.text).not.toContain("already finished");
  f.restart();
  new Goals(f.lifecycle).advance(new Date("2026-11-02T00:00:00Z"));
  const next = start(f.store.get("goal", goal.id).current_run_id as string);
  const current = f.store.get("goal", goal.id);
  const final = artifact(next);
  new Goals(f.lifecycle).report(next.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "The authorized later stage produced evidence.",
    disposition: "completed",
    evidence_artifact_ids: [final.id],
  });
  finish(next);
  new Goals(f.lifecycle).advance();
  expect(f.store.get("goal", goal.id).state).toBe("completed");
});

test("a later conversational schedule edit binds its source run before allowing another occurrence", () => {
  const goals = setup();
  const source = start();
  const goal = capture(goals, source);
  const r = routine(goals, source, goal.id);
  finish(source);
  const editor = start();
  const current = f.store.get("routine", r.id);
  goals.writeRoutine(editor.id, {
    routine_id: r.id,
    expected_revision: current.revision,
    goal_id: goal.id,
    instruction: "Use the corrected schedule",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00.000Z" },
  });
  expect(f.store.get("goal", goal.id).current_run_id).toBe(editor.id);
  expect(f.lifecycle.fireRoutine(r.id, new Date("2026-11-02T00:00:01Z"))).toBeNull();
  expect(() => artifact(editor)).toThrow("RESPONSIBILITY_DEFERRED");
  finish(editor);
  const occurrence = f.lifecycle.fireRoutine(r.id, new Date("2026-11-02T00:00:01Z"));
  expect(occurrence).not.toBeNull();
});
