import { afterEach, expect, test } from "bun:test";
import { Artifacts } from "../../src/artifacts";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Conversations } from "../../src/conversations";
import { GroupSchedules } from "../../src/goals/group-schedules";
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
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const peer = await f.lifecycle.createAgent({
    name: "Reviewer",
    harness: "codex",
    connection_id: connection.id,
  });
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const route = await new Groups(f.lifecycle).send(group.id, {
    agent_id: f.agent.id,
    text: "Prepare the summary, then ask the reviewer for an example.",
  });
  const run = await start((await f.store.get("peer_task", route.task_id)).current_run_id);
  const goals = new Goals(f.lifecycle);
  const goal = await goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Summary and example",
    objective: "Publish a useful summary and a reviewed example.",
    source_message_id: run.input_message_id,
  });
  return { peer, group, run, goal, goals };
}
async function start(id: string) {
  const queued = await f.store.get("run", id);
  if (
    !(await f.store.list("binding")).some(
      (b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id,
    )
  )
    await f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = await f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("The workspace is not available.");
  await f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
  return await f.store.get("run", run.id);
}
async function finish(run: Entity<"run">, text = "The requested result is available.") {
  await f.lifecycle.appendAnswer(run.id, text);
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
}
async function publish(run: Entity<"run">, path: string) {
  const files = new Artifacts(f.lifecycle);
  (await files.workspaces.files(run.workspace_id as string)).create(
    path,
    Buffer.from(`Useful result: ${path}`),
  );
  return await files.publish(
    crypto.randomUUID(),
    { workspace_id: run.workspace_id, run_id: run.id, path, media_type: "text/plain" },
    async () => await f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
}

test("shared goals accept exact parent/child evidence after restart and finalize once without a duplicate answer", async () => {
  const { peer, group, run, goal, goals } = await setup();
  const summary = await publish(run, "summary.txt");
  expect(goal).toMatchObject({ scope: "group", agent_id: null, coordinator_agent_id: f.agent.id });
  expect(
    (await goals.list({ thread_id: group.id, agent_id: peer.id })).goals.map((g) => g.id),
  ).toEqual([goal.id]);
  const child = await new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: "Read the source and prepare an example. Internal bookkeeping stays here.",
    purpose: "handoff",
    summary: "Prepare a concrete example",
    continuation: "finalize",
  });
  await finish(run, "Here is the summary.");
  const review = await start(child.current_run_id);
  await expect(
    (async () =>
      goals.report(review.id, {
        goal_id: goal.id,
        expected_revision: goal.revision,
        progress: "Done",
        disposition: "completed",
        evidence_artifact_ids: [summary.id],
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  const example = await publish(review, "example.txt");
  await finish(review, "Here is the example.");
  await f.restart();
  await new Groups(f.lifecycle).advance();
  await new Groups(f.lifecycle).advance();
  await new Goals(f.lifecycle).advance();
  const task = await f.store.get("peer_task", run.task_id);
  const resumed = await start(task.current_run_id);
  expect(resumed.response_mode).toBe("finalize");
  const current = await f.store.get("goal", goal.id);
  await new Goals(f.lifecycle).report(resumed.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "Summary and example are published.",
    disposition: "completed",
    evidence_artifact_ids: [summary.id, example.id],
  });
  await finish(resumed, "Administrative finalization only.");
  await new Groups(f.lifecycle).advance();
  await new Goals(f.lifecycle).advance();
  const count = (await f.store.list("run")).length;
  await new Background(f.lifecycle).tick();
  expect(await f.store.list("run")).toHaveLength(count);
  expect((await f.store.get("goal", goal.id)).state).toBe("completed");
  expect(
    (await new Conversations(f.lifecycle).snapshot(group.id)).messages.filter(
      (m) => m.author === "agent" && m.purpose === "conversation",
    ),
  ).toHaveLength(2);
  expect((await f.store.get("peer_task", child.id)).result_artifact_ids).toEqual([example.id]);
});

test("a definitive report failure is durable through the actual tool transaction and does not start another finalizer", async () => {
  const { run, goal } = await setup();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const privateFile = await files.upload(workspace.id, crypto.randomUUID(), {
    name: "private.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Private evidence").toString("base64"),
  });
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(run);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.report_goal", {
      command_id: crypto.randomUUID(),
      goal_id: goal.id,
      expected_revision: goal.revision,
      progress: "Attempt completion",
      disposition: "completed",
      evidence_artifact_ids: [privateFile.id],
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    work_state: "blocked",
    continuation_at: null,
    last_report_error: { run_id: run.id, code: "SCOPE_DENIED" },
  });
  expect((await f.store.get("run", run.id)).tool_errors.at(-1)?.code).toBe("SCOPE_DENIED");
  await finish(run);
  await new Groups(f.lifecycle).advance();
  await new Goals(f.lifecycle).advance();
  expect(await f.store.list("run")).toHaveLength(1);
});

