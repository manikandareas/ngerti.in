import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { Artifacts } from "../../src/artifacts";
import { Background } from "../../src/background";
import { CONTRACT_VERSION, type Entity } from "../../src/contracts";
import { Conversations } from "../../src/conversations";
import { dueWindow, firstDue } from "../../src/goals/schedule";
import { Goals } from "../../src/goals/service";
import { Groups } from "../../src/groups/service";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";
import { fixtureApi as createApi } from "../http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function setup() {
  f = await fixture();
  return new Goals(f.lifecycle);
}
async function start(runId?: string | null) {
  const queued = runId
    ? await f.store.get("run", runId)
    : (await f.admit("Please prepare the report and its follow-up.")).run;
  if (
    !(await f.store.list("binding")).some(
      (b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id,
    )
  )
    await f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = (await f.lifecycle.claimNext(queued.thread_id, queued.agent_id)) as Entity<"run">;
  expect(run.id).toBe(queued.id);
  await f.lifecycle.started(run.id, run.dispatch_token as string, crypto.randomUUID());
  return await f.store.get("run", run.id);
}
async function capture(goals: Goals, run: Entity<"run">, title = "Prepare the report") {
  return await goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title,
    objective: `${title} using verified inputs.`,
    source_message_id: run.input_message_id,
  });
}
async function finish(
  run: Entity<"run">,
  outcome: "succeeded" | "failed" | "unknown" = "succeeded",
) {
  await f.lifecycle.settle(run.id, run.dispatch_token as string, outcome);
}
async function artifact(run: Entity<"run">) {
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.get(run.workspace_id as string);
  (await files.workspaces.files(workspace.id)).create(
    `result-${run.id}.txt`,
    Buffer.from("Verified: 19 + 23 = 42."),
  );
  return await files.publish(
    crypto.randomUUID(),
    {
      workspace_id: workspace.id,
      run_id: run.id,
      path: `result-${run.id}.txt`,
      media_type: "text/plain",
    },
    async () => await f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
}
async function routine(goals: Goals, run: Entity<"run">, goalId: string | null = null) {
  return await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    goal_id: goalId,
    instruction: "Inspect changes and report only a relevant update.",
    timezone: "Asia/Makassar",
    schedule: { type: "heartbeat", anchor_at: "2026-10-31T00:00:00.000Z", every_ms: 1000 },
  });
}

