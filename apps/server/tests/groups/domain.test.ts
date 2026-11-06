import { afterEach, expect, test } from "bun:test";
import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Conversations } from "../../src/conversations";
import { Groups } from "../../src/groups/service";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { Memories } from "../../src/learning/memories";
import { fixture } from "../helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function setup() {
  f = fixture();
  const connection = new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const peer = f.lifecycle.createAgent({
    name: "Reviewer",
    handle: "reviewer",
    soul: "Review calculations",
    harness: "muse",
    connection_id: connection.id,
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  }) as Entity<"thread">;
  return { peer, group, groups: new Groups(f.lifecycle) };
}
function start(runId: string) {
  const queued = f.store.get("run", runId);
  if (
    !f.store
      .list("binding")
      .some((b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id)
  )
    f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(queued.thread_id, queued.agent_id) as Entity<"run">;
  expect(run.id).toBe(runId);
  f.lifecycle.started(run.id, run.dispatch_token as string, crypto.randomUUID());
  return f.store.get("run", run.id);
}
function finish(
  run: Entity<"run">,
  text = "Completed useful work.",
  outcome: "succeeded" | "failed" | "unknown" = "succeeded",
) {
  f.lifecycle.appendAnswer(run.id, text);
  f.lifecycle.settle(run.id, run.dispatch_token as string, outcome);
}
function root(groups: Groups, group: Entity<"thread">) {
  const route = groups.send(group.id, {
    text: "Produce a reviewed calculation.",
    agent_id: f.agent.id,
  });
  const task = f.store.get("peer_task", route.task_id as string);
  return { task, run: start(task.current_run_id) };
}

test("mention selects exactly one valid member and invalid addresses create no work", () => {
  const { groups, group, peer } = setup();
  const route = groups.send(group.id, { text: "@reviewer Check this calculation." });
  expect(route).toMatchObject({
    state: "selected",
    selected_agent_id: peer.id,
    router_run_id: null,
  });
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("message")).toHaveLength(1);
  for (const text of ["@outsider hello", "@reviewer @other hello"])
    expect(() => groups.send(group.id, { text })).toThrow();
  expect(() => groups.send(group.id, { text: "@reviewer hello", agent_id: f.agent.id })).toThrow(
    "SCOPE_DENIED",
  );
  expect(() => groups.send(f.thread.id, { text: "hello" })).toThrow("SCOPE_DENIED");
  expect(f.store.list("run")).toHaveLength(1);
});

test("model routing uses the scoped packet, validates output and never writes selection bubbles", () => {
  const { groups, group, peer } = setup();
  f.admit("PRIVATE_DM_SECRET");
  new Memories(f.lifecycle).write(
    { agent_id: f.agent.id, thread_id: f.thread.id },
    {
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: "PRIVATE_MEMORY_SECRET",
    },
  );
  const route = groups.send(group.id, { text: "Please review the calculation." });
  const run = start(route.router_run_id as string);
  const prompt = f.store.get("message", run.input_message_id).text;
  expect(prompt).toContain("Review calculations");
  expect(prompt).not.toContain("PRIVATE_DM_SECRET");
  expect(prompt).not.toContain("PRIVATE_MEMORY_SECRET");
  finish(run, JSON.stringify({ agent_id: peer.id }));
  groups.advance();
  groups.advance();
  expect(f.store.get("group_route", route.id)).toMatchObject({
    state: "selected",
    selected_agent_id: peer.id,
  });
  expect(f.store.list("peer_task")).toHaveLength(1);
  const snapshot = new Conversations(f.lifecycle).snapshot(group.id);
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.messages[0]?.author).toBe("user");
  expect(snapshot.runs).toHaveLength(1);
  expect(snapshot.runs[0]?.agent_id).toBe(peer.id);
  expect(groups.context(snapshot.runs[0] as Entity<"run">)).not.toMatch(
    /PRIVATE_DM_SECRET|PRIVATE_MEMORY_SECRET/,
  );
});

