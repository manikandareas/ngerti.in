import { afterEach, expect, test } from "bun:test";
import { createApi } from "../../src/api";
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

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function setup() {
  f = fixture();
  const connection = f.store.get("connection", f.store.get("agent", f.agent.id).connection_id);
  new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const peer = f.lifecycle.createAgent({
    name: "Reviewer",
    harness: "codex",
    connection_id: connection.id,
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const route = new Groups(f.lifecycle).send(group.id, {
    agent_id: f.agent.id,
    text: "Prepare the summary, then ask the reviewer for an example.",
  });
  const run = start(f.store.get("peer_task", route.task_id).current_run_id);
  const goals = new Goals(f.lifecycle);
  const goal = goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Summary and example",
    objective: "Publish a useful summary and a reviewed example.",
    source_message_id: run.input_message_id,
  });
  return { peer, group, run, goal, goals };
}
function start(id: string) {
  const queued = f.store.get("run", id);
  if (
    !f.store
      .list("binding")
      .some((b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id)
  )
    f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("The workspace is not available.");
  f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
  return f.store.get("run", run.id);
}
function finish(run: Entity<"run">, text = "The requested result is available.") {
  f.lifecycle.appendAnswer(run.id, text);
  f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
}
function publish(run: Entity<"run">, path: string) {
  const files = new Artifacts(f.lifecycle);
  files.workspaces
    .files(run.workspace_id as string)
    .create(path, Buffer.from(`Useful result: ${path}`));
  return files.publish(
    crypto.randomUUID(),
    { workspace_id: run.workspace_id, run_id: run.id, path, media_type: "text/plain" },
    () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
}

test("shared goals accept exact parent/child evidence after restart and finalize once without a duplicate answer", () => {
  const { peer, group, run, goal, goals } = setup();
  const summary = publish(run, "summary.txt");
  expect(goal).toMatchObject({ scope: "group", agent_id: null, coordinator_agent_id: f.agent.id });
  expect(goals.list({ thread_id: group.id, agent_id: peer.id }).goals.map((g) => g.id)).toEqual([
    goal.id,
  ]);
  const child = new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: "Read the source and prepare an example. Internal bookkeeping stays here.",
    purpose: "handoff",
    summary: "Prepare a concrete example",
    continuation: "finalize",
  });
  finish(run, "Here is the summary.");
  const review = start(child.current_run_id);
  expect(() =>
    goals.report(review.id, {
      goal_id: goal.id,
      expected_revision: goal.revision,
      progress: "Done",
      disposition: "completed",
      evidence_artifact_ids: [summary.id],
    }),
  ).toThrow("SCOPE_DENIED");
  const example = publish(review, "example.txt");
  finish(review, "Here is the example.");
  f.restart();
  new Groups(f.lifecycle).advance();
  new Groups(f.lifecycle).advance();
  new Goals(f.lifecycle).advance();
  const task = f.store.get("peer_task", run.task_id);
  const resumed = start(task.current_run_id);
  expect(resumed.response_mode).toBe("finalize");
  const current = f.store.get("goal", goal.id);
  new Goals(f.lifecycle).report(resumed.id, {
    goal_id: goal.id,
    expected_revision: current.revision,
    progress: "Summary and example are published.",
    disposition: "completed",
    evidence_artifact_ids: [summary.id, example.id],
  });
  finish(resumed, "Administrative finalization only.");
  new Groups(f.lifecycle).advance();
  new Goals(f.lifecycle).advance();
  const count = f.store.list("run").length;
  new Background(f.lifecycle).tick();
  expect(f.store.list("run")).toHaveLength(count);
  expect(f.store.get("goal", goal.id).state).toBe("completed");
  expect(
    new Conversations(f.lifecycle)
      .snapshot(group.id)
      .messages.filter((m) => m.author === "agent" && m.purpose === "conversation"),
  ).toHaveLength(2);
  expect(f.store.get("peer_task", child.id).result_artifact_ids).toEqual([example.id]);
});