test("multiple responsibilities retain their own source/objective/progress and correction identity after restart", async () => {
  let goals = await setup();
  const run = await start();
  const first = await capture(goals, run);
  const second = await capture(goals, run, "Check the final figures");
  await goals.report(run.id, {
    goal_id: second.id,
    expected_revision: second.revision,
    progress: "Waiting for the final figures.",
    disposition: "wait",
  });
  const corrected = await goals.capture(run.id, {
    goal_id: first.id,
    expected_revision: first.revision,
    title: "Prepare a concise report",
    objective: "Use the corrected scope.",
    source_message_id: run.input_message_id,
  });
  expect(corrected.generation).toBe(2);
  await expect(
    (async () =>
      goals.capture(run.id, {
        goal_id: first.id,
        expected_revision: 1,
        title: "Stale",
        objective: "Old scope",
        source_message_id: run.input_message_id,
      }))(),
  ).rejects.toThrow("CONFLICT");
  await finish(run);
  await f.restart();
  goals = new Goals(f.lifecycle);
  const state = await goals.list({ thread_id: f.thread.id, agent_id: f.agent.id });
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

test("capture rejects foreign, deleted and automatic trigger source identities", async () => {
  const goals = await setup();
  const run = await start();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  const foreign = await f.lifecycle.admit({
    thread_id: group.id,
    agent_id: f.agent.id,
    text: "Private context",
  });
  await expect(
    (async () =>
      goals.capture(run.id, {
        goal_id: crypto.randomUUID(),
        expected_revision: 0,
        title: "Wrong source",
        objective: "Wrong",
        source_message_id: foreign.message.id,
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await finish(run);
  const r = await routine(goals, run);
  await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const scheduled = await start((await f.store.list("occurrence"))[0].run_id);
  await expect((async () => capture(goals, scheduled))()).rejects.toThrow("SCOPE_DENIED");
});

test("continuation admission is durable and repeated ticks/restart do not create another run", async () => {
  let goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  await goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Inputs verified.",
    disposition: "continue",
    continuation: { at: "2026-10-31T00:00:00.000Z", instruction: "Write the verified result." },
  });
  await goals.advance(new Date("2026-10-31T00:00:01Z"));
  expect(await f.store.list("run")).toHaveLength(1);
  await finish(run);
  await goals.advance(new Date("2026-10-31T00:00:01Z"));
  const queued = (await f.store.get("goal", goal.id)).current_run_id;
  const cursor = await f.store.cursor;
  await goals.advance(new Date("2026-10-31T00:00:02Z"));
  expect(await f.store.cursor).toBe(cursor);
  await f.restart();
  goals = new Goals(f.lifecycle);
  await goals.advance(new Date("2026-10-31T00:00:03Z"));
  expect(await f.store.list("run")).toHaveLength(2);
  expect((await f.store.get("goal", goal.id)).current_run_id).toBe(queued);
  const messages = (await new Conversations(f.lifecycle).snapshot(f.thread.id)).messages;
  expect(messages).toHaveLength(2);
  expect(messages.some((m) => m.purpose === "continuation")).toBe(false);
  expect(messages.find((m) => m.author === "agent")?.text).toContain("Inputs verified.");
});

test("unknown native outcome never becomes a retry, completion or second scheduled effect", async () => {
  let goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  await routine(goals, run, goal.id);
  await f.restart();
  goals = new Goals(f.lifecycle);
  for (let i = 0; i < 4; i++)
    await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
  expect(await f.store.list("run")).toHaveLength(1);
  expect(await f.store.list("occurrence")).toHaveLength(0);
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
});

for (const disposition of ["wait", "blocked"] as const) {
  test(`${disposition} has no busy-loop, even with an associated heartbeat and after restart`, async () => {
    const goals = await setup();
    const run = await start();
    const goal = await capture(goals, run);
    await routine(goals, run, goal.id);
    await goals.report(run.id, {
      goal_id: goal.id,
      expected_revision: (await f.store.get("goal", goal.id)).revision,
      progress: "Need a missing input.",
      disposition,
    });
    await finish(run);
    await f.restart();
    for (let i = 0; i < 4; i++)
      await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
    expect(await f.store.list("run")).toHaveLength(1);
    expect(await f.store.list("occurrence")).toHaveLength(0);
    expect((await f.store.get("goal", goal.id)).work_state).toBe(
      disposition === "wait" ? "waiting" : "blocked",
    );
  });
}

test("completion requires verified nonempty produced bytes and successful native settlement", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  const report = {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "The report contains the checked result.",
    disposition: "completed",
  };
  await expect((async () => goals.report(run.id, report))()).rejects.toThrow("CONFLICT");
  const metadata = await f.lifecycle.create("artifact", {
    thread_id: run.thread_id,
    agent_id: run.agent_id,
    run_id: run.id,
    media_type: "text/plain",
    sha256: "a".repeat(64),
    storage_key: "not-real-bytes",
  });
  await expect(
    (async () => goals.report(run.id, { ...report, evidence_artifact_ids: [metadata.id] }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  const result = await artifact(run);
  await goals.report(run.id, { ...report, evidence_artifact_ids: [result.id] });
  await goals.advance();
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  await finish(run);
  await goals.advance();
  await goals.advance();
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    state: "completed",
    evidence_artifact_ids: [result.id],
    continuation_at: null,
  });
  expect(await f.store.list("run")).toHaveLength(1);
});

test("failed or stopped runs cannot finalize pending completion or publish deferred late results", async () => {
  const goals = await setup();
  const source = await start();
  await capture(goals, source);
  const r = await routine(goals, source);
  await finish(source);
  const occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = await start((occurrence as Entity<"occurrence">).run_id);
  await f.lifecycle.appendAnswer(run.id, "Unconfirmed update", "partial");
  expect(await f.store.answer(run.id)).toBeNull();
  await f.lifecycle.cancel(run.id);
  await expect((async () => f.lifecycle.appendAnswer(run.id, "Late result"))()).rejects.toThrow(
    "STALE_DISPATCH",
  );
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  expect(await f.store.answer(run.id)).toBeNull();
  await expect(artifact(source)).rejects.toThrow();
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

test("heartbeat coalesces missed occurrences and changed schedules invalidate old queued generation", async () => {
  const goals = await setup();
  const run = await start();
  const original = await routine(goals, run);
  await finish(run);
  const occurrence = await f.lifecycle.fireRoutine(
    original.id,
    new Date("2026-10-31T00:00:10.500Z"),
  );
  expect(occurrence?.scheduled_for).toBe("2026-10-31T00:00:10.000Z");
  const current = await f.store.get("routine", original.id);
  const updated = await goals.writeRoutine(run.id, {
    routine_id: current.id,
    expected_revision: current.revision,
    goal_id: null,
    instruction: "New instruction",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00.000Z" },
  });
  expect(updated.generation).toBe(2);
  expect((await f.store.get("run", (occurrence as Entity<"occurrence">).run_id)).status).toBe(
    "cancelled",
  );
  await f.restart();
  const bg = new Background(f.lifecycle);
  await bg.tick(new Date("2026-11-01T00:00:00Z"));
  expect(await f.store.list("occurrence")).toHaveLength(1);
  await bg.tick(new Date("2026-11-02T00:00:00Z"));
  expect(await f.store.list("occurrence")).toHaveLength(2);
});

test("quiet scheduled output has no streamed or final bubble, while relevant output publishes once", async () => {
  const goals = await setup();
  const source = await start();
  const r = await routine(goals, source);
  await finish(source);
  const beforeParts = (await new Conversations(f.lifecycle).timeline(f.thread.id)).parts;
  let occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  let run = await start((occurrence as Entity<"occurrence">).run_id);
  await f.lifecycle.appendAnswer(run.id, "Checking...", "partial");
  expect(await f.store.answer(run.id)).toBeNull();
  await goals.noUpdate(run.id);
  await f.lifecycle.appendAnswer(run.id, "No changes.");
  await finish(run);
  expect(await f.store.answer(run.id)).toBeNull();
  expect((await new Conversations(f.lifecycle).timeline(f.thread.id)).parts).toEqual(beforeParts);
  occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:01Z"));
  run = await start((occurrence as Entity<"occurrence">).run_id);
  await f.lifecycle.appendAnswer(run.id, "A meaningful change is ready.");
  expect(await f.store.answer(run.id)).toBeNull();
  await finish(run);
  expect((await f.store.answer(run.id))?.text).toBe("A meaningful change is ready.");
  expect(
    (await new Conversations(f.lifecycle).snapshot(f.thread.id)).messages.filter(
      (m) => m.author === "agent",
    ),
  ).toHaveLength(1);
});

test("quiet cannot hide a result artifact, human request or explicit blocker", async () => {
  const goals = await setup();
  const source = await start();
  const r = await routine(goals, source);
  await finish(source);
  const occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = await start((occurrence as Entity<"occurrence">).run_id);
  await artifact(run);
  await expect((async () => goals.noUpdate(run.id))()).rejects.toThrow("CONFLICT");
  await expect((async () => goals.noUpdate(source.id))()).rejects.toThrow("CONFLICT");
});

test("stop run preserves future Routine responsibility without replaying the cancelled run", async () => {
  const goals = await setup();
  const source = await start();
  const goal = await capture(goals, source);
  const r = await routine(goals, source, goal.id);
  await f.lifecycle.cancel(source.id);
  await f.lifecycle.settle(source.id, source.dispatch_token as string, "cancelled");
  await goals.advance();
  await f.restart();
  await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  expect((await f.store.get("goal", goal.id)).work_state).toBe("ready");
  expect((await f.store.get("routine", r.id)).state).toBe("active");
  expect(await f.store.list("run")).toHaveLength(2);
  expect((await f.store.get("run", source.id)).status).toBe("cancelled");
});

test("pause/resume preserves an independently paused Routine; stop fences queued work across restart", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  const first = await routine(goals, run, goal.id);
  const second = await routine(goals, run, goal.id);
  await finish(run);
  await goals.controlRoutine(run, {
    routine_id: first.id,
    expected_revision: first.revision,
    state: "paused",
  });
  await f.lifecycle.controlGoal(goal.id, "paused");
  await f.lifecycle.controlGoal(goal.id, "active");
  expect((await f.store.get("routine", first.id)).state).toBe("paused");
  expect((await f.store.get("routine", second.id)).state).toBe("active");
  await goals.advance();
  const current = await f.store.get("goal", goal.id);
  const continuation = current.current_run_id;
  await f.lifecycle.controlGoal(goal.id, "stopped");
  await f.restart();
  await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect((await f.store.get("run", continuation as string)).status).toBe("cancelled");
  expect((await f.store.list("routine")).every((r) => r.state === "stopped")).toBe(true);
});

test("goal handoff/HITL retains one task owner; stop invalidates descendant tasks and replies", async () => {
  const goals = await setup();
  const peer = await f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const thread = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const groups = new Groups(f.lifecycle);
  const route = await groups.send(thread.id, {
    text: "Prepare a reviewed report",
    agent_id: f.agent.id,
  });
  const run = await start((await f.store.get("peer_task", route.task_id as string)).current_run_id);
  const goal = await capture(goals, run);
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Review the report",
    purpose: "review",
  });
  await finish(run);
  await groups.advance();
  await goals.advance();
  expect(await f.store.list("run")).toHaveLength(2);
  const peerRun = await start(child.current_run_id);
  const request = await groups.askUser(peerRun.id, { purpose: "input", question: "Which format?" });
  await finish(peerRun);
  await f.lifecycle.controlGoal(goal.id, "stopped");
  await f.restart();
  await new Background(f.lifecycle).tick();
  expect((await f.store.list("peer_task")).every((t) => t.state === "cancelled")).toBe(true);
  expect((await f.store.get("human_request", request.id)).state).toBe("cancelled");
  await expect(
    (async () =>
      new Groups(f.lifecycle).reply(request.id, {
        expected_revision: request.revision,
        text: "Markdown",
      }))(),
  ).rejects.toThrow("CONFLICT");
  expect(await f.store.list("run")).toHaveLength(2);
});

test("scoped structured capture retries commit once and self-stop returns its receipt then revokes tools", async () => {
  const goals = await setup();
  const connections = new Connections(f.lifecycle);
  const c = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(c, { capabilities: { ...c.capabilities, product_tools: "supported" } });
  const run = await start();
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(run);
  const input = {
    command_id: crypto.randomUUID(),
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Durable work",
    objective: "Produce verified work",
    source_message_id: run.input_message_id,
  };
  const receipts = await Promise.all(
    Array.from({ length: 12 }, async () =>
      tools.call(lease.token, lease.scope, "ngertiin.capture_goal", input),
    ),
  );
  expect(receipts.every((r) => JSON.stringify(r) === JSON.stringify(receipts[0]))).toBe(true);
  expect((await goals.list(run)).goals).toHaveLength(1);
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
  await setup();
  const run = await start();
  const token = "x".repeat(64);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
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
  const cursor = await f.store.cursor;
  expect(await (await request("/v1/goals/capture", input)).json()).toEqual(receipt);
  expect(await f.store.cursor).toBe(cursor);
  const document = await (await request("/v1/contracts")).json();
  expect(document.version).toBe(CONTRACT_VERSION);
  expect(document.commands.report_goal).toBeDefined();
  const snapshot = await (await request(`/v1/threads/${run.thread_id}/snapshot`)).json();
  expect(snapshot.goals[0].id).toBe(input.goal_id);
  const inventory = await (
    await request(`/v1/threads/${run.thread_id}/goals?agent_id=${run.agent_id}`)
  ).json();
  expect(inventory.goals).toHaveLength(1);
});

test("an active linked Routine owns its wakeups and cannot race a second continuation", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  await routine(goals, run, goal.id);
  const current = await f.store.get("goal", goal.id);
  await expect(
    (async () =>
      goals.report(run.id, {
        goal_id: goal.id,
        expected_revision: current.revision,
        progress: "Scheduled",
        disposition: "continue",
        continuation: { at: "2026-10-31T00:00:00.000Z", instruction: "Do the same work" },
      }))(),
  ).rejects.toThrow("CONFLICT");
  await goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "The Routine owns checks.",
    disposition: "scheduled",
  });
  await finish(run);
  await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect(await f.store.list("run")).toHaveLength(2);
  expect(await f.store.list("occurrence")).toHaveLength(1);
  expect(
    (await f.store.list("run")).filter((r) => r.goal_id === goal.id && !r.routine_id),
  ).toHaveLength(0);
});