for (const output of [
  "not JSON",
  "[]",
  '{"agent_id":"bad"}',
  JSON.stringify({ agent_id: crypto.randomUUID() }),
  JSON.stringify({ agent_id: crypto.randomUUID(), extra: true }),
]) {
  test(`invalid model route fails closed: ${output}`, () => {
    const { groups, group } = setup();
    const route = groups.send(group.id, { text: "Choose the best responder." });
    finish(start(route.router_run_id as string), output);
    groups.advance();
    expect(f.store.get("group_route", route.id).state).toBe("rejected");
    expect(f.store.list("peer_task")).toHaveLength(0);
    expect(new Conversations(f.lifecycle).snapshot(group.id).messages).toHaveLength(1);
  });
}

test("membership edits fence stale routing and revoke queued work even after readding the member", () => {
  const { groups, group, peer } = setup();
  const route = groups.send(group.id, { text: "Route me." });
  const router = start(route.router_run_id as string);
  const directed = groups.send(group.id, { text: "Check me.", agent_id: peer.id });
  const task = f.store.get("peer_task", directed.task_id as string);
  const changed = groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  expect(f.store.get("run", task.current_run_id).status).toBe("cancelled");
  groups.membership(group.id, {
    expected_revision: changed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  finish(router, JSON.stringify({ agent_id: peer.id }));
  groups.advance();
  expect(f.store.get("group_route", route.id)).toMatchObject({
    state: "rejected",
    error_code: "ROUTING_STALE",
  });
  expect(f.store.get("peer_task", task.id).state).toBe("cancelled");
  expect(() =>
    groups.membership(group.id, { expected_revision: 1, member_agent_ids: [peer.id] }),
  ).toThrow("CONFLICT");
});

test("cross-harness child review, lineage and atomic parent continuation survive repeated restart reconciliation", () => {
  const { groups, group, peer } = setup();
  const { task, run } = root(groups, group);
  const input = { agent_id: peer.id, instruction: "Review 19 + 23 = 42.", purpose: "review" };
  const commandId = crypto.randomUUID();
  const child = f.store.command(commandId, input, () => groups.handoff(run.id, input));
  expect(f.store.command(commandId, input, () => groups.handoff(run.id, input))).toEqual(child);
  expect(child).toMatchObject({
    parent_task_id: task.id,
    root_task_id: task.id,
    source_run_id: run.id,
    source_agent_id: f.agent.id,
  });
  expect(f.store.get("message", child.request_message_id)).toMatchObject({
    author: "agent",
    author_agent_id: f.agent.id,
    source_run_id: run.id,
    purpose: "review",
  });
  finish(run, "The reviewer will check my calculation.");
  finish(start(child.current_run_id), "Confirmed: 19 + 23 = 42.");
  f.restart();
  let resumed = new Groups(f.lifecycle);
  resumed.advance();
  resumed.advance();
  const current = f.store.get("peer_task", task.id);
  expect(current).toMatchObject({ state: "working", continuation: 1 });
  expect(
    f.store.get("message", f.store.get("run", current.current_run_id).input_message_id).text,
  ).toContain("Confirmed: 19 + 23 = 42.");
  const count = f.store.list("run").length;
  f.restart();
  resumed = new Groups(f.lifecycle);
  resumed.advance();
  resumed.advance();
  expect(f.store.list("run")).toHaveLength(count);
  finish(start(current.current_run_id), "Reviewed result: 42.");
  resumed.advance();
  expect(f.store.get("peer_task", task.id).state).toBe("completed");
  const messages = new Conversations(f.lifecycle).snapshot(group.id).messages;
  expect(messages.some((m) => m.purpose === "continuation")).toBe(false);
  expect(
    messages.filter((m) => m.run_id === child.current_run_id && m.purpose === "conversation")[0]
      ?.author_agent_id,
  ).toBe(peer.id);
  expect(messages.every((m) => !/^(?:pass|skip|no.response)$/i.test(m.text))).toBe(true);
});

test("human reply stays bound to its request across restart and duplicate/stale replies cannot resume another task", () => {
  const { groups, group } = setup();
  const { task, run } = root(groups, group);
  const request = groups.askUser(run.id, {
    purpose: "review",
    question: "Should the final answer include the derivation?",
  });
  finish(run, "Waiting for your review.");
  groups.advance();
  expect(f.store.get("peer_task", task.id).state).toBe("waiting_user");
  expect(f.store.list("run")).toHaveLength(1);
  f.restart();
  const resumed = new Groups(f.lifecycle);
  const key = crypto.randomUUID();
  const input = { expected_revision: request.revision, text: "Yes, include the derivation." };
  const reply = f.store.command(key, input, () => resumed.reply(request.id, input));
  expect(f.store.command(key, input, () => resumed.reply(request.id, input))).toEqual(reply);
  expect(() => resumed.reply(request.id, input)).toThrow("CONFLICT");
  resumed.advance();
  resumed.advance();
  const current = f.store.get("peer_task", task.id);
  expect(current.continuation).toBe(1);
  expect(f.store.get("human_request", request.id).continuation_run_id).toBe(current.current_run_id);
  expect(
    f.store.get("message", f.store.get("run", current.current_run_id).input_message_id).text,
  ).toContain(request.id);
  expect(f.store.list("run")).toHaveLength(2);
});

test("unknown source or child remains held and only native reconciliation can release the exact continuation", () => {
  const { groups, group, peer } = setup();
  const { task, run } = root(groups, group);
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Check 42.",
    purpose: "review",
  });
  finish(run);
  const native = start(child.current_run_id);
  f.restart();
  const resumed = new Groups(f.lifecycle);
  resumed.advance();
  resumed.advance();
  expect(f.store.get("peer_task", child.id).state).toBe("unknown");
  expect(f.store.get("peer_task", task.id).state).toBe("waiting_peer");
  expect(f.store.list("run")).toHaveLength(2);
  const unknown = f.store.get("run", native.id);
  f.lifecycle.reconcile(
    unknown.id,
    unknown.revision,
    "succeeded",
    crypto.randomUUID(),
    "Verified 42.",
    unknown.native_run_id as string,
  );
  resumed.advance();
  resumed.advance();
  expect(f.store.get("peer_task", task.id).continuation).toBe(1);
  expect(f.store.list("run")).toHaveLength(3);
});

