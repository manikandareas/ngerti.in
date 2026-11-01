import { afterEach, expect, test } from "bun:test";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { CodexAdapter } from "../src/harness/codex/adapter";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
let broker: HarnessBroker;
let background: Background;
let app: ReturnType<typeof createApi>;
const token = "a".repeat(64);
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  if (app?.server) await app.stop();
  f?.close();
});
function compose() {
  const tools = new ProductTools(f.lifecycle);
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir, () => "selected-key"),
    tools,
    {
      codex: new CodexAdapter(
        () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`,
        [join(import.meta.dir, "fixtures/codex-app-server.ts")],
      ),
    },
    async () => ({
      harness: "codex",
      executable: process.execPath,
      version: "0.165.0",
      state: "supported",
      manifest: manifests.codex,
    }),
    (id, event, outcome) => {
      if (event.type === "text")
        f.lifecycle.appendAnswer(id, event.text, outcome === "succeeded" ? "complete" : "partial");
    },
  );
  background = new Background(f.lifecycle, broker.executors());
  app = createApi(f.lifecycle, background, token, {
    connections: broker.connections,
    tools,
    broker,
  }).listen({ hostname: "127.0.0.1", port: 0 });
}
function setup(key = false) {
  f = fixture();
  const connection = new Connections(f.lifecycle).create({
    harness: "codex",
    authentication: key
      ? { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() }
      : { method: "native_login", billing_source: "subscription" },
  });
  const agent = f.lifecycle.create("agent", {
    name: "Codex",
    harness: "codex",
    connection_id: connection.id,
    model_id: "model-a",
    reasoning: "high",
    instructions: "Keep the conversation private.",
  }) as Entity<"agent">;
  const thread = f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  }) as Entity<"thread">;
  compose();
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
async function admit(lane: ReturnType<typeof setup>, text: string) {
  await post(`/v1/threads/${lane.thread.id}/sessions`, { agent_id: lane.agent.id });
  const { run } = await post("/v1/runs", {
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text,
  });
  background.tick();
  return run as Entity<"run">;
}
async function waitRunning(id: string) {
  for (let i = 0; i < 100; i++) {
    if (f.store.get("run", id).status === "running") return;
    await Bun.sleep(5);
  }
  throw new Error("Run did not reach native acceptance.");
}
test("Codex JSONL fixture performs an HTTP product-tool round trip and persists owned output", async () => {
  const lane = setup();
  const run = await admit(lane, "Private DM input 日本語");
  await background.idle();
  expect(f.store.get("run", run.id)).toMatchObject({
    status: "succeeded",
    native_run_id: expect.any(String),
  });
  const answer = f.store.list("message").find((m) => m.author === "agent");
  expect(answer).toMatchObject({ thread_id: lane.thread.id, run_id: run.id, state: "complete" });
  expect(answer?.text).toContain(lane.thread.id);
  expect(answer?.text).toContain("Private DM input 日本語");
  expect(f.store.get("connection", lane.connection.id)).toMatchObject({
    login: "authenticated",
    discovery: "succeeded",
    inference: "succeeded",
  });
});
test("native session and separate DM/group histories survive backend and child restart", async () => {
  const lane = setup();
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [lane.agent.id],
  }) as Entity<"thread">;
  await admit(lane, "DM-secret");
  await background.idle();
  await admit({ ...lane, thread: group }, "group-secret");
  await background.idle();
  const bindings = f.store.list("binding");
  expect(new Set(bindings.map((b) => b.native_session_id)).size).toBe(2);
  await background.stop();
  await broker.close();
  await app.stop();
  f.restart();
  compose();
  const run = await admit(lane, "DM-after-restart");
  await background.idle();
  expect(f.store.list("binding")).toEqual(bindings);
  const answer = f.store.list("message").find((m) => m.author === "agent" && m.run_id === run.id);
  expect(answer?.text).toContain("DM-secret");
  expect(answer?.text).not.toContain("group-secret");
});
test("selected API-key authentication is observed separately without a subscription fallback", async () => {
  const lane = setup(true);
  await admit(lane, "Key request");
  await background.idle();
  expect(f.store.get("connection", lane.connection.id)).toMatchObject({
    authentication: { method: "api_key", billing_source: "api_key" },
    login: "authenticated",
    inference: "succeeded",
  });
  expect(JSON.stringify(f.store.events(0))).not.toContain("selected-key");
});
test("native interruption ack stays intent until interrupted terminal confirmation", async () => {
  const lane = setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/cancel`);
  background.tick();
  expect(f.store.get("run", run.id).cancellation).toBe("requested");
  await background.idle();
  expect(f.store.get("run", run.id)).toMatchObject({
    status: "cancelled",
    cancellation: "confirmed",
  });
});
test("steer is bound to the active native turn and keeps the same run", async () => {
  const lane = setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/steer`, { text: "Use the updated direction" });
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("succeeded");
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("message").at(-1)?.text).toBe("Use the updated direction");
});
test("native permission escalation is declined and reported unsupported", async () => {
  const lane = setup();
  await admit(lane, "permission");
  await background.idle();
  expect(f.store.get("connection", lane.connection.id).capabilities.permission_requests).toBe(
    "unsupported",
  );
  expect(f.store.list("message").at(-1)?.text).toBe('{"decision":"decline"}');
});
test("a native tool request cannot use another thread scope", async () => {
  const lane = setup();
  const run = await admit(lane, "wrong-scope");
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("failed");
  expect(f.store.list("message").filter((m) => m.author === "agent")).toHaveLength(0);
});
test("process loss preserves partial output and blocks automatic replay", async () => {
  const lane = setup();
  const run = await admit(lane, "disconnect");
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("unknown");
  expect(f.store.list("message").at(-1)).toMatchObject({
    text: "Partial answer",
    state: "partial",
  });
  background.tick();
  expect(background.activeCount).toBe(0);
});
test("mismatched native terminal identity remains unknown", async () => {
  const lane = setup();
  const run = await admit(lane, "wrong-terminal");
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("unknown");
});
test("explicit native turn rejection fails without publishing native error secrets", async () => {
  const lane = setup();
  const run = await admit(lane, "reject");
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("failed");
  expect(JSON.stringify(f.store.events(0))).not.toContain("sk-native-secret");
});

test("Codex streams a stable partial message before the native turn completes", async () => {
  const lane = setup();
  const run = await admit(lane, "stream-wait");
  await waitRunning(run.id);
  for (let i = 0; i < 100 && !f.store.list("message").some((item) => item.author === "agent"); i++)
    await Bun.sleep(5);
  const partial = f.store.list("message").find((item) => item.author === "agent");
  expect(partial?.state).toBe("partial");
  expect(partial?.text).toContain("Streaming native output");
  expect(f.store.get("run", run.id).status).toBe("running");
  await post(`/v1/runs/${run.id}/steer`, { text: "Finish with this correction" });
  await background.idle();
  expect(f.store.list("message").filter((item) => item.author === "agent")).toHaveLength(1);
  expect(f.store.get("message", partial?.id as string).state).toBe("complete");
});

test("Codex reconciles native commit before publication after restart without repeating a tool effect", async () => {
  const lane = setup();
  const command = crypto.randomUUID();
  const run = await admit(
    lane,
    `crash-after-commit:${JSON.stringify({ name: "ngertiin.update_agent", arguments: { command_id: command, agent_id: lane.agent.id, expected_revision: 1, changes: { soul: "Committed exactly once" } } })}`,
  );
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("unknown");
  expect(f.store.get("agent", lane.agent.id).revision).toBe(2);
  await background.stop();
  await broker.close();
  await app.stop();
  f.restart();
  compose();
  const result = await post(`/v1/runs/${run.id}/reconcile`, {});
  expect(result.status).toBe("succeeded");
  const cursor = f.store.cursor;
  expect((await post(`/v1/runs/${run.id}/reconcile`, {})).status).toBe("succeeded");
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.get("agent", lane.agent.id)).toMatchObject({
    revision: 2,
    soul: "Committed exactly once",
  });
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("message").filter((item) => item.author === "agent")).toHaveLength(1);
  expect(f.store.list("message").find((item) => item.author === "agent")?.state).toBe("complete");
});

test("default reasoning omits the native config override and completes a turn", async () => {
  const lane = setup();
  f.lifecycle.updateAgent(lane.agent.id, {
    expected_revision: lane.agent.revision,
    changes: { reasoning: null },
  });
  const run = await admit(lane, "Use the native reasoning default.");
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("succeeded");
});
