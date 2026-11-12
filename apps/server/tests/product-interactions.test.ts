import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import type { Entity } from "../src/contracts";
import { Groups } from "../src/groups/service";
import { Interactions } from "../src/interactions/service";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function start() {
  if (!f || f.store.closed) {
    f = await fixture();
    await f.bind();
  }
  const { run } = await f.admit();
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(claimed?.dispatch_token);
  await f.lifecycle.started(claimed.id, claimed.dispatch_token, "native");
  return await f.store.get("run", run.id);
}
async function settle(run: Entity<"run">) {
  assert(run.dispatch_token);
  await f.lifecycle.settle(run.id, run.dispatch_token, "succeeded");
}
test("DM questions survive restart and owner submission admits exactly one bound continuation", async () => {
  const run = await start();
  const request = await new Interactions(f.lifecycle).ask(run.id, {
    purpose: "input",
    question: "Which flavor?",
    options: {
      choices: [
        { id: "a", label: "Vanilla" },
        { id: "b", label: "Pistachio" },
      ],
    },
  });
  await settle(run);
  await f.restart();
  const service = new Interactions(f.lifecycle);
  await expect(
    (async () => service.reply(request.id, { expected_revision: 1, selected_ids: ["x"] }))(),
  ).rejects.toThrow("INVALID_REQUEST");
  await service.reply(request.id, { expected_revision: 1, selected_ids: ["b"] });
  await service.advance();
  await service.advance();
  expect(await f.store.list("run")).toHaveLength(2);
  expect((await f.store.get("human_request", request.id)).continuation_run_id).toBeTruthy();
  expect((await f.store.list("message")).filter((m) => m.author === "user")).toHaveLength(2);
});
test("topic changes do not consume a question; a later natural answer uses its existing turn", async () => {
  const source = await start();
  const service = new Interactions(f.lifecycle);
  const request = await service.ask(source.id, { purpose: "input", question: "Which city?" });
  await settle(source);
  const current = await start();
  const input = {
    command_id: crypto.randomUUID(),
    request_id: request.id,
    expected_revision: request.revision,
    user_message_id: current.input_message_id,
  };
  await service.resolve(current.id, { ...input, disposition: "defer" });
  expect((await f.store.get("human_request", request.id)).state).toBe("pending");
  await service.resolve(current.id, { ...input, disposition: "answer" });
  await service.advance();
  expect(await f.store.list("run")).toHaveLength(2);
  expect((await f.store.get("human_request", request.id)).continuation_run_id).toBe(current.id);
});
test("approval gates exact arguments and one effect command; agents cannot approve their own request", async () => {
  const source = await start();
  const service = new Interactions(f.lifecycle);
  const action = {
    tool_name: "ngertiin.execute_app_tool",
    arguments: {
      tool: "GMAIL_SEND_EMAIL",
      connection_id: crypto.randomUUID(),
      arguments: { to: "test@example.invalid", body: "Draft A" },
    },
  };
  const request = await service.ask(source.id, {
    purpose: "approval",
    question: "Send draft A?",
    action,
  });
  const command_id = crypto.randomUUID();
  await expect(
    (async () => service.guard(source.id, action.tool_name, { ...action.arguments, command_id }))(),
  ).rejects.toThrow("APPROVAL_REQUIRED");
  await expect(
    (async () =>
      service.resolve(source.id, {
        command_id,
        request_id: request.id,
        expected_revision: 1,
        user_message_id: source.input_message_id,
        disposition: "answer",
        decision: "approve",
        evidence: "Please",
      }))(),
  ).rejects.toThrow();
  await service.reply(request.id, { expected_revision: 1, decision: "approve" });
  await service.claim(source.id, action.tool_name, { ...action.arguments, command_id });
  await service.guard(source.id, action.tool_name, { ...action.arguments, command_id });
  await expect(
    (async () =>
      service.guard(source.id, action.tool_name, {
        ...action.arguments,
        command_id: crypto.randomUUID(),
      }))(),
  ).rejects.toThrow("RECONCILIATION_REQUIRED");
  await expect(
    (async () =>
      service.guard(source.id, action.tool_name, {
        ...action.arguments,
        arguments: { body: "Changed" },
        command_id,
      }))(),
  ).rejects.toThrow("APPROVAL_REQUIRED");
});
test("group native turns and DM use the same durable request service", async () => {
  f = await fixture();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  const groups = new Groups(f.lifecycle);
  const route = await groups.send(group.id, { text: "Ask for a city", agent_id: f.agent.id });
  assert(route.task_id);
  const task = await f.store.get("peer_task", route.task_id);
  await f.lifecycle.bind(group.id, f.agent.id, crypto.randomUUID());
  const run = await f.lifecycle.claimNext(group.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  const request = await groups.askUser(run.id, { purpose: "input", question: "City?" });
  await settle(run);
  await new Interactions(f.lifecycle).reply(request.id, { expected_revision: 1, text: "Makassar" });
  await new Interactions(f.lifecycle).advance();
  await groups.advance();
  await groups.advance();
  expect((await f.store.get("peer_task", task.id)).current_run_id).not.toBe(run.id);
  expect(await f.store.list("run")).toHaveLength(2);
});

test("an existing Goal waits for a DM question and transfers to its one continuation", async () => {
  f = await fixture();
  await f.bind();
  const goal = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Prepare a city greeting",
  });
  await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    text: "Prepare the greeting",
  });
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  const service = new Interactions(f.lifecycle);
  const request = await service.ask(run.id, { purpose: "input", question: "City?" });
  await settle(run);
  await service.advance();
  expect((await f.store.get("goal", goal.id)).work_state).toBe("waiting");
  expect(await f.store.list("run")).toHaveLength(1);
  await service.reply(request.id, { expected_revision: 1, text: "Makassar" });
  await service.advance();
  await service.advance();
  const next = (await f.store.get("human_request", request.id)).continuation_run_id;
  expect((await f.store.get("goal", goal.id)).current_run_id).toBe(next);
  expect(await f.store.list("run")).toHaveLength(2);
});

test("pausing a Goal after a DM question fences its old response and continuation", async () => {
  f = await fixture();
  await f.bind();
  const goal = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Waiting greeting",
  });
  await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    text: "Prepare greeting",
  });
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  await f.lifecycle.started(run.id, run.dispatch_token, "native");
  const service = new Interactions(f.lifecycle);
  const request = await service.ask(run.id, { purpose: "input", question: "City?" });
  await settle(run);
  await f.lifecycle.controlGoal(goal.id, "paused");
  await expect(
    (async () => service.reply(request.id, { expected_revision: 1, text: "Makassar" }))(),
  ).rejects.toThrow("CONFLICT");
  await service.advance();
  expect((await f.store.get("human_request", request.id)).state).toBe("cancelled");
  expect(await f.store.list("run")).toHaveLength(1);
});

test("an approval without its protected operation cannot create a misleading unguarded card", async () => {
  const run = await start();
  await expect(
    (async () =>
      new Interactions(f.lifecycle).ask(run.id, { purpose: "approval", question: "Send this?" }))(),
  ).rejects.toThrow();
  expect(await f.store.list("human_request")).toHaveLength(0);
  expect(
    (await f.store.list("message")).filter((message) => message.purpose === "human_request"),
  ).toHaveLength(0);
});