test("revocation between claim and tool/dispatch denies new peer effects", async () => {
  const { groups, group, peer } = setup();
  const connections = new Connections(f.lifecycle);
  const connection = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const { run } = root(groups, group);
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(run);
  groups.membership(group.id, { expected_revision: 1, member_agent_ids: [peer.id] });
  expect(() => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string)).toThrow(
    "SCOPE_DENIED",
  );
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.group_handoff", {
      command_id: crypto.randomUUID(),
      agent_id: peer.id,
      instruction: "No effect",
      purpose: "review",
    }),
  ).rejects.toThrow();
  expect(f.store.list("peer_task")).toHaveLength(1);
});

test("self/ancestor handoff cycles and a second unrelated HITL request are rejected", () => {
  const { groups, group, peer } = setup();
  const { run } = root(groups, group);
  expect(() =>
    groups.handoff(run.id, { agent_id: f.agent.id, instruction: "loop", purpose: "handoff" }),
  ).toThrow("CONFLICT");
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "review",
    purpose: "review",
  });
  finish(run, "The reviewer will continue on the shared workspace.");
  const childRun = start(child.current_run_id);
  expect(() =>
    groups.handoff(childRun.id, { agent_id: f.agent.id, instruction: "loop", purpose: "handoff" }),
  ).toThrow("CONFLICT");
  groups.askUser(childRun.id, { purpose: "input", question: "Which format?" });
  expect(() =>
    groups.askUser(childRun.id, { purpose: "input", question: "Which unrelated thing?" }),
  ).toThrow("CONFLICT");
});

test("HTTP exact retries, schemas, authored scope and request conflicts remain explicit", async () => {
  const { group, groups } = setup();
  const token = "g".repeat(64);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  const post = async (path: string, body: unknown, key = crypto.randomUUID()) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      }),
    );
  const body = { text: "@reviewer Check 42." };
  const key = crypto.randomUUID();
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => post(`/v1/groups/${group.id}/messages`, body, key)),
  );
  const receipts = await Promise.all(responses.map((r) => r.json()));
  expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
  expect(f.store.list("peer_task")).toHaveLength(1);
  expect(
    (await post(`/v1/groups/${group.id}/messages`, { ...body, owner_id: f.owner })).status,
  ).toBe(422);
  expect((await post(`/v1/groups/${group.id}/messages`, { text: "changed" }, key)).status).toBe(
    409,
  );
  expect((await post(`/v1/groups/${f.thread.id}/messages`, body)).status).toBe(403);
  const { run } = root(groups, group);
  const request = groups.askUser(run.id, {
    purpose: "approval",
    question: "Publish the supplied draft?",
    action: {
      tool_name: "ngertiin.create_file",
      arguments: { path: "draft.md", base64: "ZHJhZnQ=" },
    },
  });
  finish(run);
  const replyKey = crypto.randomUUID();
  const reply = { expected_revision: 1, decision: "approve" };
  const first = await post(`/v1/human-requests/${request.id}/reply`, reply, replyKey);
  expect(first.status).toBe(200);
  expect(
    await (await post(`/v1/human-requests/${request.id}/reply`, reply, replyKey)).json(),
  ).toEqual(await first.json());
  expect((await post(`/v1/human-requests/${request.id}/reply`, reply)).status).toBe(409);
});

