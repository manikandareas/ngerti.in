import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { Conversations } from "../src/conversations";
import { type HarnessId, manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { CodexAdapter } from "../src/harness/codex/adapter";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { MuseAdapter } from "../src/harness/muse/adapter";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
let broker: HarnessBroker | undefined;
let background: Background;
let app: ReturnType<typeof createApi>;
const token = "p".repeat(64);
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  if (app?.server) await app.stop();
  broker = undefined;
  f?.close();
});
function compose(native = false) {
  const tools = new ProductTools(f.lifecycle);
  if (native)
    broker = new HarnessBroker(
      f.lifecycle,
      new CredentialContexts(f.dir),
      tools,
      {
        codex: new CodexAdapter(
          () => `${base()}/v1/harness/tools`,
          [join(import.meta.dir, "fixtures/codex-app-server.ts")],
        ),
        muse: new MuseAdapter(
          () => `${base()}/v1/harness/tools`,
          [join(import.meta.dir, "fixtures/muse-serve.ts")],
        ),
      },
      async (harness) => ({
        harness,
        executable: process.execPath,
        version: manifests[harness].minimum_version,
        state: "supported",
        manifest: manifests[harness],
      }),
      (id, event, outcome) => {
        if (event.type === "text")
          f.lifecycle.appendAnswer(
            id,
            event.text,
            outcome === "succeeded" ? "complete" : "partial",
          );
      },
    );
  background = new Background(f.lifecycle, broker?.executors());
  app = createApi(f.lifecycle, background, token, {
    connections: new Connections(f.lifecycle),
    tools,
    broker,
  }).listen({ hostname: "127.0.0.1", port: 0 });
  return tools;
}
const base = () => `http://127.0.0.1:${app.server?.port}`;
async function request(path: string, body?: unknown, key: string = crypto.randomUUID()) {
  return fetch(`${base()}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function api(path: string, body?: unknown, key?: string) {
  const response = await request(path, body, key);
  const result = await response.json();
  expect(response.status).toBe(200);
  return result;
}
async function tobi(harness: HarnessId = "codex") {
  const receipt = await api("/v1/setup", {});
  const profile = f.store.get("agent", receipt.agent_id);
  const connection =
    harness === "codex"
      ? f.store.get("connection", profile.connection_id)
      : new Connections(f.lifecycle).create({
          harness,
          authentication: { method: "native_login", billing_source: "subscription" },
        });
  const agent = await api(`/v1/agents/${profile.id}/configuration`, {
    expected_revision: profile.revision,
    changes: { harness, connection_id: connection.id, model_id: "model-a", reasoning: "high" },
  });
  return { ...receipt, agent, connection };
}
async function run(threadId: string, agentId: string, text: string) {
  const admitted = await api("/v1/runs", { thread_id: threadId, agent_id: agentId, text });
  background.tick();
  await background.idle();
  const run = f.store.get("run", admitted.run.id);
  expect(run.status).toBe("succeeded");
  const answer = f.store
    .list("message")
    .find((message) => message.run_id === run.id && message.author === "agent");
  return { run, answer: JSON.parse(answer?.text ?? "null") };
}

test("concurrent HTTP setup and distinct retry keys produce one Tobi, primary DM and authored welcome without runs", async () => {
  f = fixture();
  compose();
  const receipts = await Promise.all(Array.from({ length: 32 }, () => api("/v1/setup", {})));
  expect(new Set(receipts.map((value) => value.agent_id)).size).toBe(1);
  expect(new Set(receipts.map((value) => value.thread_id)).size).toBe(1);
  expect(f.store.list("agent").filter((value) => value.system_role === "tobi")).toHaveLength(1);
  expect(f.store.list("message")).toHaveLength(1);
  expect(f.store.list("message")[0]).toMatchObject({
    author: "agent",
    author_agent_id: receipts[0].agent_id,
    run_id: null,
  });
  expect(f.store.list("run")).toHaveLength(0);
  const cursor = f.store.cursor;
  for (let i = 0; i < 3; i++) {
    await api(`/v1/threads/${receipts[0].thread_id}/snapshot`);
    await api(`/v1/threads/${receipts[0].thread_id}/history`);
    await api(`/v1/agents/${receipts[0].agent_id}/dm`, {});
  }
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("binding")).toHaveLength(0);
});

test("setup transaction rolls back all state, events and receipt, then retries safely after restart", () => {
  f = fixture();
  const cursor = f.store.cursor;
  const conversations = new Conversations(f.lifecycle);
  expect(() =>
    f.store.transaction(() => {
      conversations.setup();
      throw new Error("Simulated setup failure");
    }),
  ).toThrow("Simulated setup failure");
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("connection")).toHaveLength(1);
  const first = conversations.setup();
  f.restart();
  expect(new Conversations(f.lifecycle).setup()).toEqual(first);
  expect(f.store.list("message")).toHaveLength(1);
  expect(f.store.list("run")).toHaveLength(0);
});

test("configuration HTTP requires revisions and rejects identity/access injection and mismatched connections", async () => {
  f = fixture();
  compose();
  const lane = await tobi();
  const path = `/v1/agents/${lane.agent_id}/configuration`;
  const commandId = crypto.randomUUID();
  const change = {
    expected_revision: lane.agent.revision,
    changes: {
      name: "Tobi Updated",
      soul: "Careful researcher",
      skills: [{ source: "application", name: "research", revision: 2 }],
    },
  };
  const first = await api(path, change, commandId);
  expect(await api(path, change, commandId)).toEqual(first);
  expect((await request(path, change)).status).toBe(409);
  expect(
    (
      await request(path, {
        expected_revision: first.revision,
        changes: { configuration_access: "owner" },
      })
    ).status,
  ).toBe(422);
  expect(
    (
      await request(path, {
        expected_revision: first.revision,
        changes: { owner_id: crypto.randomUUID() },
      })
    ).status,
  ).toBe(422);
  expect(
    (await request(path, { expected_revision: first.revision, changes: { harness: "muse" } }))
      .status,
  ).toBe(403);
  expect((await request(path, { expected_revision: first.revision, changes: {} })).status).toBe(
    422,
  );
  expect(f.store.get("agent", lane.agent_id).name).toBe("Tobi Updated");
});

for (const harness of ["codex", "muse"] as const) {
  test(`${harness} native protocol fixture creates and updates an agent through scoped HTTP tools with durable deduplication`, async () => {
    f = fixture();
    compose(true);
    const lane = await tobi(harness);
    const payload = {
      name: "ngertiin.create_agent",
      arguments: {
        command_id: crypto.randomUUID(),
        profile: {
          name: "Writer",
          handle: "writer",
          soul: "Write clearly",
          harness,
          connection_id: lane.connection.id,
          model_id: "model-a",
          reasoning: "high",
        },
      },
    };
    const first = await run(
      lane.thread_id,
      lane.agent_id,
      `product-tool:${JSON.stringify(payload)}`,
    );
    const created =
      harness === "codex"
        ? JSON.parse(first.answer.tool.contentItems[0].text)
        : JSON.parse(first.answer.tool.result.content[0].text);
    expect(created.agent).toMatchObject({
      name: "Writer",
      configuration_access: "self",
      system_role: null,
    });
    await run(lane.thread_id, lane.agent_id, `product-tool:${JSON.stringify(payload)}`);
    expect(f.store.list("agent").filter((agent) => agent.handle === "writer")).toHaveLength(1);
    const update = {
      name: "ngertiin.update_agent",
      arguments: {
        command_id: crypto.randomUUID(),
        agent_id: created.agent.id,
        expected_revision: created.agent.revision,
        changes: { soul: "Write concise reports", instructions: "Cite primary sources." },
      },
    };
    await run(lane.thread_id, lane.agent_id, `product-tool:${JSON.stringify(update)}`);
    expect(f.store.get("agent", created.agent.id)).toMatchObject({
      revision: 2,
      soul: "Write concise reports",
    });
    expect(
      f.store
        .list("thread")
        .filter(
          (thread) => thread.type === "dm" && thread.member_agent_ids[0] === created.agent.id,
        ),
    ).toHaveLength(1);
    await background.stop();
    await broker?.close();
    await app.stop();
    broker = undefined;
    f.restart();
    compose(true);
    expect(new Conversations(f.lifecycle).setup().agent_id).toBe(lane.agent_id);
    expect(f.store.get("agent", created.agent.id).revision).toBe(2);
    const cursor = f.store.cursor;
    await api(`/v1/threads/${lane.thread_id}/snapshot`);
    expect(f.store.cursor).toBe(cursor);
    const resumed = await run(lane.thread_id, lane.agent_id, "Check resumed configuration");
    expect(resumed.run.binding_id).toBe(first.run.binding_id);
  });

  test(`${harness} configuration updates keep active snapshots and replace subsequent sessions with thread-only history`, async () => {
    f = fixture();
    compose(true);
    const lane = await tobi(harness);
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [lane.agent_id] });
    await run(lane.thread_id, lane.agent_id, "DM_PRIVATE_MARKER");
    await run(group.id, lane.agent_id, "GROUP_PRIVATE_MARKER");
    const admitted = await api("/v1/runs", {
      thread_id: lane.thread_id,
      agent_id: lane.agent_id,
      text: "wait",
    });
    background.tick();
    for (let i = 0; f.store.get("run", admitted.run.id).status !== "running" && i < 100; i++)
      await Bun.sleep(5);
    const active = f.store.get("run", admitted.run.id);
    expect(active.status).toBe("running");
    const edited = await api(`/v1/agents/${lane.agent_id}/configuration`, {
      expected_revision: lane.agent.revision,
      changes: { name: "Tobi Revised", instructions: "NEW_CONFIG_MARKER", avatar: "🌱" },
    });
    expect(f.store.get("run", active.id).agent_snapshot?.revision).toBe(lane.agent.revision);
    expect(f.lifecycle.executionAgent(lane.thread_id, lane.agent_id).name).toBe("Tobi");
    await api(`/v1/runs/${active.id}/steer`, { text: "Finish active work" });
    await background.idle();
    expect(f.store.get("run", active.id).status).toBe("succeeded");
    const next = await run(lane.thread_id, lane.agent_id, "Use current profile");
    expect(next.run.agent_snapshot?.revision).toBe(edited.revision);
    expect(next.run.binding_id).not.toBe(active.binding_id);
    expect(next.answer.profile_instructions).toContain("NEW_CONFIG_MARKER");
    expect(next.answer.profile_instructions).toContain("DM_PRIVATE_MARKER");
    expect(next.answer.profile_instructions).not.toContain("GROUP_PRIVATE_MARKER");
    const groupNext = await run(group.id, lane.agent_id, "Use group profile");
    expect(groupNext.answer.profile_instructions).toContain("NEW_CONFIG_MARKER");
    expect(groupNext.answer.profile_instructions).toContain("GROUP_PRIVATE_MARKER");
    expect(groupNext.answer.profile_instructions).not.toContain("DM_PRIVATE_MARKER");
    expect(f.store.get("binding", active.binding_id as string).active).toBe(false);
  });
}

test("tool scope denies ordinary agents owner configuration and prevents stale revisions and command reuse", async () => {
  f = fixture();
  const tools = compose();
  const lane = await tobi();
  const caller = f.lifecycle.createAgent({
    name: "Worker",
    harness: "codex",
    connection_id: lane.connection.id,
    model_id: "model-a",
  });
  const dm = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [caller.id] });
  const connections = new Connections(f.lifecycle);
  connections.update(connections.get(lane.connection.id), {
    capabilities: {
      ...connections.get(lane.connection.id).capabilities,
      product_tools: "supported",
    },
  });
  f.lifecycle.bind(dm.id, caller.id, "worker-native");
  f.lifecycle.admit({ thread_id: dm.id, agent_id: caller.id, text: "Configure" });
  const active = f.lifecycle.claimNext(dm.id, caller.id) as Entity<"run">;
  const lease = tools.issue(active);
  const update = {
    command_id: crypto.randomUUID(),
    agent_id: lane.agent_id,
    expected_revision: lane.agent.revision,
    changes: { name: "Unauthorized" },
  };
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", update),
  ).rejects.toThrow("SCOPE_DENIED");
  const own = { ...update, agent_id: caller.id, expected_revision: caller.revision };
  await tools.call(lease.token, lease.scope, "ngertiin.update_agent", own);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", {
      ...own,
      command_id: crypto.randomUUID(),
    }),
  ).rejects.toThrow("CONFLICT");
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", {
      ...own,
      changes: { name: "Different" },
    }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(
    tools.call(
      lease.token,
      { ...lease.scope, agent_id: lane.agent_id },
      "ngertiin.list_agents",
      {},
    ),
  ).rejects.toThrow("SCOPE_DENIED");
  connections.revoke(lane.connection.id);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", {
      ...own,
      command_id: crypto.randomUUID(),
      expected_revision: 2,
    }),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("history pagination and snapshot cursor survive restart with explicit authors and no duplicate replay", async () => {
  f = fixture();
  compose();
  const lane = await tobi();
  for (let i = 0; i < 5; i++)
    f.lifecycle.admit({ thread_id: lane.thread_id, agent_id: lane.agent_id, text: `Pesan ${i}` });
  const page = await api(`/v1/threads/${lane.thread_id}/history?limit=2`);
  const previous = await api(
    `/v1/threads/${lane.thread_id}/history?limit=2&before=${page.next_before}`,
  );
  expect(new Set([...page.messages, ...previous.messages].map((message) => message.id)).size).toBe(
    4,
  );
  const snapshot = await api(`/v1/threads/${lane.thread_id}/snapshot`);
  expect(snapshot.messages[0]).toMatchObject({
    author: "agent",
    author_agent_id: lane.agent_id,
    run_id: null,
  });
  expect(snapshot.messages.at(-1)).toMatchObject({
    author: "user",
    author_agent_id: null,
    text: "Pesan 4",
  });
  expect((await api(`/v1/events?after=${snapshot.cursor}`)).events).toHaveLength(0);
  expect(
    (await request(`/v1/threads/${lane.thread_id}/history?before=${f.thread.id}`)).status,
  ).toBe(403);
  await app.stop();
  f.restart();
  compose();
  expect(await api(`/v1/threads/${lane.thread_id}/snapshot`)).toEqual(snapshot);
});

test("concurrent configuration writes admit one expected revision and reject duplicate handles and invalid creation scope", async () => {
  f = fixture();
  compose();
  const lane = await tobi();
  const responses = await Promise.all(
    ["First", "Second"].map((name) =>
      request(`/v1/agents/${lane.agent_id}/configuration`, {
        expected_revision: lane.agent.revision,
        changes: { name },
      }),
    ),
  );
  expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
  expect(
    (
      await request("/v1/agents", {
        name: "Duplicate",
        handle: "tobi",
        harness: "codex",
        connection_id: lane.connection.id,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await request("/v1/agents", {
        name: "Unknown",
        harness: "codex",
        connection_id: crypto.randomUUID(),
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await request("/v1/agents", {
        name: "Wrong runtime",
        harness: "muse",
        connection_id: lane.connection.id,
      })
    ).status,
  ).toBe(403);
});

test("switching harness during active work preserves the old run and selects a new binding for the next work", async () => {
  f = fixture();
  compose(true);
  const lane = await tobi();
  const admitted = await api("/v1/runs", {
    thread_id: lane.thread_id,
    agent_id: lane.agent_id,
    text: "wait",
  });
  background.tick();
  for (let i = 0; f.store.get("run", admitted.run.id).status !== "running" && i < 100; i++)
    await Bun.sleep(5);
  const connection = new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  await api(`/v1/agents/${lane.agent_id}/configuration`, {
    expected_revision: lane.agent.revision,
    changes: { harness: "muse", connection_id: connection.id },
  });
  await api(`/v1/runs/${admitted.run.id}/steer`, { text: "Finish Codex work" });
  await background.idle();
  expect(f.store.get("run", admitted.run.id).agent_snapshot?.harness).toBe("codex");
  expect(f.store.get("run", admitted.run.id).status).toBe("succeeded");
  const next = await run(lane.thread_id, lane.agent_id, "Use Muse now");
  expect(next.run.agent_snapshot?.harness).toBe("muse");
  expect(f.store.get("binding", next.run.binding_id as string)).toMatchObject({
    harness: "muse",
    connection_id: connection.id,
  });
  expect(
    f.store.get("binding", f.store.get("run", admitted.run.id).binding_id as string).active,
  ).toBe(false);
});
