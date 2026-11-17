import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { Conversations } from "../src/conversations";
import { type HarnessId, manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { MuseAdapter } from "../src/harness/muse/adapter";
import { ProductTools } from "../src/harness/tools";
import { codexFixture } from "./acp-fixture";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
let broker: HarnessBroker | undefined;
let background: Background;
let app: Awaited<ReturnType<typeof createApi>>;
const token = "p".repeat(64);
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  if (app?.server) await app.stop();
  broker = undefined;
  await f?.close();
});
async function compose(native = false) {
  const tools = await ProductTools.open(f.lifecycle);
  if (native)
    broker = new HarnessBroker(
      f.lifecycle,
      Object.assign(new CredentialContexts(f.dir), {
        codexTokens: async () => ({
          accessToken: "fixture-access",
          chatgptAccountId: "fixture-account-a",
        }),
      }),
      tools,
      {
        codex: codexFixture(() => `${base()}/v1/harness/tools`),
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
      async (id, event, outcome) => {
        if (event.type === "text")
          await f.lifecycle.appendAnswer(
            id,
            event.text,
            outcome === "succeeded" ? "complete" : "partial",
          );
      },
    );
  background = new Background(f.lifecycle, broker?.executors());
  app = (
    await createApi(f.lifecycle, background, token, {
      connections: new Connections(f.lifecycle),
      tools,
      broker,
    })
  ).listen({ hostname: "127.0.0.1", port: 0 });
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
  expect(response.status, JSON.stringify(result)).toBe(200);
  return result;
}
async function tobi(harness: HarnessId = "codex") {
  const receipt = await api("/v1/setup", {});
  const profile = await f.store.get("agent", receipt.agent_id);
  const connection =
    harness === "codex"
      ? await f.store.get("connection", profile.connection_id)
      : await new Connections(f.lifecycle).create({
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
  await background.tick();
  await background.idle();
  const run = await f.store.get("run", admitted.run.id);
  expect(run.status).toBe("succeeded");
  const answer = (await f.store.list("message")).find(
    (message) => message.run_id === run.id && message.author === "agent",
  );
  return { run, answer: JSON.parse(answer?.text ?? "null") };
}

test("concurrent HTTP setup and distinct retry keys produce one default agent, primary DM and authored welcome without runs", async () => {
  f = await fixture();
  await compose();
  const receipts = await Promise.all(Array.from({ length: 32 }, async () => api("/v1/setup", {})));
  expect(new Set(receipts.map((value) => value.agent_id)).size).toBe(1);
  expect(new Set(receipts.map((value) => value.thread_id)).size).toBe(1);
  expect(
    (await f.store.list("agent")).filter((value) => value.system_role === "tobi"),
  ).toHaveLength(1);
  expect(await f.store.list("message")).toHaveLength(1);
  expect((await f.store.list("message"))[0]).toMatchObject({
    author: "agent",
    author_agent_id: receipts[0].agent_id,
    run_id: null,
  });
  expect(await f.store.list("run")).toHaveLength(0);
  const cursor = await f.store.cursor;
  for (let i = 0; i < 3; i++) {
    await api(`/v1/threads/${receipts[0].thread_id}/snapshot`);
    await api(`/v1/threads/${receipts[0].thread_id}/history`);
    await api(`/v1/agents/${receipts[0].agent_id}/dm`, {});
  }
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("binding")).toHaveLength(0);
});

test("setup transaction rolls back all state, events and receipt, then retries safely after restart", async () => {
  f = await fixture();
  const cursor = await f.store.cursor;
  const conversations = new Conversations(f.lifecycle);
  await expect(
    (async () =>
      f.store.transaction(async () => {
        await conversations.setup();
        throw new Error("Simulated setup failure");
      }))(),
  ).rejects.toThrow("Simulated setup failure");
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.list("connection")).toHaveLength(1);
  const first = await conversations.setup();
  await f.restart();
  expect(await new Conversations(f.lifecycle).setup()).toEqual(first);
  expect(await f.store.list("message")).toHaveLength(1);
  expect(await f.store.list("run")).toHaveLength(0);
});

test("configuration HTTP requires revisions and rejects identity/access injection and mismatched connections", async () => {
  f = await fixture();
  await compose();
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
  expect((await f.store.get("agent", lane.agent_id)).name).toBe("Tobi Updated");
});

for (const harness of ["codex", "muse"] as const) {
  test(`${harness} native protocol fixture creates and updates an agent through scoped HTTP tools with durable deduplication`, async () => {
    f = await fixture();
    await compose(true);
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
    expect((await f.store.list("agent")).filter((agent) => agent.handle === "writer")).toHaveLength(
      1,
    );
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
    expect(await f.store.get("agent", created.agent.id)).toMatchObject({
      revision: 2,
      soul: "Write concise reports",
    });
    expect(
      (await f.store.list("thread")).filter(
        (thread) => thread.type === "dm" && thread.member_agent_ids[0] === created.agent.id,
      ),
    ).toHaveLength(1);
    await background.stop();
    await broker?.close();
    await app.stop();
    broker = undefined;
    await f.restart();
    await compose(true);
    expect((await new Conversations(f.lifecycle).setup()).agent_id).toBe(lane.agent_id);
    expect((await f.store.get("agent", created.agent.id)).revision).toBe(2);
    const cursor = await f.store.cursor;
    await api(`/v1/threads/${lane.thread_id}/snapshot`);
    expect(await f.store.cursor).toBe(cursor);
    const resumed = await run(lane.thread_id, lane.agent_id, "Check resumed configuration");
    expect(resumed.run.binding_id).toBe(first.run.binding_id);
  });

  test(`${harness} configuration updates keep active snapshots and replace subsequent sessions with thread-only history`, async () => {
    f = await fixture();
    await compose(true);
    const lane = await tobi(harness);
    const group = await api("/v1/threads", { type: "group", member_agent_ids: [lane.agent_id] });
    await run(lane.thread_id, lane.agent_id, "DM_PRIVATE_MARKER");
    await run(group.id, lane.agent_id, "GROUP_PRIVATE_MARKER");
    const admitted = await api("/v1/runs", {
      thread_id: lane.thread_id,
      agent_id: lane.agent_id,
      text: "wait",
    });
    await background.tick();
    const acceptedDeadline = Date.now() + 10_000;
    while (
      (await f.store.get("run", admitted.run.id)).status !== "running" &&
      Date.now() < acceptedDeadline
    )
      await Bun.sleep(5);
    const active = await f.store.get("run", admitted.run.id);
    expect(active.status).toBe("running");
    const edited = await api(`/v1/agents/${lane.agent_id}/configuration`, {
      expected_revision: lane.agent.revision,
      changes: { name: "Tobi Revised", instructions: "NEW_CONFIG_MARKER", avatar: "🌱" },
    });
    expect((await f.store.get("run", active.id)).agent_snapshot?.revision).toBe(
      lane.agent.revision,
    );
    expect((await f.lifecycle.executionAgent(lane.thread_id, lane.agent_id)).name).toBe(
      lane.agent.name,
    );
    if (harness === "codex")
      await api(`/v1/runs/${active.id}/steer`, { text: "Finish active work" });
    else await api(`/v1/runs/${active.id}/cancel`, {});
    await background.idle();
    expect((await f.store.get("run", active.id)).status).toBe(
      harness === "codex" ? "succeeded" : "cancelled",
    );
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
    expect((await f.store.get("binding", active.binding_id as string)).active).toBe(false);
  });
}

test("tool scope denies ordinary agents owner configuration and prevents stale revisions and command reuse", async () => {
  f = await fixture();
  const tools = await compose();
  const lane = await tobi();
  const caller = await f.lifecycle.createAgent({
    name: "Worker",
    harness: "codex",
    connection_id: lane.connection.id,
    model_id: "model-a",
  });
  const dm = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [caller.id] });
  const connections = new Connections(f.lifecycle);
  await connections.update(await connections.get(lane.connection.id), {
    capabilities: {
      ...(await connections.get(lane.connection.id)).capabilities,
      product_tools: "supported",
    },
  });
  await f.lifecycle.bind(dm.id, caller.id, "worker-native");
  await f.lifecycle.admit({ thread_id: dm.id, agent_id: caller.id, text: "Configure" });
  const active = (await f.lifecycle.claimNext(dm.id, caller.id)) as Entity<"run">;
  const lease = await tools.issue(active);
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
  await connections.revoke(lane.connection.id);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.update_agent", {
      ...own,
      command_id: crypto.randomUUID(),
      expected_revision: 2,
    }),
  ).rejects.toThrow("SCOPE_DENIED");
});

