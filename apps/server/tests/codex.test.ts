import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { CodexAccounts } from "../src/harness/codex/accounts";
import { CodexAuthority } from "../src/harness/codex/authority";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { NativeSessionMissing } from "../src/harness/contracts";
import { ProductTools } from "../src/harness/tools";
import { codexFixture } from "./acp-fixture";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
let broker: HarnessBroker;
let background: Background;
let app: Awaited<ReturnType<typeof createApi>>;
const token = "a".repeat(64);
test("external Codex access tokens stay ephemeral and native refresh cannot change the selected account", async () => {
  f = await fixture();
  const connection = await new Connections(f.lifecycle).get(
    (f.agent as Entity<"agent">).connection_id,
  );
  const context = new CredentialContexts(f.dir).create(connection);
  const requested: boolean[] = [];
  const client = await codexFixture(() => "http://127.0.0.1:1").connect({
    ...context,
    executable: process.execPath,
    connection_id: connection.id,
    connection: {
      harness: "codex",
      provider_id: "openai",
      authentication: "native_login",
      account_id: null,
      billing_source: "subscription",
    },
    agent_id: f.agent.id,
    thread_id: f.thread.id,
    codexAuth: async (refresh = false) => {
      requested.push(refresh);
      return {
        accessToken: refresh ? "fixture-refreshed-token" : "fixture-request-refresh",
        chatgptAccountId: "fixture-account-a",
        chatgptPlanType: "free",
      };
    },
  });
  try {
    for (let i = 0; i < 100 && requested.length < 2; i++) await Bun.sleep(5);
    expect(requested).toEqual([false, true]);
    expect((await client.inspect()).account_id).toBe(
      createHash("sha256").update("fixture-account-a").digest("hex"),
    );
    expect((await client.inspect()).account_plan).toBe("free");
    expect(existsSync(join(context.env.CODEX_HOME, "auth.json"))).toBe(false);
  } finally {
    await client.close();
  }
});