test("completion from an unsuccessful native run remains blocked with evidence retained", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  const result = await artifact(run);
  await goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Produced bytes but native turn did not finish.",
    disposition: "completed",
    evidence_artifact_ids: [result.id],
  });
  await finish(run, "failed");
  await goals.advance();
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    state: "active",
    work_state: "blocked",
    evidence_artifact_ids: [result.id],
  });
  expect(await f.store.list("run")).toHaveLength(1);
});

test("explicit resume continues a stopped known run while unknown source receipts remain fenced", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  await f.lifecycle.controlGoal(goal.id, "paused");
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  await f.lifecycle.controlGoal(goal.id, "active");
  await goals.advance();
  const next = (await f.store.get("goal", goal.id)).current_run_id;
  expect(next).not.toBe(run.id);
  expect((await f.store.get("run", next as string)).status).toBe("queued");
  const native = await start(next as string);
  await f.restart();
  await f.lifecycle.controlGoal(goal.id, "paused");
  await f.lifecycle.controlGoal(goal.id, "active");
  await new Goals(f.lifecycle).advance();
  expect((await f.store.get("run", native.id)).status).toBe("unknown");
  expect(await f.store.list("run")).toHaveLength(2);
});

test("membership removal preserves group responsibilities and invalidates the removed assignment", async () => {
  const goals = await setup();
  const peer = await f.lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const source = await f.lifecycle.admit({
    thread_id: group.id,
    agent_id: f.agent.id,
    text: "Track this responsibility",
  });
  const run = await start(source.run.id);
  const goal = await capture(goals, run);
  const r = await routine(goals, run);
  await finish(run);
  const groups = new Groups(f.lifecycle);
  const removed = await groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  await groups.membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  await new Background(f.lifecycle).tick(new Date("2026-11-01T00:00:00Z"));
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  expect((await f.store.get("goal", goal.id)).coordinator_agent_id).toBeNull();
  expect((await f.store.get("routine", r.id)).state).toBe("active");
  expect((await f.store.list("run")).filter((run) => run.thread_id === group.id)).toHaveLength(1);
});