test("history pagination and snapshot cursor survive restart with explicit authors and no duplicate replay", async () => {
  f = await fixture();
  await compose();
  const lane = await tobi();
  for (let i = 0; i < 5; i++)
    await f.lifecycle.admit({
      thread_id: lane.thread_id,
      agent_id: lane.agent_id,
      text: `Pesan ${i}`,
    });
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
  await f.restart();
  await compose();
  expect(await api(`/v1/threads/${lane.thread_id}/snapshot`)).toEqual(snapshot);
});

test("concurrent configuration writes admit one expected revision and reject duplicate handles and invalid creation scope", async () => {
  f = await fixture();
  await compose();
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
        handle: lane.agent.handle,
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
  f = await fixture();
  await compose(true);
  const lane = await tobi();
  const admitted = await api("/v1/runs", {
    thread_id: lane.thread_id,
    agent_id: lane.agent_id,
    text: "wait",
  });
  await background.tick();
  const acceptedDeadline = Date.now() + 10_000;
  while (
    (await f.store.get("run", admitted.run.id)).status !== "running" &&
    Date.now() < acceptedDeadline
  )
    await Bun.sleep(5);
  expect((await f.store.get("run", admitted.run.id)).status).toBe("running");
  const connection = await new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  await api(`/v1/agents/${lane.agent_id}/configuration`, {
    expected_revision: lane.agent.revision,
    changes: { harness: "muse", connection_id: connection.id },
  });
  await api(`/v1/runs/${admitted.run.id}/steer`, { text: "Finish Codex work" });
  await background.idle();
  expect((await f.store.get("run", admitted.run.id)).agent_snapshot?.harness).toBe("codex");
  expect((await f.store.get("run", admitted.run.id)).status).toBe("succeeded");
  const next = await run(lane.thread_id, lane.agent_id, "Use Muse now");
  expect(next.run.agent_snapshot?.harness).toBe("muse");
  expect(await f.store.get("binding", next.run.binding_id as string)).toMatchObject({
    harness: "muse",
    connection_id: connection.id,
  });
  expect(
    (await f.store.get("binding", (await f.store.get("run", admitted.run.id)).binding_id as string))
      .active,
  ).toBe(false);
});