test("a definitive report failure is durable through the actual tool transaction and does not start another finalizer", async () => {
  const { run, goal } = setup();
  const files = new Artifacts(f.lifecycle);
  const workspace = files.workspaces.ensure(f.thread.id, f.agent.id);
  const privateFile = files.upload(workspace.id, crypto.randomUUID(), {
    name: "private.txt",
    media_type: "text/plain",
    content_base64: Buffer.from("Private evidence").toString("base64"),
  });
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(run);
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
  expect(f.store.get("goal", goal.id)).toMatchObject({
    work_state: "blocked",
    continuation_at: null,
    last_report_error: { run_id: run.id, code: "SCOPE_DENIED" },
  });
  expect(f.store.get("run", run.id).tool_errors.at(-1)?.code).toBe("SCOPE_DENIED");
  finish(run);
  new Groups(f.lifecycle).advance();
  new Goals(f.lifecycle).advance();
  expect(f.store.list("run")).toHaveLength(1);
});

test("artifact evidence cannot cross an objective generation even when the producer identity is retained", () => {
  const { run, goal, goals } = setup();
  const old = publish(run, "old.txt");
  const corrected = goals.capture(run.id, {
    goal_id: goal.id,
    expected_revision: goal.revision,
    title: "Corrected objective",
    objective: "Create a corrected example.",
    source_message_id: run.input_message_id,
  });
  expect(() =>
    goals.report(run.id, {
      goal_id: goal.id,
      expected_revision: corrected.revision,
      progress: "Old result",
      disposition: "completed",
      evidence_artifact_ids: [old.id],
    }),
  ).toThrow("SCOPE_DENIED");
});

test("friendly history and event projections preserve technical requests only in owner diagnostics", async () => {
  const { peer, group, run } = setup();
  const secret = "INTERNAL_TASK_CANARY_8472";
  const child = new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: secret,
    purpose: "review",
    summary: "Review the example",
  });
  const original = f.store.get("message", child.request_message_id);
  expect(original.text).toBe(secret);
  expect(
    new Conversations(f.lifecycle).snapshot(group.id).messages.find((m) => m.id === original.id)
      ?.text,
  ).toBe("Review the example");
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "r".repeat(64));
  const response = await app.handle(
    new Request("http://localhost/v1/events?after=0&limit=1000", {
      headers: { Authorization: `Bearer ${"r".repeat(64)}` },
    }),
  );
  expect(await response.text()).not.toContain(secret);
  expect(new Conversations(f.lifecycle).history(group.id, { limit: 1 }).messages).toHaveLength(1);
});

test("automatic Routine selection persists one occurrence before routing and one group execution across restart", () => {
  const { peer, run, goals, group } = setup();
  const routine = goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Check the latest result without sending a no-change update.",
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "auto" },
  });
  finish(run);
  const pending = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  expect(pending.state).toBe("routing");
  expect(pending.run_id).toBeNull();
  const route = f.store.get("group_route", pending.route_id);
  const routing = start(route.router_run_id as string);
  finish(routing, JSON.stringify({ agent_id: peer.id }));
  f.restart();
  new Groups(f.lifecycle).advance();
  const selected = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  expect(selected.selected_agent_id).toBe(peer.id);
  const ids = f.store.list("run").map((r) => r.id);
  f.lifecycle.fireRoutine(routine.id, new Date());
  expect(f.store.list("run").map((r) => r.id)).toEqual(ids);
  const scheduled = start(selected.run_id as string);
  expect(scheduled.thread_id).toBe(group.id);
  new Goals(f.lifecycle).noUpdate(scheduled.id);
  finish(scheduled, "Nothing changed.");
  new Groups(f.lifecycle).advance();
  new GroupSchedules(f.lifecycle).advance();
  expect(f.store.get("occurrence", pending.id).state).toBe("completed");
  expect(f.store.answer(scheduled.id)).toBeNull();
  expect(f.store.list("occurrence")).toHaveLength(1);
});

