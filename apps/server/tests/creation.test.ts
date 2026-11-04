import { afterEach, expect, test } from "bun:test";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { Creation, openingState, retryOpening } from "../src/conversations/creation";
import { Groups } from "../src/groups/service";
import { Connections } from "../src/harness/connections";
import { ProductTools } from "../src/harness/tools";
import { Lifecycle } from "../src/lifecycle";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
function input() {
  return {
    connection_id: f.store.get("agent", f.agent.id).connection_id,
    billing_source: "subscription",
    model_id: null,
  };
}
test("creation collision handling and restart replay preserve one human opener and admission", () => {
  f = fixture();
  const operation = crypto.randomUUID();
  const service = new Creation(f.lifecycle, () => "Bright Fox");
  const first = service.agent(operation, input());
  const second = service.agent(crypto.randomUUID(), input());
  expect(first.agent.name).toBe("Bright Fox");
  expect(second.agent.name).toBe("Bright Fox 2");
  expect(first.message.author).toBe("user");
  expect(first.message.creation_operation_id).toBe(operation);
  const cursor = f.store.cursor;
  expect(service.agent(operation, input())).toEqual(first);
  f.restart();
  expect(new Creation(f.lifecycle).agent(operation, input())).toEqual(first);
  new Conversations(f.lifecycle).snapshot(first.thread.id);
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.list("goal")).toHaveLength(0);
  expect(f.store.list("routine")).toHaveLength(0);
});
test("billing mismatch rolls back creation without fallback", () => {
  f = fixture();
  const cursor = f.store.cursor;
  expect(() =>
    new Creation(f.lifecycle).agent(crypto.randomUUID(), { ...input(), billing_source: "api_key" }),
  ).toThrow("SCOPE_DENIED");
  expect(f.store.cursor).toBe(cursor);
});
test("group creation admits one router and scoped configuration never edits member profiles", () => {
  f = fixture();
  const service = new Creation(f.lifecycle);
  const operation = crypto.randomUUID();
  const data = { name: "Research", member_agent_ids: [f.agent.id] };
  const result = service.group(operation, data);
  expect(result.message.author).toBe("user");
  expect(result.route.state).toBe("pending");
  expect(f.store.list("run")).toHaveLength(1);
  const before = f.store.get("agent", f.agent.id);
  const saved = service.configureGroup(result.thread.id, {
    expected_revision: result.thread.revision,
    changes: { shared_instructions: "Research primary sources." },
  });
  expect(saved.shared_instructions).toBe("Research primary sources.");
  expect(f.store.get("agent", f.agent.id)).toEqual(before);
  expect(() =>
    service.configureGroup(f.thread.id, { expected_revision: 1, changes: { name: "Private" } }),
  ).toThrow("SCOPE_DENIED");
  expect(service.group(operation, data)).toEqual(result);
});

test("missing connection persists the identity and opener until explicitly configured", () => {
  f = fixture();
  const result = new Creation(f.lifecycle).agent(crypto.randomUUID(), {
    ...input(),
    connection_id: null,
    harness: "codex",
  });
  expect(result.agent.connection_id).toBeNull();
  expect(result.run.status).toBe("queued");
  f.restart();
  const configured = f.lifecycle.updateAgent(result.agent.id, {
    expected_revision: 1,
    changes: { connection_id: f.store.get("agent", f.agent.id).connection_id },
  });
  expect(configured.connection_id).not.toBeNull();
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("message")).toHaveLength(1);
});

test("failed opening retries reuse input; unknown outcomes never admit replacements", () => {
  f = fixture();
  const created = new Creation(f.lifecycle).agent(crypto.randomUUID(), input());
  const original = f.store.get("run", created.run.id);
  f.store.put(
    { ...original, status: "failed", outcome: "failed", revision: original.revision + 1 },
    original.revision,
  );
  const retried = retryOpening(f.lifecycle, created.thread.id, original.id);
  expect(retried.input_message_id).toBe(original.input_message_id);
  expect(f.store.list("message")).toHaveLength(1);
  expect(() => retryOpening(f.lifecycle, created.thread.id, original.id)).toThrow("CONFLICT");
  f.store.put(
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
  const cursor = f.store.cursor;
  expect(openingState(f.lifecycle, created.thread.id).recovery).toBe("reconcile");
  expect(() => retryOpening(f.lifecycle, created.thread.id, retried.id)).toThrow("CONFLICT");
  expect(f.store.cursor).toBe(cursor);
});

test("HTTP concurrent retries share creation and distinct actions avoid name collisions", async () => {
  f = fixture();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "p".repeat(64));
  const key = crypto.randomUUID();
  const send = (command = key) =>
    app.handle(
      new Request("http://localhost/v1/creation/agents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"p".repeat(64)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": command,
        },
        body: JSON.stringify(input()),
      }),
    );
  const responses = await Promise.all(Array.from({ length: 12 }, () => send()));
  const bodies = await Promise.all(responses.map((r) => r.json()));
  expect(responses.every((r) => r.status === 200)).toBe(true);
  expect(new Set(bodies.map((b) => b.agent.id)).size).toBe(1);
  expect(f.store.list("run")).toHaveLength(1);
  const others = await Promise.all(
    Array.from({ length: 12 }, () => send(crypto.randomUUID()).then((r) => r.json())),
  );
  expect(new Set(others.map((b) => b.agent.name)).size).toBe(12);
});

test("group tool lease cannot rewrite global profiles and can update only its group", async () => {
  f = fixture();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  const connections = new Connections(f.lifecycle);
  const connection = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  f.lifecycle.bind(group.id, f.agent.id, "group-session");
  f.lifecycle.admit({ thread_id: group.id, agent_id: f.agent.id, text: "Personalize this group" });
  const run = f.lifecycle.claimNext(group.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Expected claimed run.");
  f.lifecycle.started(run.id, run.dispatch_token, "group-turn");
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(f.store.get("run", run.id));
  const before = f.store.get("agent", f.agent.id);
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
  expect(f.store.get("agent", f.agent.id)).toEqual(before);
  expect(f.store.list("goal")).toHaveLength(0);
});

test("Jev group creation routes the final annotated opener and retains stale-content fencing", async () => {
  f = fixture();
  let decisions = 0;
  const lifecycle = new Lifecycle(f.store, {
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
  const created = new Creation(lifecycle).group(crypto.randomUUID(), {
    name: "Opening route",
    member_agent_ids: [f.agent.id],
  });
  const groups = new Groups(lifecycle);
  expect(groups.routingPacket(created.route.id).request).toBe(created.message.text);
  const background = new Background(lifecycle);
  background.tick();
  await background.idle();
  expect(decisions).toBe(1);
  expect(f.store.get("group_route", created.route.id).state).toBe("selected");
  expect(f.store.list("run")).toHaveLength(1);
  const changed = new Creation(lifecycle).group(crypto.randomUUID(), {
    name: "Changed opener",
    member_agent_ids: [f.agent.id],
  });
  const message = f.store.get("message", changed.message.id);
  f.store.put(
    { ...message, text: "A different request", revision: message.revision + 1 },
    message.revision,
  );
  expect(() => groups.routingPacket(changed.route.id)).toThrow("ROUTING_STALE");
});
