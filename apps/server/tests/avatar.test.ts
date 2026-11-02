import { afterEach, expect, test } from "bun:test";
import { createAvatar } from "@ngertiin/avatar/config";
import { readAgentActivities } from "../src/agents/activity";
import { createApi } from "../src/api";
import { responseSchemas } from "../src/api-contract";
import { Background } from "../src/background";
import { Groups } from "../src/groups/service";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());

test("avatar recipes validate, persist across restart and share identity across DM/group projections", async () => {
  f = fixture();
  const token = "v".repeat(64);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  const agent = f.store.get("agent", f.agent.id);
  expect(agent.avatar_config?.seed).toBe(agent.id);
  const recipe = createAvatar(agent.id, { shape: "hexagon", color: "mint", face: "curious" });
  const update = (changes: unknown, revision = agent.revision) =>
    app.handle(
      new Request(`http://localhost/v1/agents/${agent.id}/configuration`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify({ expected_revision: revision, changes }),
      }),
    );
  expect((await update({ avatar_config: { ...recipe, color: "invalid" } })).status).toBe(422);
  expect((await update({ avatar_config: { ...recipe, version: 2 } })).status).toBe(422);
  const response = await update({ avatar_config: recipe });
  expect(response.status).toBe(200);
  expect((await response.json()).avatar_config).toEqual(recipe);
  expect((await update({ avatar_config: createAvatar("other") })).status).toBe(409);
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [agent.id] });
  for (const thread of [f.thread, group]) {
    const snapshot = await app.handle(
      new Request(`http://localhost/v1/threads/${thread.id}/snapshot`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    );
    const value = responseSchemas.conversation.parse(await snapshot.json());
    expect(value.agents[0].avatar_config).toEqual(recipe);
  }
  f.restart();
  expect(f.store.get("agent", agent.id).avatar_config).toEqual(recipe);
});

test("activity summaries retain active work ahead of queued inputs and exclude private/routing data", () => {
  f = fixture();
  f.admit("PRIVATE_TRANSCRIPT_MARKER");
  f.bind();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected a dispatch claim.");
  f.lifecycle.started(claimed.id, claimed.dispatch_token);
  f.lifecycle.observe(claimed.id, claimed.dispatch_token, { activity: "tool_running" });
  f.admit("queued input");
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  f.lifecycle.admit({ thread_id: group.id, agent_id: f.agent.id, text: "Group work" });
  const cursor = f.store.cursor;
  let summary = readAgentActivities(f.store);
  expect(responseSchemas.agent_activity.safeParse(summary).success).toBe(true);
  expect(summary.items).toHaveLength(2);
  expect(summary.items.find((item) => item.thread_id === f.thread.id)).toMatchObject({
    run_id: claimed.id,
    activity: "tool_running",
    status: "running",
    waiting_for_user: false,
  });
  expect(JSON.stringify(summary)).not.toContain("PRIVATE_TRANSCRIPT_MARKER");
  expect(f.store.cursor).toBe(cursor);
  f.lifecycle.cancel(claimed.id);
  expect(
    readAgentActivities(f.store).items.find((item) => item.thread_id === f.thread.id)?.status,
  ).toBe("cancel_requested");
  f.lifecycle.settle(claimed.id, claimed.dispatch_token, "unknown");
  summary = readAgentActivities(f.store);
  expect(summary.items.find((item) => item.thread_id === f.thread.id)?.status).toBe("unknown");
  f.restart();
  expect(readAgentActivities(f.store)).toEqual(summary);
});

test("group input requests hold activity after successful native completion without leaking the question", () => {
  f = fixture();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  const groups = new Groups(f.lifecycle);
  const route = groups.send(group.id, { text: "Work with me", agent_id: f.agent.id });
  const task = f.store.get("peer_task", route.task_id);
  f.lifecycle.bind(group.id, f.agent.id, crypto.randomUUID());
  const claimed = f.lifecycle.claimNext(group.id, f.agent.id);
  if (!claimed?.dispatch_token) throw new Error("Expected a group run.");
  expect(task.current_run_id).toBe(claimed.id);
  f.lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
  groups.askUser(claimed.id, { purpose: "input", question: "PRIVATE_QUESTION_MARKER" });
  f.lifecycle.settle(claimed.id, claimed.dispatch_token, "succeeded");
  const result = readAgentActivities(f.store);
  expect(result.items.find((item) => item.run_id === claimed.id)).toMatchObject({
    status: "succeeded",
    waiting_for_user: true,
  });
  expect(JSON.stringify(result)).not.toContain("PRIVATE_QUESTION_MARKER");
  const pending = groups.send(group.id, { text: "Select a responder" });
  expect(pending.state).toBe("pending");
  const summarizedIds = new Set(readAgentActivities(f.store).items.map((item) => item.run_id));
  expect(summarizedIds.has(pending.router_run_id as string)).toBe(false);
});