test("artifact evidence cannot cross an objective generation even when the producer identity is retained", async () => {
  const { run, goal, goals } = await setup();
  const old = await publish(run, "old.txt");
  const corrected = await goals.capture(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    title: "Corrected objective",
    objective: "Create a corrected example.",
    source_message_id: run.input_message_id,
  });
  await expect(
    (async () =>
      goals.report(run.id, {
        goal_id: goal.id,
        expected_revision: corrected.revision,
        progress: "Old result",
        disposition: "completed",
        evidence_artifact_ids: [old.id],
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("friendly history and event projections preserve technical requests only in owner diagnostics", async () => {
  const { peer, group, run } = await setup();
  const secret = "INTERNAL_TASK_CANARY_8472";
  const child = await new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: secret,
    purpose: "review",
    summary: "Review the example",
  });
  const original = await f.store.get("message", child.request_message_id);
  expect(original.text).toBe(secret);
  expect(
    (await new Conversations(f.lifecycle).snapshot(group.id)).messages.find(
      (m) => m.id === original.id,
    )?.text,
  ).toBe("Review the example");
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), "r".repeat(64));
  const response = await app.handle(
    new Request("http://localhost/v1/events?after=0&limit=1000", {
      headers: { Authorization: `Bearer ${"r".repeat(64)}` },
    }),
  );
  expect(await response.text()).not.toContain(secret);
  expect(
    (await new Conversations(f.lifecycle).history(group.id, { limit: 1 })).messages,
  ).toHaveLength(1);
});

test("automatic Routine selection persists one occurrence before routing and one group execution across restart", async () => {
  const { peer, run, goals, group } = await setup();
  const routine = await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Check the latest result without sending a no-change update.",
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "auto" },
  });
  await finish(run);
  const pending = (await f.lifecycle.fireRoutine(routine.id, new Date())) as Entity<"occurrence">;
  expect(pending.state).toBe("routing");
  expect(pending.run_id).toBeNull();
  const route = await f.store.get("group_route", pending.route_id);
  const routing = await start(route.router_run_id as string);
  await finish(routing, JSON.stringify({ agent_id: peer.id }));
  await f.restart();
  await new Groups(f.lifecycle).advance();
  const selected = (await f.lifecycle.fireRoutine(routine.id, new Date())) as Entity<"occurrence">;
  expect(selected.selected_agent_id).toBe(peer.id);
  const ids = (await f.store.list("run")).map((r) => r.id);
  await f.lifecycle.fireRoutine(routine.id, new Date());
  expect((await f.store.list("run")).map((r) => r.id)).toEqual(ids);
  const scheduled = await start(selected.run_id as string);
  expect(scheduled.thread_id).toBe(group.id);
  await new Goals(f.lifecycle).noUpdate(scheduled.id);
  await finish(scheduled, "Nothing changed.");
  await new Groups(f.lifecycle).advance();
  await new GroupSchedules(f.lifecycle).advance();
  expect((await f.store.get("occurrence", pending.id)).state).toBe("completed");
  expect(await f.store.answer(scheduled.id)).toBeNull();
  expect(await f.store.list("occurrence")).toHaveLength(1);
});