test("fixed Routine keeps its group identity when a target leaves and never overlaps unknown work", () => {
  const { peer, group, run, goals } = setup();
  const routine = goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Prepare a recurring report",
    timezone: "UTC",
    schedule: { type: "interval", anchor_at: "2026-11-02T00:00:00Z", every_ms: 1000 },
    execution_target: { type: "agent", agent_id: peer.id },
  });
  finish(run);
  const groups = new Groups(f.lifecycle);
  groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  const waiting = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  expect(waiting.state).toBe("waiting_assignment");
  expect(f.store.get("routine", routine.id)).toMatchObject({
    scope: "group",
    state: "active",
    assignment_state: "waiting_assignment",
  });
  const removed = f.store.get("thread", group.id);
  groups.membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  const admitted = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  start(admitted.run_id as string);
  f.restart();
  new GroupSchedules(f.lifecycle).advance();
  f.lifecycle.fireRoutine(routine.id, new Date());
  expect(f.store.get("occurrence", waiting.id).state).toBe("unknown");
  expect(f.store.list("occurrence")).toHaveLength(1);
});

test("removing an unknown coordinator holds reassignment until a native receipt resolves the old execution", () => {
  const { peer, group, run, goal } = setup();
  f.restart();
  new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  new Goals(f.lifecycle).advance();
  expect(f.store.get("goal", goal.id)).toMatchObject({
    state: "active",
    coordinator_agent_id: null,
    assignment_route_id: null,
  });
  const unknown = f.store.get("run", run.id);
  f.lifecycle.reconcile(unknown.id, unknown.revision, "cancelled", crypto.randomUUID());
  new Goals(f.lifecycle).advance();
  expect(f.store.get("goal", goal.id).assignment_route_id).not.toBeNull();
});

test("legacy agent-owned group goals normalize once while original identity and execution provenance survive", () => {
  const { goal, run } = setup();
  const current = f.store.get("goal", goal.id);
  f.store.put(
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
  finish(run);
  f.restart();
  const upgraded = f.store.get("goal", goal.id);
  expect(upgraded).toMatchObject({
    scope: "group",
    agent_id: null,
    coordinator_agent_id: f.agent.id,
    created_by_agent_id: f.agent.id,
  });
  const revision = upgraded.revision;
  f.restart();
  expect(f.store.get("goal", goal.id).revision).toBe(revision);
});

test("pausing a Routine retains an unknown native occurrence without event polling or false stop confirmation", () => {
  const { peer, run, goals } = setup();
  const routine = goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Prepare the scheduled result",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "agent", agent_id: peer.id },
  });
  finish(run);
  const occurrence = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  const native = start(occurrence.run_id as string);
  f.restart();
  const current = f.store.get("routine", routine.id);
  new Goals(f.lifecycle).controlRoutine(
    { thread_id: routine.thread_id, agent_id: null },
    { routine_id: routine.id, expected_revision: current.revision, state: "paused" },
  );
  new GroupSchedules(f.lifecycle).advance();
  expect(f.store.get("occurrence", occurrence.id).state).toBe("unknown");
  const cursor = f.store.cursor;
  new GroupSchedules(f.lifecycle).advance();
  expect(f.store.cursor).toBe(cursor);
  const unknown = f.store.get("run", native.id);
  f.lifecycle.reconcile(unknown.id, unknown.revision, "cancelled", crypto.randomUUID());
  new GroupSchedules(f.lifecycle).advance();
  expect(f.store.get("occurrence", occurrence.id).state).toBe("cancelled");
});