test("a pending human request remains answerable while native outcome is unknown, without blind replay", () => {
  const { groups, group } = setup();
  const { task, run } = root(groups, group);
  const request = groups.askUser(run.id, { purpose: "input", question: "Choose a format." });
  f.restart();
  const resumed = new Groups(f.lifecycle);
  resumed.advance();
  expect(f.store.get("peer_task", task.id).state).toBe("waiting_user");
  resumed.reply(request.id, { expected_revision: 1, text: "Short." });
  resumed.advance();
  expect(f.store.list("run")).toHaveLength(1);
  const unknown = f.store.get("run", run.id);
  f.lifecycle.reconcile(
    run.id,
    unknown.revision,
    "succeeded",
    crypto.randomUUID(),
    "Waiting.",
    unknown.native_run_id as string,
  );
  resumed.advance();
  resumed.advance();
  expect(f.store.get("peer_task", task.id).continuation).toBe(1);
  expect(f.store.list("run")).toHaveLength(2);
});

test("routing leases cannot call product tools and revoked router work never dispatches after readd", async () => {
  const { groups, group, peer } = setup();
  const connections = new Connections(f.lifecycle);
  const connection = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const route = groups.send(group.id, { text: "Select a responder." });
  const run = start(route.router_run_id as string);
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(run);
  await expect(tools.call(lease.token, lease.scope, "ngertiin.list_memories", {})).rejects.toThrow(
    "SCOPE_DENIED",
  );
  const saved = groups.membership(group.id, { expected_revision: 1, member_agent_ids: [peer.id] });
  expect(f.store.get("run", run.id).cancellation).toBe("requested");
  expect(() => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string)).toThrow(
    "SCOPE_DENIED",
  );
  groups.membership(group.id, {
    expected_revision: saved.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  expect(() => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string)).toThrow(
    "STALE_DISPATCH",
  );
});

test("task result retrieval remains group scoped and bounded, including long peer results", () => {
  const { groups, group, peer } = setup();
  const { task, run } = root(groups, group);
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Check a long report.",
    purpose: "review",
  });
  finish(run);
  const childRun = start(child.current_run_id);
  finish(childRun, "Long checked result\n".repeat(4500));
  groups.advance();
  groups.advance();
  const current = f.store.get("peer_task", task.id);
  const continuation = f.store.get("run", current.current_run_id);
  expect(f.store.get("message", continuation.input_message_id).text.length).toBeLessThan(100_000);
  const page = groups.readTask(continuation.id, child.id);
  expect(page.result?.text.length).toBe(16_000);
  expect(page.next_offset).toBe(16_000);
  const other = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  }) as Entity<"thread">;
  const outsider = groups.send(other.id, { agent_id: f.agent.id, text: "Unrelated work." });
  expect(() =>
    groups.readTask(f.store.get("peer_task", outsider.task_id as string).current_run_id, child.id),
  ).toThrow("SCOPE_DENIED");
});

test("a failed collaboration transaction leaves no task, authored request, event or parent hold", () => {
  const { groups, group, peer } = setup();
  const { run, task } = root(groups, group);
  const cursor = f.store.cursor;
  const messages = f.store.list("message").length;
  expect(() =>
    f.store.command(crypto.randomUUID(), { action: "atomic_handoff" }, () => {
      groups.handoff(run.id, {
        agent_id: peer.id,
        instruction: "Review atomically.",
        purpose: "review",
      });
      throw new Error("Crash boundary before commit");
    }),
  ).toThrow("Crash boundary before commit");
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("message")).toHaveLength(messages);
  expect(f.store.list("peer_task")).toHaveLength(1);
  expect(f.store.get("peer_task", task.id).state).toBe("working");
});