test("fixed Routine keeps its group identity when a target leaves and never overlaps unknown work", async () => {
  const { peer, group, run, goals } = await setup();
  const routine = await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Prepare a recurring report",
    timezone: "UTC",
    schedule: { type: "interval", anchor_at: "2026-11-02T00:00:00Z", every_ms: 1000 },
    execution_target: { type: "agent", agent_id: peer.id },
  });
  await finish(run);
  const groups = new Groups(f.lifecycle);
  await groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  const waiting = (await f.lifecycle.fireRoutine(routine.id, new Date())) as Entity<"occurrence">;
  expect(waiting.state).toBe("waiting_assignment");
  expect(await f.store.get("routine", routine.id)).toMatchObject({
    scope: "group",
    state: "active",
    assignment_state: "waiting_assignment",
  });
  const removed = await f.store.get("thread", group.id);
  await groups.membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  const admitted = (await f.lifecycle.fireRoutine(routine.id, new Date())) as Entity<"occurrence">;
  await start(admitted.run_id as string);
  await f.restart();
  await new GroupSchedules(f.lifecycle).advance();
  await f.lifecycle.fireRoutine(routine.id, new Date());
  expect((await f.store.get("occurrence", waiting.id)).state).toBe("unknown");
  expect(await f.store.list("occurrence")).toHaveLength(1);
});

test("removing an unknown coordinator holds reassignment until a native receipt resolves the old execution", async () => {
  const { peer, group, run, goal } = await setup();
  await f.restart();
  await new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  await new Goals(f.lifecycle).advance();
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    state: "active",
    coordinator_agent_id: null,
    assignment_route_id: null,
  });
  const unknown = await f.store.get("run", run.id);
  await f.lifecycle.reconcile(unknown.id, unknown.revision, "cancelled", crypto.randomUUID());
  await new Goals(f.lifecycle).advance();
  expect((await f.store.get("goal", goal.id)).assignment_route_id).not.toBeNull();
});

test("legacy agent-owned group goals normalize once while original identity and execution provenance survive", async () => {
  const { goal, run } = await setup();
  const current = await f.store.get("goal", goal.id);
  await f.store.put(
    {
      ...current,
      revision: current.revision + 1,
      scope: "agent",
      agent_id: f.agent.id,
      coordinator_agent_id: null,
      created_by_agent_id: null,
    },
    current.revision,
  );
  await finish(run);
  await f.restart();
  const upgraded = await f.store.get("goal", goal.id);
  expect(upgraded).toMatchObject({
    scope: "group",
    agent_id: null,
    coordinator_agent_id: f.agent.id,
    created_by_agent_id: f.agent.id,
  });
  const revision = upgraded.revision;
  await f.restart();
  expect((await f.store.get("goal", goal.id)).revision).toBe(revision);
});

test("pausing a Routine retains an unknown native occurrence without event polling or false stop confirmation", async () => {
  const { peer, run, goals } = await setup();
  const routine = await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Prepare the scheduled result",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "agent", agent_id: peer.id },
  });
  await finish(run);
  const occurrence = (await f.lifecycle.fireRoutine(
    routine.id,
    new Date(),
  )) as Entity<"occurrence">;
  const native = await start(occurrence.run_id as string);
  await f.restart();
  const current = await f.store.get("routine", routine.id);
  await new Goals(f.lifecycle).controlRoutine(
    { thread_id: routine.thread_id, agent_id: null },
    { routine_id: routine.id, expected_revision: current.revision, state: "paused" },
  );
  await new GroupSchedules(f.lifecycle).advance();
  expect((await f.store.get("occurrence", occurrence.id)).state).toBe("unknown");
  const cursor = await f.store.cursor;
  await new GroupSchedules(f.lifecycle).advance();
  expect(await f.store.cursor).toBe(cursor);
  const unknown = await f.store.get("run", native.id);
  await f.lifecycle.reconcile(unknown.id, unknown.revision, "cancelled", crypto.randomUUID());
  await new GroupSchedules(f.lifecycle).advance();
  expect((await f.store.get("occurrence", occurrence.id)).state).toBe("cancelled");
});

test("coordinator reassignment returns the committed self-stop receipt and continues only after native stop", async () => {
  const { peer, run, goal, group } = await setup();
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(run);
  const result = (await tools.call(lease.token, lease.scope, "ngertiin.assign_goal", {
    command_id: crypto.randomUUID(),
    goal_id: goal.id,
    expected_revision: goal.revision,
    agent_id: peer.id,
  })) as Entity<"goal">;
  expect(result.coordinator_agent_id).toBe(peer.id);
  expect((await f.store.get("run", run.id)).cancellation).toBe("requested");
  await new Goals(f.lifecycle).advance();
  expect(await f.store.list("run")).toHaveLength(1);
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  await new Groups(f.lifecycle).advance();
  // The next scheduler tick observes the freshly recorded continuation time.
  await new Goals(f.lifecycle).advance(new Date(Date.now() + 1000));
  const assigned = await f.store.get("goal", goal.id);
  expect(assigned.work_state).toBe("ready");
  expect((await f.store.get("run", assigned.current_run_id)).agent_id).toBe(peer.id);
  expect((await f.store.get("goal", goal.id)).thread_id).toBe(group.id);
});

