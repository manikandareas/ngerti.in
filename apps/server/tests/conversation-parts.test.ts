import { Database } from "bun:sqlite";
import { afterEach, expect, test } from "bun:test";
import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import { createApi } from "../src/api";
import { Artifacts } from "../src/artifacts";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { routineDisplayName } from "../src/conversations/labels";
import { publicReferences } from "../src/conversations/references";
import { Goals } from "../src/goals/service";
import { Groups } from "../src/groups/service";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());

test("Tobi public receipts preserve the same default avatar as its persistent identity", () => {
  f = fixture();
  const conversations = new Conversations(f.lifecycle);
  const setup = conversations.setup();
  const recipe = conversations.timeline(setup.thread_id).parts[0]?.actors[0]?.avatar_config;
  expect(recipe).toEqual(defaultAgentAvatar(setup.agent_id, true));
  f.restart();
  expect(
    new Conversations(f.lifecycle).timeline(setup.thread_id).parts[0]?.actors[0]?.avatar_config,
  ).toEqual(recipe);
});
function start(id: string) {
  const queued = f.store.get("run", id);
  if (
    !f.store
      .list("binding")
      .some((b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id)
  )
    f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("Run not claimed");
  return f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
}

test("DM publication keeps queued intake behind the answer, survives replay, and paginates without duplicates", () => {
  f = fixture();
  const first = f.admit("First question");
  const running = start(first.run.id);
  const second = f.admit("Queued question");
  const conversations = () => new Conversations(f.lifecycle);
  expect(
    conversations()
      .timeline(f.thread.id)
      .messages.map((m) => m.id),
  ).toEqual([first.message.id]);
  f.lifecycle.appendAnswer(running.id, "First answer");
  f.lifecycle.settle(running.id, running.dispatch_token as string, "succeeded");
  start(second.run.id);
  const before = conversations().timeline(f.thread.id);
  expect(before.messages.map((m) => m.text)).toEqual([
    "First question",
    "First answer",
    "Queued question",
  ]);
  f.restart();
  expect(conversations().timeline(f.thread.id)).toEqual(before);
  // Rebuild the projection from the unchanged domain log, including initial queued order.
  const db = new Database(f.store.path);
  db.exec(
    "DELETE FROM conversation_parts; DELETE FROM sqlite_sequence WHERE name='conversation_parts'; UPDATE conversation_projection SET cursor=0",
  );
  db.close();
  f.restart();
  expect(conversations().timeline(f.thread.id)).toEqual(before);
  const last = conversations().timeline(f.thread.id, { limit: 1 });
  const previous = conversations().timeline(f.thread.id, { before: last.next_before, limit: 2 });
  expect([...previous.parts, ...last.parts]).toEqual(before.parts);
});

test("handoff publishes the useful announcement first, hides instructions, and retains historical actor identity", () => {
  f = fixture();
  const peer = f.lifecycle.create("agent", {
    name: "Skinny Vicuna",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const groups = new Groups(f.lifecycle);
  const route = groups.send(group.id, { text: "Summarize and review", agent_id: f.agent.id });
  const run = start(f.store.get("peer_task", route.task_id).current_run_id);
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "PRIVATE_CANARY_UUID_TASK",
    purpose: "review",
    summary: "Review the summary",
    announcement: "Summary ready. @Skinny Vicuna will review it.",
    continuation: "finalize",
  });
  f.lifecycle.appendAnswer(run.id, "Do not repeat this final acknowledgement");
  f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
  const before = new Conversations(f.lifecycle).timeline(group.id);
  expect(before.parts.map((p) => p.kind)).toEqual(["message", "message", "handoff_requested"]);
  expect(before.messages.map((m) => m.text)).toEqual([
    "Summarize and review",
    "Summary ready. @Skinny Vicuna will review it.",
  ]);
  expect(JSON.stringify(before)).not.toContain("PRIVATE_CANARY");
  expect(f.store.get("message", child.request_message_id).text).toBe("PRIVATE_CANARY_UUID_TASK");
  const actor = before.parts.at(-1)?.actors.at(-1);
  expect(actor?.name).toBe("Skinny Vicuna");
  f.lifecycle.updateAgent(peer.id, {
    expected_revision: peer.revision,
    changes: { name: "Renamed" },
  });
  groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  f.restart();
  expect(
    new Conversations(f.lifecycle)
      .timeline(group.id)
      .parts.find((p) => p.kind === "handoff_requested")
      ?.actors.at(-1),
  ).toEqual(actor);
});

test.each(["persisted", "replayed"])(
  "%s historical handoff without a summary remains readable through snapshot and timeline HTTP",
  async (source) => {
    f = fixture();
    const peer = f.lifecycle.create("agent", {
      name: "Reviewer",
      harness: "codex",
      connection_id: f.store.get("agent", f.agent.id).connection_id,
    });
    const group = f.lifecycle.create("thread", {
      type: "group",
      member_agent_ids: [f.agent.id, peer.id],
    });
    const groups = new Groups(f.lifecycle);
    const route = groups.send(group.id, { text: "Review the report", agent_id: f.agent.id });
    const run = start(f.store.get("peer_task", route.task_id).current_run_id);
    const task = groups.handoff(run.id, {
      agent_id: peer.id,
      instruction: "PRIVATE_HISTORICAL_HANDOFF_INSTRUCTION",
      purpose: "review",
    });
    f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
    const partId = `handoff_requested:${task.id}`;
    const original = new Conversations(f.lifecycle).timeline(group.id);
    const db = new Database(f.store.path);
    // Simulate historical bytes from before peer tasks and receipts included summary.
    if (source === "persisted") {
      db.query("UPDATE conversation_parts SET body=json_remove(body,'$.summary') WHERE id=?").run(
        partId,
      );
    } else {
      db.query(
        "UPDATE events SET body=json_remove(body,'$.data.summary') WHERE json_extract(body,'$.entity_id')=?",
      ).run(task.id);
      db.exec(
        "DELETE FROM conversation_parts; DELETE FROM sqlite_sequence WHERE name='conversation_parts'; UPDATE conversation_projection SET cursor=0",
      );
    }
    db.close();
    f.restart();
    const events = f.store.events(0, 1000);
    const entities = f.store.list("message");
    const token = "z".repeat(64);
    const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
    for (const endpoint of ["snapshot", "timeline"]) {
      const response = await app.handle(
        new Request(`http://localhost/v1/threads/${group.id}/${endpoint}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      );
      expect(response.status).toBe(200);
      const body = await response.json();
      const timeline = endpoint === "snapshot" ? body.timeline : body;
      expect(timeline).toEqual(original);
      expect(timeline.parts.find((part: { id: string }) => part.id === partId)?.summary).toBeNull();
      expect(JSON.stringify(body)).not.toContain("PRIVATE_HISTORICAL_HANDOFF_INSTRUCTION");
    }
    expect(f.store.events(0, 1000)).toEqual(events);
    expect(f.store.list("message")).toEqual(entities);
    const stored = new Database(f.store.path);
    const receipt = stored
      .query<{ body: string }, [string]>("SELECT body FROM conversation_parts WHERE id=?")
      .get(partId);
    expect(JSON.parse(receipt?.body ?? "{}").summary).toBe(
      source === "replayed" ? null : undefined,
    );
    stored.close();
  },
);

test("goal progress stays quiet and completed milestones follow actual settlement in both DM and group", () => {
  f = fixture();
  const admission = f.admit("Prepare a report");
  const run = start(admission.run.id);
  const goals = new Goals(f.lifecycle);
  const goal = goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Report",
    objective: "Prepare the requested report",
    source_message_id: run.input_message_id,
  });
  const artifacts = new Artifacts(f.lifecycle);
  artifacts.workspaces
    .files(run.workspace_id as string)
    .create("report.txt", Buffer.from("Useful report"));
  const artifact = artifacts.publish(
    crypto.randomUUID(),
    {
      workspace_id: run.workspace_id,
      run_id: run.id,
      path: "report.txt",
      media_type: "text/plain",
    },
    () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
  goals.report(run.id, {
    evidence_artifact_ids: [artifact.id],
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Report ready",
    disposition: "completed",
  });
  expect(new Conversations(f.lifecycle).timeline(f.thread.id).parts.map((p) => p.kind)).toEqual([
    "message",
    "goal_created",
  ]);
  f.lifecycle.appendAnswer(run.id, "Here is the report.");
  f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
  goals.advance();
  const page = new Conversations(f.lifecycle).timeline(f.thread.id);
  expect(page.parts.map((p) => p.kind)).toEqual([
    "message",
    "goal_created",
    "message",
    "goal_completed",
  ]);
  expect(page.parts[1]?.name).toBe("Report");
  expect(publicReferences(f.store, run)).toContain("ngertiin://user/owner");
});

test("timeline HTTP boundary requires auth, validates cursors, and excludes another conversation", async () => {
  f = fixture();
  f.admit("Visible");
  const other = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [f.agent.id] });
  f.lifecycle.admit({ thread_id: other.id, agent_id: f.agent.id, text: "PRIVATE_OTHER_THREAD" });
  const token = "z".repeat(64);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  const read = (query = "", authenticated = true) =>
    app.handle(
      new Request(`http://localhost/v1/threads/${f.thread.id}/timeline${query}`, {
        headers: authenticated ? { Authorization: `Bearer ${token}` } : {},
      }),
    );
  expect((await read("", false)).status).toBe(401);
  expect((await read("?before=-1")).status).toBe(422);
  expect((await read("?limit=101")).status).toBe(422);
  const result = await read();
  expect(result.status).toBe(200);
  expect(await result.text()).not.toContain("PRIVATE_OTHER_THREAD");
});

test("Routine names stay readable and pause/resume append separate milestones without rewriting instructions", () => {
  f = fixture();
  const run = start(f.admit("Remind me to review the notes").run.id);
  const goals = new Goals(f.lifecycle);
  const instruction =
    "Ask [@user](ngertiin://user/owner) to review [notes.md](ngertiin://file/845dd2f1-061e-4789-8740-59128b7c5be3).";
  const routine = goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    name: "Review notes",
    instruction,
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2050-11-04T01:00:00Z" },
  });
  goals.controlRoutine(
    { thread_id: f.thread.id, agent_id: f.agent.id },
    { routine_id: routine.id, expected_revision: routine.revision, state: "paused" },
  );
  const paused = f.store.get("routine", routine.id);
  goals.controlRoutine(
    { thread_id: f.thread.id, agent_id: f.agent.id },
    { routine_id: routine.id, expected_revision: paused.revision, state: "active" },
  );
  const parts = new Conversations(f.lifecycle).timeline(f.thread.id).parts;
  expect(parts.map((part) => part.kind)).toEqual([
    "message",
    "routine_created",
    "routine_paused",
    "routine_resumed",
  ]);
  expect(parts.slice(1).every((part) => part.name === "Review notes")).toBeTrue();
  expect(f.store.get("routine", routine.id).instruction).toBe(instruction);
  expect(routineDisplayName(instruction)).toBe("Ask @user to review notes.md.");
});