test("coordinator reassignment returns the committed self-stop receipt and continues only after native stop", async () => {
  const { peer, run, goal, group } = setup();
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(run);
  const result = (await tools.call(lease.token, lease.scope, "ngertiin.assign_goal", {
    command_id: crypto.randomUUID(),
    goal_id: goal.id,
    expected_revision: goal.revision,
    agent_id: peer.id,
  })) as Entity<"goal">;
  expect(result.coordinator_agent_id).toBe(peer.id);
  expect(f.store.get("run", run.id).cancellation).toBe("requested");
  new Goals(f.lifecycle).advance();
  expect(f.store.list("run")).toHaveLength(1);
  f.lifecycle.settle(run.id, run.dispatch_token as string, "cancelled");
  new Groups(f.lifecycle).advance();
  new Goals(f.lifecycle).advance();
  const assigned = f.store.get("goal", goal.id);
  expect(assigned.work_state).toBe("ready");
  expect(f.store.get("run", assigned.current_run_id).agent_id).toBe(peer.id);
  expect(f.store.get("goal", goal.id).thread_id).toBe(group.id);
});

test("owner recovery restores legacy child evidence when the latest goal continuation had no task", async () => {
  const { peer, group, run, goal } = setup();
  const summary = publish(run, "summary.txt");
  const child = new Groups(f.lifecycle).handoff(run.id, {
    agent_id: peer.id,
    instruction: "Publish the example",
    purpose: "review",
  });
  finish(run);
  const review = start(child.current_run_id);
  const example = publish(review, "example.txt");
  finish(review);
  new Groups(f.lifecycle).advance();
  new Groups(f.lifecycle).advance();
  const resumed = start(f.store.get("peer_task", run.task_id).current_run_id);
  finish(resumed);
  new Groups(f.lifecycle).advance();
  const source = f.lifecycle.admit({
    thread_id: group.id,
    agent_id: run.agent_id,
    goal_id: goal.id,
    text: "Finalize the existing responsibility.",
  });
  const last = start(source.run.id);
  finish(last);
  const current = f.store.get("goal", goal.id);
  f.store.put(
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
  f.restart();
  const upgraded = f.store.get("goal", goal.id);
  expect(upgraded.root_task_id).toBe(run.task_id);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "r".repeat(64));
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
  const cursor = f.store.cursor;
  const count = f.store.list("run").length;
  expect((await request()).status).toBe(200);
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("run")).toHaveLength(count);
});

test("an automatic occurrence cannot apply a selected result after membership changes", () => {
  const { peer, group, run, goals } = setup();
  const routine = goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    instruction: "Check the shared files",
    timezone: "UTC",
    schedule: { type: "once", at: "2026-11-02T00:00:00Z" },
    execution_target: { type: "auto" },
  });
  finish(run);
  const occurrence = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  const route = f.store.get("group_route", occurrence.route_id);
  finish(start(route.router_run_id as string), JSON.stringify({ agent_id: peer.id }));
  new Groups(f.lifecycle).advance();
  new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id, f.agent.id],
  });
  const blocked = f.lifecycle.fireRoutine(routine.id, new Date()) as Entity<"occurrence">;
  expect(blocked).toMatchObject({ state: "blocked", run_id: null });
  expect(f.store.get("routine", routine.id).error_code).toBe("ROUTING_STALE");
});

test("a coordinator selection that became stale blocks without retrying or admitting work", () => {
  const { peer, group, run, goal } = setup();
  finish(run);
  const removed = new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [peer.id],
  });
  new Groups(f.lifecycle).advance();
  new Goals(f.lifecycle).advance();
  const route = f.store.get("group_route", f.store.get("goal", goal.id).assignment_route_id);
  finish(start(route.router_run_id as string), JSON.stringify({ agent_id: peer.id }));
  new Groups(f.lifecycle).advance();
  new Groups(f.lifecycle).membership(group.id, {
    expected_revision: removed.revision,
    member_agent_ids: [peer.id, f.agent.id],
  });
  new Goals(f.lifecycle).advance();
  expect(f.store.get("goal", goal.id)).toMatchObject({
    coordinator_agent_id: null,
    work_state: "blocked",
  });
  const cursor = f.store.cursor;
  new Goals(f.lifecycle).advance();
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("run")).toHaveLength(2);
});
