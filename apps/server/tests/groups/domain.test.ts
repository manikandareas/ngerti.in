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

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function setup() {
  f = await fixture();
  const connection = await new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const peer = await f.lifecycle.createAgent({
    name: "Reviewer",
    handle: "reviewer",
    soul: "Review calculations",
    harness: "muse",
    connection_id: connection.id,
  });
  const group = (await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  })) as Entity<"thread">;
  return { peer, group, groups: new Groups(f.lifecycle) };
}
async function start(runId: string) {
  const queued = await f.store.get("run", runId);
  if (
    !(await f.store.list("binding")).some(
      (b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id,
    )
  )
    await f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = (await f.lifecycle.claimNext(queued.thread_id, queued.agent_id)) as Entity<"run">;
  expect(run.id).toBe(runId);
  await f.lifecycle.started(run.id, run.dispatch_token as string, crypto.randomUUID());
  return await f.store.get("run", run.id);
}
async function finish(
  run: Entity<"run">,
  text = "Completed useful work.",
  outcome: "succeeded" | "failed" | "unknown" = "succeeded",
) {
  await f.lifecycle.appendAnswer(run.id, text);
  await f.lifecycle.settle(run.id, run.dispatch_token as string, outcome);
}
async function root(groups: Groups, group: Entity<"thread">) {
  const route = await groups.send(group.id, {
    text: "Produce a reviewed calculation.",
    agent_id: f.agent.id,
  });
  const task = await f.store.get("peer_task", route.task_id as string);
  return { task, run: await start(task.current_run_id) };
}

test("mention selects exactly one valid member and invalid addresses create no work", async () => {
  const { groups, group, peer } = await setup();
  const route = await groups.send(group.id, { text: "@reviewer Check this calculation." });
  expect(route).toMatchObject({
    state: "selected",
    selected_agent_id: peer.id,
    router_run_id: null,
  });
  expect(await f.store.list("run")).toHaveLength(1);
  expect(await f.store.list("message")).toHaveLength(1);
  for (const text of ["@outsider hello", "@reviewer @other hello"])
    await expect((async () => groups.send(group.id, { text }))()).rejects.toThrow();
  await expect(
    (async () => groups.send(group.id, { text: "@reviewer hello", agent_id: f.agent.id }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect((async () => groups.send(f.thread.id, { text: "hello" }))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
  expect(await f.store.list("run")).toHaveLength(1);
});

test("model routing uses the scoped packet, validates output and never writes selection bubbles", async () => {
  const { groups, group, peer } = await setup();
  await f.admit("PRIVATE_DM_SECRET");
  await new Memories(f.lifecycle).write(
    { agent_id: f.agent.id, thread_id: f.thread.id },
    {
      memory_id: crypto.randomUUID(),
      expected_revision: 0,
      visibility: "dm_private",
      text: "PRIVATE_MEMORY_SECRET",
    },
  );
  const route = await groups.send(group.id, { text: "Please review the calculation." });
  const run = await start(route.router_run_id as string);
  const prompt = (await f.store.get("message", run.input_message_id)).text;
  expect(prompt).toContain("Review calculations");
  expect(prompt).not.toContain("PRIVATE_DM_SECRET");
  expect(prompt).not.toContain("PRIVATE_MEMORY_SECRET");
  await finish(run, JSON.stringify({ agent_id: peer.id }));
  await groups.advance();
  await groups.advance();
  expect(await f.store.get("group_route", route.id)).toMatchObject({
    state: "selected",
    selected_agent_id: peer.id,
  });
  expect(await f.store.list("peer_task")).toHaveLength(1);
  const snapshot = await new Conversations(f.lifecycle).snapshot(group.id);
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.messages[0]?.author).toBe("user");
  expect(snapshot.runs).toHaveLength(1);
  expect(snapshot.runs[0]?.agent_id).toBe(peer.id);
  expect(await groups.context(snapshot.runs[0] as Entity<"run">)).not.toMatch(
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
  test(`invalid model route fails closed: ${output}`, async () => {
    const { groups, group } = await setup();
    const route = await groups.send(group.id, { text: "Choose the best responder." });
    await finish(await start(route.router_run_id as string), output);
    await groups.advance();
    expect((await f.store.get("group_route", route.id)).state).toBe("rejected");
    expect(await f.store.list("peer_task")).toHaveLength(0);
    expect((await new Conversations(f.lifecycle).snapshot(group.id)).messages).toHaveLength(1);
  });
}

test("membership edits fence stale routing and revoke queued work even after readding the member", async () => {
  const { groups, group, peer } = await setup();
  const route = await groups.send(group.id, { text: "Route me." });
  const router = await start(route.router_run_id as string);
  const directed = await groups.send(group.id, { text: "Check me.", agent_id: peer.id });
  const task = await f.store.get("peer_task", directed.task_id as string);
  const changed = await groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  expect((await f.store.get("run", task.current_run_id)).status).toBe("cancelled");
  await groups.membership(group.id, {
    expected_revision: changed.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  await finish(router, JSON.stringify({ agent_id: peer.id }));
  await groups.advance();
  expect(await f.store.get("group_route", route.id)).toMatchObject({
    state: "rejected",
    error_code: "ROUTING_STALE",
  });
  expect((await f.store.get("peer_task", task.id)).state).toBe("cancelled");
  await expect(
    (async () =>
      groups.membership(group.id, { expected_revision: 1, member_agent_ids: [peer.id] }))(),
  ).rejects.toThrow("CONFLICT");
});

test("cross-harness child review, lineage and atomic parent continuation survive repeated restart reconciliation", async () => {
  const { groups, group, peer } = await setup();
  const { task, run } = await root(groups, group);
  const input = { agent_id: peer.id, instruction: "Review 19 + 23 = 42.", purpose: "review" };
  const commandId = crypto.randomUUID();
  const child = await f.store.command(
    commandId,
    input,
    async () => await groups.handoff(run.id, input),
  );
  expect(
    await f.store.command(commandId, input, async () => await groups.handoff(run.id, input)),
  ).toEqual(child);
  expect(child).toMatchObject({
    parent_task_id: task.id,
    root_task_id: task.id,
    source_run_id: run.id,
    source_agent_id: f.agent.id,
  });
  expect(await f.store.get("message", child.request_message_id)).toMatchObject({
    author: "agent",
    author_agent_id: f.agent.id,
    source_run_id: run.id,
    purpose: "review",
  });
  await finish(run, "The reviewer will check my calculation.");
  await finish(await start(child.current_run_id), "Confirmed: 19 + 23 = 42.");
  await f.restart();
  let resumed = new Groups(f.lifecycle);
  await resumed.advance();
  await resumed.advance();
  const current = await f.store.get("peer_task", task.id);
  expect(current).toMatchObject({ state: "working", continuation: 1 });
  expect(
    (
      await f.store.get(
        "message",
        (
          await f.store.get("run", current.current_run_id)
        ).input_message_id,
      )
    ).text,
  ).toContain("Confirmed: 19 + 23 = 42.");
  const count = (await f.store.list("run")).length;
  await f.restart();
  resumed = new Groups(f.lifecycle);
  await resumed.advance();
  await resumed.advance();
  expect(await f.store.list("run")).toHaveLength(count);
  await finish(await start(current.current_run_id), "Reviewed result: 42.");
  await resumed.advance();
  expect((await f.store.get("peer_task", task.id)).state).toBe("completed");
  const messages = (await new Conversations(f.lifecycle).snapshot(group.id)).messages;
  expect(messages.some((m) => m.purpose === "continuation")).toBe(false);
  expect(
    messages.filter((m) => m.run_id === child.current_run_id && m.purpose === "conversation")[0]
      ?.author_agent_id,
  ).toBe(peer.id);
  expect(messages.every((m) => !/^(?:pass|skip|no.response)$/i.test(m.text))).toBe(true);
});

test("human reply stays bound to its request across restart and duplicate/stale replies cannot resume another task", async () => {
  const { groups, group } = await setup();
  const { task, run } = await root(groups, group);
  const request = await groups.askUser(run.id, {
    purpose: "review",
    question: "Should the final answer include the derivation?",
  });
  await finish(run, "Waiting for your review.");
  await groups.advance();
  expect((await f.store.get("peer_task", task.id)).state).toBe("waiting_user");
  expect(await f.store.list("run")).toHaveLength(1);
  await f.restart();
  const resumed = new Groups(f.lifecycle);
  const key = crypto.randomUUID();
  const input = { expected_revision: request.revision, text: "Yes, include the derivation." };
  const reply = await f.store.command(
    key,
    input,
    async () => await resumed.reply(request.id, input),
  );
  expect(
    await f.store.command(key, input, async () => await resumed.reply(request.id, input)),
  ).toEqual(reply);
  await expect((async () => resumed.reply(request.id, input))()).rejects.toThrow("CONFLICT");
  await resumed.advance();
  await resumed.advance();
  const current = await f.store.get("peer_task", task.id);
  expect(current.continuation).toBe(1);
  expect((await f.store.get("human_request", request.id)).continuation_run_id).toBe(
    current.current_run_id,
  );
  expect(
    (
      await f.store.get(
        "message",
        (
          await f.store.get("run", current.current_run_id)
        ).input_message_id,
      )
    ).text,
  ).toContain(request.id);
  expect(await f.store.list("run")).toHaveLength(2);
});

test("unknown source or child remains held and only native reconciliation can release the exact continuation", async () => {
  const { groups, group, peer } = await setup();
  const { task, run } = await root(groups, group);
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Check 42.",
    purpose: "review",
  });
  await finish(run);
  const native = await start(child.current_run_id);
  await f.restart();
  const resumed = new Groups(f.lifecycle);
  await resumed.advance();
  await resumed.advance();
  expect((await f.store.get("peer_task", child.id)).state).toBe("unknown");
  expect((await f.store.get("peer_task", task.id)).state).toBe("waiting_peer");
  expect(await f.store.list("run")).toHaveLength(2);
  const unknown = await f.store.get("run", native.id);
  await f.lifecycle.reconcile(
    unknown.id,
    unknown.revision,
    "succeeded",
    crypto.randomUUID(),
    "Verified 42.",
    unknown.native_run_id as string,
  );
  await resumed.advance();
  await resumed.advance();
  expect((await f.store.get("peer_task", task.id)).continuation).toBe(1);
  expect(await f.store.list("run")).toHaveLength(3);
});

test("revocation between claim and tool/dispatch denies new peer effects", async () => {
  const { groups, group, peer } = await setup();
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const { run } = await root(groups, group);
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(run);
  await groups.membership(group.id, { expected_revision: 1, member_agent_ids: [peer.id] });
  await expect(
    (async () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.group_handoff", {
      command_id: crypto.randomUUID(),
      agent_id: peer.id,
      instruction: "No effect",
      purpose: "review",
    }),
  ).rejects.toThrow();
  expect(await f.store.list("peer_task")).toHaveLength(1);
});

test("self/ancestor handoff cycles and a second unrelated HITL request are rejected", async () => {
  const { groups, group, peer } = await setup();
  const { run } = await root(groups, group);
  await expect(
    (async () =>
      groups.handoff(run.id, { agent_id: f.agent.id, instruction: "loop", purpose: "handoff" }))(),
  ).rejects.toThrow("CONFLICT");
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "review",
    purpose: "review",
  });
  await finish(run, "The reviewer will continue on the shared workspace.");
  const childRun = await start(child.current_run_id);
  await expect(
    (async () =>
      groups.handoff(childRun.id, {
        agent_id: f.agent.id,
        instruction: "loop",
        purpose: "handoff",
      }))(),
  ).rejects.toThrow("CONFLICT");
  await groups.askUser(childRun.id, { purpose: "input", question: "Which format?" });
  await expect(
    (async () =>
      groups.askUser(childRun.id, { purpose: "input", question: "Which unrelated thing?" }))(),
  ).rejects.toThrow("CONFLICT");
});

test("HTTP exact retries, schemas, authored scope and request conflicts remain explicit", async () => {
  const { group, groups } = await setup();
  const token = "g".repeat(64);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
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
  expect(await f.store.list("peer_task")).toHaveLength(1);
  expect(
    (await post(`/v1/groups/${group.id}/messages`, { ...body, owner_id: f.owner })).status,
  ).toBe(422);
  expect((await post(`/v1/groups/${group.id}/messages`, { text: "changed" }, key)).status).toBe(
    409,
  );
  expect((await post(`/v1/groups/${f.thread.id}/messages`, body)).status).toBe(403);
  const { run } = await root(groups, group);
  const request = await groups.askUser(run.id, {
    purpose: "approval",
    question: "Publish the supplied draft?",
    action: {
      tool_name: "ngertiin.create_file",
      arguments: { path: "draft.md", base64: "ZHJhZnQ=" },
    },
  });
  await finish(run);
  const replyKey = crypto.randomUUID();
  const reply = { expected_revision: 1, decision: "approve" };
  const first = await post(`/v1/human-requests/${request.id}/reply`, reply, replyKey);
  expect(first.status).toBe(200);
  expect(
    await (await post(`/v1/human-requests/${request.id}/reply`, reply, replyKey)).json(),
  ).toEqual(await first.json());
  expect((await post(`/v1/human-requests/${request.id}/reply`, reply)).status).toBe(409);
});

test("a pending human request remains answerable while native outcome is unknown, without blind replay", async () => {
  const { groups, group } = await setup();
  const { task, run } = await root(groups, group);
  const request = await groups.askUser(run.id, { purpose: "input", question: "Choose a format." });
  await f.restart();
  const resumed = new Groups(f.lifecycle);
  await resumed.advance();
  expect((await f.store.get("peer_task", task.id)).state).toBe("waiting_user");
  await resumed.reply(request.id, { expected_revision: 1, text: "Short." });
  await resumed.advance();
  expect(await f.store.list("run")).toHaveLength(1);
  const unknown = await f.store.get("run", run.id);
  await f.lifecycle.reconcile(
    run.id,
    unknown.revision,
    "succeeded",
    crypto.randomUUID(),
    "Waiting.",
    unknown.native_run_id as string,
  );
  await resumed.advance();
  await resumed.advance();
  expect((await f.store.get("peer_task", task.id)).continuation).toBe(1);
  expect(await f.store.list("run")).toHaveLength(2);
});

test("routing leases cannot call product tools and revoked router work never dispatches after readd", async () => {
  const { groups, group, peer } = await setup();
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const route = await groups.send(group.id, { text: "Select a responder." });
  const run = await start(route.router_run_id as string);
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(run);
  await expect(tools.call(lease.token, lease.scope, "ngertiin.list_memories", {})).rejects.toThrow(
    "SCOPE_DENIED",
  );
  const saved = await groups.membership(group.id, {
    expected_revision: 1,
    member_agent_ids: [peer.id],
  });
  expect((await f.store.get("run", run.id)).cancellation).toBe("requested");
  await expect(
    (async () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string))(),
  ).rejects.toThrow("SCOPE_DENIED");
  await groups.membership(group.id, {
    expected_revision: saved.revision,
    member_agent_ids: [f.agent.id, peer.id],
  });
  await expect(
    (async () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string))(),
  ).rejects.toThrow("STALE_DISPATCH");
});

test("task result retrieval remains group scoped and bounded, including long peer results", async () => {
  const { groups, group, peer } = await setup();
  const { task, run } = await root(groups, group);
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Check a long report.",
    purpose: "review",
  });
  await finish(run);
  const childRun = await start(child.current_run_id);
  await finish(childRun, "Long checked result\n".repeat(4500));
  await groups.advance();
  await groups.advance();
  const current = await f.store.get("peer_task", task.id);
  const continuation = await f.store.get("run", current.current_run_id);
  expect((await f.store.get("message", continuation.input_message_id)).text.length).toBeLessThan(
    100_000,
  );
  const page = await groups.readTask(continuation.id, child.id);
  expect(page.result?.text.length).toBe(16_000);
  expect(page.next_offset).toBe(16_000);
  const other = (await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  })) as Entity<"thread">;
  const outsider = await groups.send(other.id, { agent_id: f.agent.id, text: "Unrelated work." });
  await expect(
    (async () =>
      groups.readTask(
        (await f.store.get("peer_task", outsider.task_id as string)).current_run_id,
        child.id,
      ))(),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("a failed collaboration transaction leaves no task, authored request, event or parent hold", async () => {
  const { groups, group, peer } = await setup();
  const { run, task } = await root(groups, group);
  const cursor = await f.store.cursor;
  const messages = (await f.store.list("message")).length;
  await expect(
    (async () =>
      f.store.command(crypto.randomUUID(), { action: "atomic_handoff" }, async () => {
        await groups.handoff(run.id, {
          agent_id: peer.id,
          instruction: "Review atomically.",
          purpose: "review",
        });
        throw new Error("Crash boundary before commit");
      }))(),
  ).rejects.toThrow("Crash boundary before commit");
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("message")).toHaveLength(messages);
  expect(await f.store.list("peer_task")).toHaveLength(1);
  expect((await f.store.get("peer_task", task.id)).state).toBe("working");
});
