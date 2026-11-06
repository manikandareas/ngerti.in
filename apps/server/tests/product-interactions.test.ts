import { afterEach, expect, test } from "bun:test";
import assert from "node:assert/strict";
import type { Entity } from "../src/contracts";
import { Groups } from "../src/groups/service";
import { Interactions } from "../src/interactions/service";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function start() {
  if (!f || f.store.closed) {
    f = fixture();
    f.bind();
  }
  const { run } = f.admit();
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(claimed?.dispatch_token);
  f.lifecycle.started(claimed.id, claimed.dispatch_token, "native");
  return f.store.get("run", run.id);
}
function settle(run: Entity<"run">) {
  assert(run.dispatch_token);
  f.lifecycle.settle(run.id, run.dispatch_token, "succeeded");
}
test("DM questions survive restart and owner submission admits exactly one bound continuation", () => {
  const run = start();
  const request = new Interactions(f.lifecycle).ask(run.id, {
    purpose: "input",
    question: "Which flavor?",
    options: {
      choices: [
        { id: "a", label: "Vanilla" },
        { id: "b", label: "Pistachio" },
      ],
    },
  });
  settle(run);
  f.restart();
  const service = new Interactions(f.lifecycle);
  expect(() => service.reply(request.id, { expected_revision: 1, selected_ids: ["x"] })).toThrow(
    "INVALID_REQUEST",
  );
  service.reply(request.id, { expected_revision: 1, selected_ids: ["b"] });
  service.advance();
  service.advance();
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.get("human_request", request.id).continuation_run_id).toBeTruthy();
  expect(f.store.list("message").filter((m) => m.author === "user")).toHaveLength(2);
});
test("topic changes do not consume a question; a later natural answer uses its existing turn", () => {
  const source = start();
  const service = new Interactions(f.lifecycle);
  const request = service.ask(source.id, { purpose: "input", question: "Which city?" });
  settle(source);
  const current = start();
  const input = {
    command_id: crypto.randomUUID(),
    request_id: request.id,
    expected_revision: request.revision,
    user_message_id: current.input_message_id,
  };
  service.resolve(current.id, { ...input, disposition: "defer" });
  expect(f.store.get("human_request", request.id).state).toBe("pending");
  service.resolve(current.id, { ...input, disposition: "answer" });
  service.advance();
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.get("human_request", request.id).continuation_run_id).toBe(current.id);
});
test("approval gates exact arguments and one effect command; agents cannot approve their own request", () => {
  const source = start();
  const service = new Interactions(f.lifecycle);
  const action = {
    tool_name: "ngertiin.execute_app_tool",
    arguments: {
      tool: "GMAIL_SEND_EMAIL",
      connection_id: crypto.randomUUID(),
      arguments: { to: "test@example.invalid", body: "Draft A" },
    },
  };
  const request = service.ask(source.id, {
    purpose: "approval",
    question: "Send draft A?",
    action,
  });
  const command_id = crypto.randomUUID();
  expect(() =>
    service.guard(source.id, action.tool_name, { ...action.arguments, command_id }),
  ).toThrow("APPROVAL_REQUIRED");
  expect(() =>
    service.resolve(source.id, {
      command_id,
      request_id: request.id,
      expected_revision: 1,
      user_message_id: source.input_message_id,
      disposition: "answer",
      decision: "approve",
      evidence: "Please",
    }),
  ).toThrow();
  service.reply(request.id, { expected_revision: 1, decision: "approve" });
  service.claim(source.id, action.tool_name, { ...action.arguments, command_id });
  service.guard(source.id, action.tool_name, { ...action.arguments, command_id });
  expect(() =>
    service.guard(source.id, action.tool_name, {
      ...action.arguments,
      command_id: crypto.randomUUID(),
    }),
  ).toThrow("RECONCILIATION_REQUIRED");
  expect(() =>
    service.guard(source.id, action.tool_name, {
      ...action.arguments,
      arguments: { body: "Changed" },
      command_id,
    }),
  ).toThrow("APPROVAL_REQUIRED");
});
test("group native turns and DM use the same durable request service", () => {
  f = fixture();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  const groups = new Groups(f.lifecycle);
  const route = groups.send(group.id, { text: "Ask for a city", agent_id: f.agent.id });
  assert(route.task_id);
  const task = f.store.get("peer_task", route.task_id);
  f.lifecycle.bind(group.id, f.agent.id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(group.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  const request = groups.askUser(run.id, { purpose: "input", question: "City?" });
  settle(run);
  new Interactions(f.lifecycle).reply(request.id, { expected_revision: 1, text: "Makassar" });
  new Interactions(f.lifecycle).advance();
  groups.advance();
  groups.advance();
  expect(f.store.get("peer_task", task.id).current_run_id).not.toBe(run.id);
  expect(f.store.list("run")).toHaveLength(2);
});

test("an existing Goal waits for a DM question and transfers to its one continuation", () => {
  f = fixture();
  f.bind();
  const goal = f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Prepare a city greeting",
  });
  f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    text: "Prepare the greeting",
  });
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  const service = new Interactions(f.lifecycle);
  const request = service.ask(run.id, { purpose: "input", question: "City?" });
  settle(run);
  service.advance();
  expect(f.store.get("goal", goal.id).work_state).toBe("waiting");
  expect(f.store.list("run")).toHaveLength(1);
  service.reply(request.id, { expected_revision: 1, text: "Makassar" });
  service.advance();
  service.advance();
  const next = f.store.get("human_request", request.id).continuation_run_id;
  expect(f.store.get("goal", goal.id).current_run_id).toBe(next);
  expect(f.store.list("run")).toHaveLength(2);
});

test("pausing a Goal after a DM question fences its old response and continuation", () => {
  f = fixture();
  f.bind();
  const goal = f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Waiting greeting",
  });
  f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    text: "Prepare greeting",
  });
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  assert(run?.dispatch_token);
  f.lifecycle.started(run.id, run.dispatch_token, "native");
  const service = new Interactions(f.lifecycle);
  const request = service.ask(run.id, { purpose: "input", question: "City?" });
  settle(run);
  f.lifecycle.controlGoal(goal.id, "paused");
  expect(() => service.reply(request.id, { expected_revision: 1, text: "Makassar" })).toThrow(
    "CONFLICT",
  );
  service.advance();
  expect(f.store.get("human_request", request.id).state).toBe("cancelled");
  expect(f.store.list("run")).toHaveLength(1);
});

test("an approval without its protected operation cannot create a misleading unguarded card", () => {
  const run = start();
  expect(() =>
    new Interactions(f.lifecycle).ask(run.id, { purpose: "approval", question: "Send this?" }),
  ).toThrow();
  expect(f.store.list("human_request")).toHaveLength(0);
  expect(
    f.store.list("message").filter((message) => message.purpose === "human_request"),
  ).toHaveLength(0);
});
