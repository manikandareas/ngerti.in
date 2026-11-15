import { afterEach, expect, test } from "bun:test";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { Creation, openingState, retryOpening } from "../src/conversations/creation";
import { Groups } from "../src/groups/service";
import { Connections } from "../src/harness/connections";
import { ProductTools } from "../src/harness/tools";
import { Lifecycle } from "../src/lifecycle";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function input() {
  return {
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
    billing_source: "subscription",
    model_id: null,
  };
}
test("creation collision handling and restart replay preserve one human opener and admission", async () => {
  f = await fixture();
  const operation = crypto.randomUUID();
  const service = new Creation(f.lifecycle, () => "Bright Fox");
  const first = await service.agent(operation, await input());
  const second = await service.agent(crypto.randomUUID(), await input());
  expect(first.agent.name).toBe("Bright Fox");
  expect(second.agent.name).toBe("Bright Fox 2");
  expect(first.message.author).toBe("user");
  expect(first.message.creation_operation_id).toBe(operation);
  const cursor = await f.store.cursor;
  expect(await service.agent(operation, await input())).toEqual(first);
  await f.restart();
  expect(await new Creation(f.lifecycle).agent(operation, await input())).toEqual(first);
  await new Conversations(f.lifecycle).snapshot(first.thread.id);
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("run")).toHaveLength(2);
  expect(await f.store.list("goal")).toHaveLength(0);
  expect(await f.store.list("routine")).toHaveLength(0);
});
test("billing mismatch rolls back creation without fallback", async () => {
  f = await fixture();
  const cursor = await f.store.cursor;
  await expect(
    (async () =>
      new Creation(f.lifecycle).agent(crypto.randomUUID(), {
        ...(await input()),
        billing_source: "api_key",
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(await f.store.cursor).toBe(cursor);
});
test("group creation admits one router and scoped configuration never edits member profiles", async () => {
  f = await fixture();
  const service = new Creation(f.lifecycle);
  const operation = crypto.randomUUID();
  const data = { name: "Research", member_agent_ids: [f.agent.id] };
  const result = await service.group(operation, data);
  expect(result.message.author).toBe("user");
  expect(result.route.state).toBe("pending");
  expect(await f.store.list("run")).toHaveLength(1);
  const before = await f.store.get("agent", f.agent.id);
  const saved = await service.configureGroup(result.thread.id, {
    expected_revision: result.thread.revision,
    changes: { shared_instructions: "Research primary sources." },
  });
  expect(saved.shared_instructions).toBe("Research primary sources.");
  expect(await f.store.get("agent", f.agent.id)).toEqual(before);
  await expect(
    (async () =>
      service.configureGroup(f.thread.id, {
        expected_revision: 1,
        changes: { name: "Private" },
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(await service.group(operation, data)).toEqual(result);
});

test("missing connection persists the identity and opener until explicitly configured", async () => {
  f = await fixture();
  const result = await new Creation(f.lifecycle).agent(crypto.randomUUID(), {
    ...(await input()),
    connection_id: null,
    harness: "codex",
  });
  expect(result.agent.connection_id).toBeNull();
  expect(result.run.status).toBe("queued");
  await f.restart();
  const configured = await f.lifecycle.updateAgent(result.agent.id, {
    expected_revision: 1,
    changes: { connection_id: (await f.store.get("agent", f.agent.id)).connection_id },
  });
  expect(configured.connection_id).not.toBeNull();
  expect(await f.store.list("run")).toHaveLength(1);
  expect(await f.store.list("message")).toHaveLength(1);
});

test("failed opening retries reuse input; unknown outcomes never admit replacements", async () => {
  f = await fixture();
  const created = await new Creation(f.lifecycle).agent(crypto.randomUUID(), await input());
  const original = await f.store.get("run", created.run.id);
  await f.store.put(
    { ...original, status: "failed", outcome: "failed", revision: original.revision + 1 },
    original.revision,
  );
  const retried = await retryOpening(f.lifecycle, created.thread.id, original.id);
  expect(retried.input_message_id).toBe(original.input_message_id);
  expect(await f.store.list("message")).toHaveLength(1);
  await expect(
    (async () => retryOpening(f.lifecycle, created.thread.id, original.id))(),
  ).rejects.toThrow("CONFLICT");
  await f.store.put(
    {
      ...retried,
      status: "unknown",
      outcome: "unknown",
      dispatch_token: crypto.randomUUID(),
      binding_id: crypto.randomUUID(),
      authority_epoch: crypto.randomUUID(),
      revision: retried.revision + 1,
    },
    retried.revision,
  );
  const cursor = await f.store.cursor;
  expect((await openingState(f.lifecycle, created.thread.id)).recovery).toBe("reconcile");
  await expect(
    (async () => retryOpening(f.lifecycle, created.thread.id, retried.id))(),
  ).rejects.toThrow("CONFLICT");
  expect(await f.store.cursor).toBe(cursor);
});

test("HTTP concurrent retries share creation and distinct actions avoid name collisions", async () => {
  f = await fixture();
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), "p".repeat(64));
  const key = crypto.randomUUID();
  const send = async (command = key) =>
    app.handle(
      new Request("http://localhost/v1/creation/agents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"p".repeat(64)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": command,
        },
        body: JSON.stringify(await input()),
      }),
    );
  const responses = await Promise.all(Array.from({ length: 12 }, async () => await send()));
  const bodies = await Promise.all(responses.map((r) => r.json()));
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(new Set(bodies.map((b) => b.agent.id)).size).toBe(1);
  expect(await f.store.list("run")).toHaveLength(1);
  const others = await Promise.all(
    Array.from({ length: 12 }, () => send(crypto.randomUUID()).then((r) => r.json())),
  );
  expect(new Set(others.map((b) => b.agent.name)).size).toBe(12);
});

test("group tool lease cannot rewrite global profiles and can update only its group", async () => {
  f = await fixture();
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  await f.lifecycle.bind(group.id, f.agent.id, "group-session");
  await f.lifecycle.admit({
    thread_id: group.id,
    agent_id: f.agent.id,
    text: "Personalize this group",
  });
  const run = await f.lifecycle.claimNext(group.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Expected claimed run.");
  await f.lifecycle.started(run.id, run.dispatch_token, "group-turn");
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(await f.store.get("run", run.id));
  const before = await f.store.get("agent", f.agent.id);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", {
      command_id: crypto.randomUUID(),
      agent_id: f.agent.id,
      expected_revision: before.revision,
      changes: { name: "Leaked profile" },
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  const changed = await tools.call(lease.token, lease.scope, "ngertiin.update_group", {
    command_id: crypto.randomUUID(),
    expected_revision: group.revision,
    changes: { name: "Scoped group" },
  });
  expect((changed as { name: string }).name).toBe("Scoped group");
  expect(await f.store.get("agent", f.agent.id)).toEqual(before);
  expect(await f.store.list("goal")).toHaveLength(0);
});

test("Jev group creation routes the final annotated opener and retains stale-content fencing", async () => {
  f = await fixture();
  let decisions = 0;
  const lifecycle = await Lifecycle.open(f.store, {
    choose: async () => {
      decisions++;
      return {
        agent_id: f.agent.id,
        model: "fixture",
        confidence: 1,
        probabilities: { [f.agent.id]: 1 },
        input_tokens: 0,
      };
    },
  });
  const created = await new Creation(lifecycle).group(crypto.randomUUID(), {
    name: "Opening route",
    member_agent_ids: [f.agent.id],
  });
  const groups = new Groups(lifecycle);
  expect((await groups.routingPacket(created.route.id)).request).toBe(created.message.text);
  const background = new Background(lifecycle);
  await background.tick();
  await background.idle();
  expect(decisions).toBe(1);
  expect((await f.store.get("group_route", created.route.id)).state).toBe("selected");
  expect(await f.store.list("run")).toHaveLength(1);
  const changed = await new Creation(lifecycle).group(crypto.randomUUID(), {
    name: "Changed opener",
    member_agent_ids: [f.agent.id],
  });
  const message = await f.store.get("message", changed.message.id);
  await f.store.put(
    { ...message, text: "A different request", revision: message.revision + 1 },
    message.revision,
  );
  await expect((async () => groups.routingPacket(changed.route.id))()).rejects.toThrow(
    "ROUTING_STALE",
  );
});