test("one native credential authority coordinates simultaneous refresh consumers and survives its restart", async () => {
  f = await fixture();
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((f.agent as Entity<"agent">).connection_id);
  const credentials = new CredentialContexts(f.dir);
  const context = credentials.create(connection);
  writeFileSync(
    join(context.env.CODEX_HOME, "auth.json"),
    JSON.stringify({
      tokens: { access_token: "fixture-access-token", account_id: "fixture-account-a" },
    }),
    { mode: 0o600 },
  );
  const detect = async () => ({
    harness: "codex" as const,
    executable: process.execPath,
    version: "0.169.0",
    state: "supported" as const,
    manifest: manifests.codex,
  });
  const args = [join(import.meta.dir, "fixtures/codex-authority.ts")];
  let accounts = new CodexAccounts(connections, credentials, detect, args);
  try {
    await accounts.inspect(connection.id);
    const refreshed = await Promise.all([
      accounts.tokens(connection.id, true),
      accounts.tokens(connection.id, true),
      accounts.tokens(connection.id, true),
    ]);
    expect(new Set(refreshed.map((value) => value.chatgptAccountId))).toEqual(
      new Set(["fixture-account-a"]),
    );
    expect(refreshed.every((value) => value.chatgptPlanType === "plus")).toBe(true);
    const counts = () =>
      JSON.parse(readFileSync(join(context.env.CODEX_HOME, "fixture-auth-count.json"), "utf8"));
    expect(counts().refreshes).toBe(1);
    await accounts.close();
    accounts = new CodexAccounts(connections, credentials, detect, args);
    expect((await accounts.tokens(connection.id, true)).chatgptAccountId).toBe("fixture-account-a");
    expect(counts().refreshes).toBe(2);
    await connections.revoke(connection.id);
    await expect(accounts.tokens(connection.id, true)).rejects.toThrow("SCOPE_DENIED");
  } finally {
    await accounts.close();
  }
});
test("credential authority rejects conversation and tool dispatch before writing to the native process", async () => {
  f = await fixture();
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((f.agent as Entity<"agent">).connection_id);
  const context = new CredentialContexts(f.dir).create(connection);
  const authority = new CodexAuthority(process.execPath, context, [
    join(import.meta.dir, "fixtures/codex-authority.ts"),
  ]);
  try {
    await authority.initialize();
    for (const method of [
      "thread/start",
      "thread/resume",
      "turn/start",
      "turn/steer",
      "tools/call",
    ])
      await expect(authority.rpc.request(method)).rejects.toMatchObject({
        code: "CAPABILITY_UNSUPPORTED",
      });
    expect((await authority.inspect()).login).toBe("authenticated");
    expect((await authority.discoverModels())[0]?.id).toBe("model-a");
    expect("prompt" in authority).toBe(false);
  } finally {
    await authority.close();
  }
});
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  if (app?.server) await app.stop();
  await f?.close();
});
async function compose() {
  const tools = await ProductTools.open(f.lifecycle);
  broker = new HarnessBroker(
    f.lifecycle,
    Object.assign(new CredentialContexts(f.dir, () => "selected-key"), {
      codexTokens: async () => ({
        accessToken: "fixture-access",
        chatgptAccountId: "fixture-account-a",
      }),
    }),
    tools,
    {
      codex: codexFixture(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    },
    async () => ({
      harness: "codex",
      executable: process.execPath,
      version: "0.165.0",
      state: "supported",
      manifest: manifests.codex,
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
  background = new Background(f.lifecycle, broker.executors());
  app = (
    await createApi(f.lifecycle, background, token, {
      connections: broker.connections,
      tools,
      broker,
    })
  ).listen({ hostname: "127.0.0.1", port: 0 });
}
async function setup(key = false) {
  f = await fixture();
  const connection = await new Connections(f.lifecycle).create({
    harness: "codex",
    authentication: key
      ? { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() }
      : { method: "native_login", billing_source: "subscription" },
  });
  const agent = (await f.lifecycle.create("agent", {
    name: "Codex",
    harness: "codex",
    connection_id: connection.id,
    model_id: "model-a",
    reasoning: "high",
    instructions: "Keep the conversation private.",
  })) as Entity<"agent">;
  const thread = (await f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  })) as Entity<"thread">;
  await compose();
  return { connection, agent, thread };
}
async function post(path: string, body = {}) {
  const result = await fetch(`http://127.0.0.1:${app.server?.port}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  const value = await result.json();
  if (!result.ok) throw new Error(JSON.stringify(value));
  return value;
}
async function admit(lane: Awaited<ReturnType<typeof setup>>, text: string) {
  await post(`/v1/threads/${lane.thread.id}/sessions`, { agent_id: lane.agent.id });
  const { run } = await post("/v1/runs", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text,
  });
  await background.tick();
  return run as Entity<"run">;
}
async function waitRunning(id: string) {
  for (let i = 0; i < 100; i++) {
    if ((await f.store.get("run", id)).status === "running") return;
    await Bun.sleep(5);
  }
  throw new Error("Run did not reach native acceptance.");
}
test("an unused prewarmed Codex thread is replaced after its process closes before first dispatch", async () => {
  const lane = await setup();
  const prepared = await broker.openSession(lane.thread.id, lane.agent.id);
  expect(await f.store.list("run")).toHaveLength(0);
  await background.stop(100);
  await broker.close();
  await app.stop();
  await f.restart();
  await compose();
  const run = await admit(lane, "First message after unused prewarm closed.");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  const active = (await f.store.list("binding")).find((binding) => binding.active);
  expect(active?.native_session_id).not.toBe(prepared.native_session_id);
  expect(active?.generation).toBe(prepared.generation + 1);
  expect((await f.store.get("binding", prepared.id)).active).toBe(false);
  expect(
    (await f.store.list("message")).filter((message) => message.author === "agent"),
  ).toHaveLength(1);
});

test("a missing Codex rollout used by a prior dispatch is never silently replaced or replayed", async () => {
  const lane = await setup();
  const run = await admit(lane, "A previously completed native conversation.");
  await background.idle();
  const binding = (await f.store.list("binding")).find((item) => item.active);
  if (!binding) throw new Error("The completed run has no active native binding.");
  const messages = await f.store.list("message");
  await background.stop(100);
  await broker.close();
  await app.stop();
  const file = join(f.dir, "connections", lane.connection.id, "codex", "fixture-sessions.json");
  renameSync(file, `${file}.saved`);
  await f.restart();
  await compose();
  await expect(broker.openSession(lane.thread.id, lane.agent.id)).rejects.toBeInstanceOf(
    NativeSessionMissing,
  );
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  expect(await f.store.get("binding", binding.id)).toEqual(binding);
  expect(await f.store.list("message")).toEqual(messages);
});

test("Codex JSONL fixture performs an HTTP product-tool round trip and persists owned output", async () => {
  const lane = await setup();
  const run = await admit(lane, "Private DM input 日本語");
  await background.idle();
  expect(await f.store.get("run", run.id)).toMatchObject({
    status: "succeeded",
    native_run_id: null,
    native_dispatch_id: expect.any(String),
  });
  const answer = (await f.store.list("message")).find((m) => m.author === "agent");
  expect(answer).toMatchObject({ thread_id: lane.thread.id, run_id: run.id, state: "complete" });
  expect(answer?.text).toContain(lane.thread.id);
  expect(answer?.text).toContain("Private DM input 日本語");
  expect(await f.store.get("connection", lane.connection.id)).toMatchObject({
    login: "authenticated",
    discovery: "succeeded",
    inference: "succeeded",
  });
});
test("Codex publishes search activity at start and preserves overlapping file work", async () => {
  const lane = await setup();
  const run = await admit(lane, "activity-search");
  await background.idle();
  const observations = (await f.store.events(0))
    .filter((event) => event.entity_id === run.id)
    .map((event) => event.data as Entity<"run">);
  expect(
    observations.some((value) => value.active_tools?.some((step) => step.kind === "searching")),
  ).toBe(true);
  expect(observations.some((value) => value.active_tools?.length === 2)).toBe(true);
  expect(
    observations.some(
      (value) => value.active_tools?.length === 1 && value.active_tools[0].kind === "updating",
    ),
  ).toBe(true);
  expect(await f.store.get("run", run.id)).toMatchObject({ status: "succeeded", active_tools: [] });
});
test("native session and separate DM/group histories survive backend and child restart", async () => {
  const lane = await setup();
  const group = (await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [lane.agent.id],
  })) as Entity<"thread">;
  await admit(lane, "DM-secret");
  await background.idle();
  await admit({ ...lane, thread: group }, "group-secret");
  await background.idle();
  const bindings = await f.store.list("binding");
  expect(new Set(bindings.map((b) => b.native_session_id)).size).toBe(2);
  await background.stop();
  await broker.close();
  await app.stop();
  await f.restart();
  await compose();
  const run = await admit(lane, "DM-after-restart");
  await background.idle();
  expect((await f.store.list("binding")).map((b) => b.native_session_id).sort()).toEqual(
    bindings.map((b) => b.native_session_id).sort(),
  );
  const answer = (await f.store.list("message")).find(
    (m) => m.author === "agent" && m.run_id === run.id,
  );
  expect(answer?.text).toContain("DM-secret");
  expect(answer?.text).not.toContain("group-secret");
});
test("selected API-key authentication is observed separately without a subscription fallback", async () => {
  const lane = await setup(true);
  await admit(lane, "Key request");
  await background.idle();
  expect(await f.store.get("connection", lane.connection.id)).toMatchObject({
    authentication: { method: "api_key", billing_source: "api_key" },
    login: "authenticated",
    inference: "succeeded",
  });
  expect(JSON.stringify(await f.store.events(0))).not.toContain("selected-key");
});
test("native interruption ack stays intent until interrupted terminal confirmation", async () => {
  const lane = await setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/cancel`);
  await background.tick();
  expect((await f.store.get("run", run.id)).cancellation).toBe("requested");
  await background.idle();
  expect(await f.store.get("run", run.id)).toMatchObject({
    status: "cancelled",
    cancellation: "confirmed",
  });
});
test("steer is bound to the active native turn and keeps the same run", async () => {
  const lane = await setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/steer`, { text: "Use the updated direction" });
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  expect(await f.store.list("run")).toHaveLength(1);
  expect((await f.store.list("message")).at(-1)?.text).toBe("Use the updated direction");
});
test("a native tool request cannot use another thread scope", async () => {
  const lane = await setup();
  const run = await admit(lane, "wrong-scope");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("failed");
  expect((await f.store.list("message")).filter((m) => m.author === "agent")).toHaveLength(0);
});
test("process loss preserves partial output and blocks automatic replay", async () => {
  const lane = await setup();
  const run = await admit(lane, "disconnect");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
  expect((await f.store.list("message")).at(-1)).toMatchObject({
    text: "Partial answer",
    state: "partial",
  });
  await background.tick();
  expect(background.activeCount).toBe(0);
});
test("mismatched native terminal identity remains unknown", async () => {
  const lane = await setup();
  const run = await admit(lane, "wrong-terminal");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
});
test("explicit native turn rejection fails without publishing native error secrets", async () => {
  const lane = await setup();
  const run = await admit(lane, "reject");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("failed");
  expect(JSON.stringify(await f.store.events(0))).not.toContain("sk-native-secret");
});

test("Codex streams a stable partial message before the native turn completes", async () => {
  const lane = await setup();
  const run = await admit(lane, "stream-wait");
  await waitRunning(run.id);
  for (
    let i = 0;
    i < 100 && !(await f.store.list("message")).some((item) => item.author === "agent");
    i++
  )
    await Bun.sleep(5);
  const partial = (await f.store.list("message")).find((item) => item.author === "agent");
  expect(partial?.state).toBe("partial");
  expect(partial?.text).toContain("Streaming native output");
  expect((await f.store.get("run", run.id)).status).toBe("running");
  await post(`/v1/runs/${run.id}/steer`, { text: "Finish with this correction" });
  await background.idle();
  expect((await f.store.list("message")).filter((item) => item.author === "agent")).toHaveLength(1);
  expect((await f.store.get("message", partial?.id as string)).state).toBe("complete");
});

test("Codex reconciles native commit before publication after restart without repeating a tool effect", async () => {
  const lane = await setup();
  const command = crypto.randomUUID();
  const run = await admit(
    lane,
    `crash-after-commit:${JSON.stringify({ name: "ngertiin.update_agent", arguments: { command_id: command, agent_id: lane.agent.id, expected_revision: 1, changes: { soul: "Committed exactly once" } } })}`,
  );
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
  expect((await f.store.get("agent", lane.agent.id)).revision).toBe(2);
  await background.stop();
  await broker.close();
  await app.stop();
  await f.restart();
  await compose();
  const result = await post(`/v1/runs/${run.id}/reconcile`, {});
  expect(result.status).toBe("succeeded");
  const cursor = await f.store.cursor;
  expect((await post(`/v1/runs/${run.id}/reconcile`, {})).status).toBe("succeeded");
  expect(await f.store.cursor).toBe(cursor);
  expect(await f.store.get("agent", lane.agent.id)).toMatchObject({
    revision: 2,
    soul: "Committed exactly once",
  });
  expect(await f.store.list("run")).toHaveLength(1);
  expect((await f.store.list("message")).filter((item) => item.author === "agent")).toHaveLength(1);
  expect((await f.store.list("message")).find((item) => item.author === "agent")?.state).toBe(
    "complete",
  );
});

test("default reasoning omits the native config override and completes a turn", async () => {
  const lane = await setup();
  await f.lifecycle.updateAgent(lane.agent.id, {
    expected_revision: lane.agent.revision,
    changes: { reasoning: null },
  });
  const run = await admit(lane, "Use the native reasoning default.");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
});

test("native commentary and final answer item phases stay separate in live output and receipt recovery", async () => {
  const lane = await setup();
  const run = await admit(lane, "phase-output");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  expect((await f.store.answer(run.id))?.text).toBe("Here is the useful final example.");
});
