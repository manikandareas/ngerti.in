import { afterEach, expect, test } from "bun:test";
import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import { Artifacts } from "../src/artifacts";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { routineDisplayName } from "../src/conversations/labels";
import { publicReferences } from "../src/conversations/references";
import { Goals } from "../src/goals/service";
import { Groups } from "../src/groups/service";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());

test("Tobi public receipts preserve the same default avatar as its persistent identity", async () => {
  f = await fixture();
  const conversations = new Conversations(f.lifecycle);
  const setup = await conversations.setup();
  const recipe = (await conversations.timeline(setup.thread_id)).parts[0]?.actors[0]?.avatar_config;
  expect(recipe).toEqual(defaultAgentAvatar(setup.agent_id, true));
  await f.restart();
  expect(
    (await new Conversations(f.lifecycle).timeline(setup.thread_id)).parts[0]?.actors[0]
      ?.avatar_config,
  ).toEqual(recipe);
});
async function start(id: string) {
  const queued = await f.store.get("run", id);
  if (
    !(await f.store.list("binding")).some(
      (b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id,
    )
  )
    await f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = await f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("Run not claimed");
  return await f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
}

test("DM publication keeps queued intake behind the answer, survives replay, and paginates without duplicates", async () => {
  f = await fixture();
  const first = await f.admit("First question");
  const running = await start(first.run.id);
  const second = await f.admit("Queued question");
  const conversations = () => new Conversations(f.lifecycle);
  expect((await conversations().timeline(f.thread.id)).messages.map((m) => m.id)).toEqual([
    first.message.id,
  ]);
  await f.lifecycle.appendAnswer(running.id, "First answer");
  await f.lifecycle.settle(running.id, running.dispatch_token as string, "succeeded");
  await start(second.run.id);
  const before = await conversations().timeline(f.thread.id);
  expect(before.messages.map((m) => m.text)).toEqual([
    "First question",
    "First answer",
    "Queued question",
  ]);
  await f.restart();
  expect(await conversations().timeline(f.thread.id)).toEqual(before);
  // Rebuild the projection from the unchanged domain log, including initial queued order.
  await f.administrativeQuery(
    "TRUNCATE conversation_parts RESTART IDENTITY; UPDATE conversation_projection SET cursor=0",
  );

  await f.restart();
  expect(await conversations().timeline(f.thread.id)).toEqual(before);
  const last = await conversations().timeline(f.thread.id, { limit: 1 });
  const previous = await conversations().timeline(f.thread.id, {
    before: last.next_before,
    limit: 2,
  });
  expect([...previous.parts, ...last.parts]).toEqual(before.parts);
});

test("handoff publishes the useful announcement first, hides instructions, and retains historical actor identity", async () => {
  f = await fixture();
  const peer = await f.lifecycle.create("agent", {
    name: "Skinny Vicuna",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const groups = new Groups(f.lifecycle);
  const route = await groups.send(group.id, { text: "Summarize and review", agent_id: f.agent.id });
  const run = await start((await f.store.get("peer_task", route.task_id)).current_run_id);
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "PRIVATE_CANARY_UUID_TASK",
    purpose: "review",
    summary: "Review the summary",
    announcement: "Summary ready. @Skinny Vicuna will review it.",
    continuation: "finalize",
  });
  await f.lifecycle.appendAnswer(run.id, "Do not repeat this final acknowledgement");
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
  const before = await new Conversations(f.lifecycle).timeline(group.id);
  expect(before.parts.map((p) => p.kind)).toEqual(["message", "message", "handoff_requested"]);
  expect(before.messages.map((m) => m.text)).toEqual([
    "Summarize and review",
    "Summary ready. @Skinny Vicuna will review it.",
  ]);
  expect(JSON.stringify(before)).not.toContain("PRIVATE_CANARY");
  expect((await f.store.get("message", child.request_message_id)).text).toBe(
    "PRIVATE_CANARY_UUID_TASK",
  );
  const actor = before.parts.at(-1)?.actors.at(-1);
  expect(actor?.name).toBe("Skinny Vicuna");
  await f.lifecycle.updateAgent(peer.id, {
    expected_revision: peer.revision,
    changes: { name: "Renamed" },
  });
  await groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  await f.restart();
  expect(
    (await new Conversations(f.lifecycle).timeline(group.id)).parts
      .find((p) => p.kind === "handoff_requested")
      ?.actors.at(-1),
  ).toEqual(actor);
});

test.each(["persisted", "replayed"])(
  "%s historical handoff without a summary remains readable through snapshot and timeline HTTP",
  async (source) => {
    f = await fixture();
    const peer = await f.lifecycle.create("agent", {
      name: "Reviewer",
      harness: "codex",
      connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
    });
    const group = await f.lifecycle.create("thread", {
      type: "group",
      member_agent_ids: [f.agent.id, peer.id],
    });
    const groups = new Groups(f.lifecycle);
    const route = await groups.send(group.id, { text: "Review the report", agent_id: f.agent.id });
    const run = await start((await f.store.get("peer_task", route.task_id)).current_run_id);
    const task = await groups.handoff(run.id, {
      agent_id: peer.id,
      instruction: "PRIVATE_HISTORICAL_HANDOFF_INSTRUCTION",
      purpose: "review",
    });
    await f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
    const partId = `handoff_requested:${task.id}`;
    const original = await new Conversations(f.lifecycle).timeline(group.id);
    const db = f.store;
    // Simulate historical bytes from before peer tasks and receipts included summary.
    if (source === "persisted") {
      await db.query("UPDATE conversation_parts SET body=body-'summary' WHERE id=$1", [partId]);
    } else {
      await f.administrativeQuery(
        "UPDATE events SET body=body #- '{data,summary}' WHERE body->>'entity_id'=$1",
        [task.id],
      );
      await f.administrativeQuery(
        "TRUNCATE conversation_parts RESTART IDENTITY; UPDATE conversation_projection SET cursor=0",
      );
    }

    await f.restart();
    const events = await f.store.events(0, 1000);
    const entities = await f.store.list("message");
    const token = "z".repeat(64);
    const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
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
    expect(await f.store.events(0, 1000)).toEqual(events);
    expect(await f.store.list("message")).toEqual(entities);
    const receipt = (
      await f.store.query("SELECT body FROM conversation_parts WHERE id=$1", [partId])
    ).rows[0];
    expect(receipt?.body.summary).toBe(source === "replayed" ? null : undefined);
  },
);

test("goal progress stays quiet and completed milestones follow actual settlement in both DM and group", async () => {
  f = await fixture();
  const admission = await f.admit("Prepare a report");
  const run = await start(admission.run.id);
  const goals = new Goals(f.lifecycle);
  const goal = await goals.capture(run.id, {
    goal_id: crypto.randomUUID(),
    expected_revision: 0,
    title: "Report",
    objective: "Prepare the requested report",
    source_message_id: run.input_message_id,
  });
  const artifacts = new Artifacts(f.lifecycle);
  (await artifacts.workspaces.files(run.workspace_id as string)).create(
    "report.txt",
    Buffer.from("Useful report"),
  );
  const artifact = await artifacts.publish(
    crypto.randomUUID(),
    {
      workspace_id: run.workspace_id,
      run_id: run.id,
      path: "report.txt",
      media_type: "text/plain",
    },
    async () => await f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  );
  await goals.report(run.id, {
    evidence_artifact_ids: [artifact.id],
    goal_id: goal.id,
    expected_revision: goal.revision,
    progress: "Report ready",
    disposition: "completed",
  });
  expect(
    (await new Conversations(f.lifecycle).timeline(f.thread.id)).parts.map((p) => p.kind),
  ).toEqual(["message", "goal_created"]);
  await f.lifecycle.appendAnswer(run.id, "Here is the report.");
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
  await goals.advance();
  const page = await new Conversations(f.lifecycle).timeline(f.thread.id);
  expect(page.parts.map((p) => p.kind)).toEqual([
    "message",
    "goal_created",
    "message",
    "goal_completed",
  ]);
  expect(page.parts[1]?.name).toBe("Report");
  expect(await publicReferences(f.store, run)).toContain("ngertiin://user/owner");
});

test("timeline HTTP boundary requires auth, validates cursors, and excludes another conversation", async () => {
  f = await fixture();
  await f.admit("Visible");
  const other = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [f.agent.id] });
  await f.lifecycle.admit({
    thread_id: other.id,
    agent_id: f.agent.id,
    text: "PRIVATE_OTHER_THREAD",
  });
  const token = "z".repeat(64);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
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

test("Routine names stay readable and pause/resume append separate milestones without rewriting instructions", async () => {
  f = await fixture();
  const run = await start((await f.admit("Remind me to review the notes")).run.id);
  const goals = new Goals(f.lifecycle);
  const instruction =
    "Ask [@user](ngertiin://user/owner) to review [notes.md](ngertiin://file/845dd2f1-061e-4789-8740-59128b7c5be3).";
  const routine = await goals.writeRoutine(run.id, {
    routine_id: crypto.randomUUID(),
    expected_revision: 0,
    name: "Review notes",
    instruction,
    timezone: "Asia/Makassar",
    schedule: { type: "once", at: "2050-11-04T01:00:00Z" },
  });
  await goals.controlRoutine(
    { thread_id: f.thread.id, agent_id: f.agent.id },
    { routine_id: routine.id, expected_revision: routine.revision, state: "paused" },
  );
  const paused = await f.store.get("routine", routine.id);
  await goals.controlRoutine(
    { thread_id: f.thread.id, agent_id: f.agent.id },
    { routine_id: routine.id, expected_revision: paused.revision, state: "active" },
  );
  const parts = (await new Conversations(f.lifecycle).timeline(f.thread.id)).parts;
  expect(parts.map((part) => part.kind)).toEqual([
    "message",
    "routine_created",
    "routine_paused",
    "routine_resumed",
  ]);
  expect(parts.slice(1).every((part) => part.name === "Review notes")).toBeTrue();
  expect((await f.store.get("routine", routine.id)).instruction).toBe(instruction);
  expect(routineDisplayName(instruction)).toBe("Ask @user to review notes.md.");
});