test("completion rechecks evidence bytes after reporting and blocks a tampered artifact", async () => {
  const goals = await setup();
  const run = await start();
  const goal = await capture(goals, run);
  const result = await artifact(run);
  await goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Result prepared.",
    disposition: "completed",
    evidence_artifact_ids: [result.id],
  });
  writeFileSync(join(new Artifacts(f.lifecycle).blobRoot, result.storage_key), "Changed bytes");
  await finish(run);
  await goals.advance();
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    state: "active",
    work_state: "blocked",
  });
  expect((await f.store.get("goal", goal.id)).progress).toContain("evidence could not be verified");
});

test("a meaningful artifact after a quiet decision restores final publication", async () => {
  const goals = await setup();
  const source = await start();
  const r = await routine(goals, source);
  await finish(source);
  const occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-10-31T00:00:00Z"));
  const run = await start((occurrence as Entity<"occurrence">).run_id);
  await goals.noUpdate(run.id);
  await artifact(run);
  expect((await f.store.get("run", run.id)).publication).toBe("deferred");
  await f.lifecycle.appendAnswer(run.id, "A useful result is available.");
  await finish(run);
  expect((await f.store.answer(run.id))?.text).toBe("A useful result is available.");
});

test("a source run cannot undo its yield, publish future result bytes or complete the deferred goal", async () => {
  const goals = await setup();
  const c = new Connections(f.lifecycle);
  const connection = await c.get((await f.store.get("agent", f.agent.id)).connection_id);
  await c.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const run = await start();
  const goal = await capture(goals, run);
  const result = await artifact(run);
  const deferred = await goals.report(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "First stage is ready.",
    disposition: "continue",
    continuation: { at: "2026-11-02T00:00:00.000Z", instruction: "Do the future stage." },
  });
  await expect(
    (async () =>
      goals.report(run.id, {
        goal_id: goal.id,
        expected_revision: deferred.revision,
        progress: "Ran early",
        disposition: "completed",
        evidence_artifact_ids: [result.id],
      }))(),
  ).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  await expect(
    (async () =>
      goals.capture(run.id, {
        goal_id: goal.id,
        expected_revision: deferred.revision,
        title: goal.title,
        objective: goal.objective,
        source_message_id: run.input_message_id,
      }))(),
  ).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(await f.store.get("run", run.id));
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.create_file", {
      command_id: crypto.randomUUID(),
      path: "early-final.txt",
      text: "Too early",
    }),
  ).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  const files = new Artifacts(f.lifecycle);
  (await files.workspaces.files(run.workspace_id as string)).create(
    "native-early.txt",
    Buffer.from("Untrusted native early write"),
  );
  await expect(
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
  ).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  await f.lifecycle.appendAnswer(run.id, "I already finished the future stage.");
  await finish(run);
  expect((await f.store.answer(run.id))?.text).toContain("First stage is ready.");
  expect((await f.store.answer(run.id))?.text).not.toContain("already finished");
  await f.restart();
  await new Goals(f.lifecycle).advance(new Date("2026-11-02T00:00:00Z"));
  const next = await start((await f.store.get("goal", goal.id)).current_run_id as string);
  const current = await f.store.get("goal", goal.id);
  const final = await artifact(next);
  await new Goals(f.lifecycle).report(next.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "The authorized later stage produced evidence.",
    disposition: "completed",
    evidence_artifact_ids: [final.id],
  });
  await finish(next);
  await new Goals(f.lifecycle).advance();
  expect((await f.store.get("goal", goal.id)).state).toBe("completed");
});

test("a later conversational schedule edit binds its source run before allowing another occurrence", async () => {
  const goals = await setup();
  const source = await start();
  const goal = await capture(goals, source);
  const r = await routine(goals, source, goal.id);
  await finish(source);
  const editor = await start();
  const current = await f.store.get("routine", r.id);
  await goals.writeRoutine(editor.id, {
    routine_id: r.id,
    expected_revision: current.revision,
    goal_id: goal.id,
    instruction: "Use the corrected schedule",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00.000Z" },
  });
  expect((await f.store.get("goal", goal.id)).current_run_id).toBe(editor.id);
  expect(await f.lifecycle.fireRoutine(r.id, new Date("2026-11-02T00:00:01Z"))).toBeNull();
  await expect(artifact(editor)).rejects.toThrow("RESPONSIBILITY_DEFERRED");
  await finish(editor);
  const occurrence = await f.lifecycle.fireRoutine(r.id, new Date("2026-11-02T00:00:01Z"));
  expect(occurrence).not.toBeNull();
});