test("owner recovery restores legacy child evidence when the latest goal continuation had no task", async () => {
  const { peer, group, run, goal } = await setup();
  const summary = await publish(run, "summary.txt");
  const child = await new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: "Publish the example",
    purpose: "review",
  });
  await finish(run);
  const review = await start(child.current_run_id);
  const example = await publish(review, "example.txt");
  await finish(review);
  await new Groups(f.lifecycle).advance();
  await new Groups(f.lifecycle).advance();
  const resumed = await start((await f.store.get("peer_task", run.task_id)).current_run_id);
  await finish(resumed);
  await new Groups(f.lifecycle).advance();
  const source = await f.lifecycle.admit({
    thread_id: group.id,
    agent_id: run.agent_id,
    goal_id: goal.id,
    text: "Finalize the existing responsibility.",
  });
  const last = await start(source.run.id);
  await finish(last);
  const current = await f.store.get("goal", goal.id);
  await f.store.put(
    {
      ...current,
      revision: current.revision + 1,
      scope: "agent",
      agent_id: run.agent_id,
      coordinator_agent_id: null,
      root_task_id: null,
      current_run_id: last.id,
      source_run_ids: [run.id, resumed.id, last.id],
      work_state: "blocked",
    },
    current.revision,
  );
  await f.restart();
  const upgraded = await f.store.get("goal", goal.id);
  expect(upgraded.root_task_id).toBe(run.task_id);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), "r".repeat(64));
  const key = crypto.randomUUID();
  const body = {
    expected_revision: upgraded.revision,
    progress: "The summary and example were already published.",
    evidence_artifact_ids: [summary.id, example.id],
  };
  const request = () =>
    app.handle(
      new Request(`http://localhost/v1/goals/${goal.id}/recover-completion`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"r".repeat(64)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      }),
    );
  const response = await request();
  expect(response.status).toBe(200);
  expect((await response.json()).state).toBe("completed");
  const cursor = await f.store.cursor;
  const count = (await f.store.list("run")).length;
  expect((await request()).status).toBe(200);
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("run")).toHaveLength(count);
});

test("an automatic occurrence cannot apply a selected result after membership changes", async () => {
  const { peer, group, run, goals } = await setup();
  const routine = await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Check the shared files",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "auto" },
  });
  await finish(run);
  const occurrence = (await f.lifecycle.fireRoutine(
    routine.id,
    new Date(),
  )) as Entity<"occurrence">;
  const route = await f.store.get("group_route", occurrence.route_id);
  await finish(await start(route.router_run_id as string), JSON.stringify({ agent_id: peer.id }));
  await new Groups(f.lifecycle).advance();
  await new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id, f.agent.id],
  });
  const blocked = (await f.lifecycle.fireRoutine(routine.id, new Date())) as Entity<"occurrence">;
  expect(blocked).toMatchObject({ state: "blocked", run_id: null });
  expect((await f.store.get("routine", routine.id)).error_code).toBe("ROUTING_STALE");
});

test("a coordinator selection that became stale blocks without retrying or admitting work", async () => {
  const { peer, group, run, goal } = await setup();
  await finish(run);
  const removed = await new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  await new Groups(f.lifecycle).advance();
  await new Goals(f.lifecycle).advance();
  const route = await f.store.get(
    "group_route",
    (await f.store.get("goal", goal.id)).assignment_route_id,
  );
  await finish(await start(route.router_run_id as string), JSON.stringify({ agent_id: peer.id }));
  await new Groups(f.lifecycle).advance();
  await new Groups(f.lifecycle).membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [peer.id, f.agent.id],
  });
  await new Goals(f.lifecycle).advance();
  expect(await f.store.get("goal", goal.id)).toMatchObject({
    coordinator_agent_id: null,
    work_state: "blocked",
  });
  const cursor = await f.store.cursor;
  await new Goals(f.lifecycle).advance();
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("run")).toHaveLength(2);
});
