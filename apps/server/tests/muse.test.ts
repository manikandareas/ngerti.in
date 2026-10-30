import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { HarnessAccounts } from "../src/harness/accounts";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { MuseAccounts } from "../src/harness/muse/accounts";
import { MuseAdapter } from "../src/harness/muse/adapter";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
let broker: HarnessBroker;
let background: Background;
let accounts: MuseAccounts;
let app: ReturnType<typeof createApi>;
const token = "a".repeat(64);
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  await accounts?.close();
  if (app?.server) await app.stop();
  f?.close();
});
function compose() {
  const tools = new ProductTools(f.lifecycle);
  const credentials = new CredentialContexts(f.dir, () => "selected-key");
  const detect = async () => ({
    harness: "muse" as const,
    executable: process.execPath,
    version: "1.4.14",
    state: "supported" as const,
    manifest: manifests.muse,
  });
  accounts = new MuseAccounts(new Connections(f.lifecycle), credentials, detect, [
    join(import.meta.dir, "fixtures/muse-serve.ts"),
  ]);
  broker = new HarnessBroker(
    f.lifecycle,
    credentials,
    tools,
    {
      muse: new MuseAdapter(
        () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`,
        [join(import.meta.dir, "fixtures/muse-serve.ts")],
      ),
    },
    async () => ({
      harness: "muse",
      executable: process.execPath,
      version: "1.4.14",
      state: "supported",
      manifest: manifests.muse,
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
    accounts: new HarnessAccounts(broker.connections, { muse: accounts }),
  }).listen({ hostname: "127.0.0.1", port: 0 });
}
function setup(key = false) {
  f = fixture();
  const connection = new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: key
      ? { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() }
      : { method: "native_login", billing_source: "subscription" },
  });
  const agent = f.lifecycle.create("agent", {
    name: "Muse",
    harness: "muse",
    connection_id: connection.id,
    model_id: "model-a",
    reasoning: "high",
    instructions: "",
  }) as Entity<"agent">;
  const thread = f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  }) as Entity<"thread">;
  compose();
  return { connection, agent, thread };
}
async function post(path: string, body: unknown = {}) {
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
test("official Muse SDK fixture completes an actual scoped HTTP product-tool call", async () => {
  const lane = setup(true);
  const run = await admit(lane, "Private DM input 日本語");
  await background.idle();
  expect(f.store.get("run", run.id)).toMatchObject({
    status: "succeeded",
    native_run_id: expect.any(String),
  });
  const answer = f.store.list("message").find((m) => m.author === "agent");
  expect(answer?.text).toContain(lane.thread.id);
  expect(answer?.text).toContain("Private DM input 日本語");
  expect(answer?.text).not.toContain('"error"');
  expect(JSON.stringify(f.store.events(0))).not.toContain("selected-key");
  expect(f.store.get("connection", lane.connection.id)).toMatchObject({
    authentication: { billing_source: "api_key" },
    login: "authenticated",
    discovery: "succeeded",
    inference: "succeeded",
    effective_billing_source: "api_key",
  });
});
test("native history resumes the exact DM after restart without importing group history", async () => {
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
  await accounts.close();
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
test("effective stored key cannot masquerade as a subscription after browser login", async () => {
  const lane = setup();
  await post(`/v1/connections/${lane.connection.id}/inspect`);
  writeFileSync(join(f.dir, "connections", lane.connection.id, "home", "mode"), "apiKey");
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/connections/${lane.connection.id}/inspect`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "BILLING_MISMATCH" } });
  expect(f.store.get("connection", lane.connection.id).inference).toBe("not_attempted");
  expect(f.store.get("connection", lane.connection.id).effective_billing_source).toBe("unknown");
});
test("missing credentials remain login-required and device login does not claim inference", async () => {
  const lane = setup();
  await post(`/v1/connections/${lane.connection.id}/inspect`);
  writeFileSync(join(f.dir, "connections", lane.connection.id, "home", "mode"), "loggedOut");
  const inspected = await post(`/v1/connections/${lane.connection.id}/inspect`);
  expect(inspected.login).toBe("required");
  expect(inspected.effective_billing_source).toBe("unknown");
  const login = await post(`/v1/connections/${lane.connection.id}/login`);
  expect(login).toMatchObject({
    auth_url: "https://example.test/device",
    user_code: "FIXTURE-CODE",
  });
  expect(f.store.get("connection", lane.connection.id).inference).toBe("not_attempted");
  await post(`/v1/connections/${lane.connection.id}/login/cancel`);
});
test("key-selected connection cannot start browser login", async () => {
  const lane = setup(true);
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/connections/${lane.connection.id}/login`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "BILLING_MISMATCH" } });
});
test("interrupt acknowledgement remains intent until native cancelled terminal arrives", async () => {
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
test("steer targets one native turn without a second application run", async () => {
  const lane = setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/steer`, { text: "Updated direction" });
  await background.idle();
  expect(f.store.get("run", run.id).status).toBe("succeeded");
  expect(f.store.list("message").at(-1)?.text).toBe("Updated direction");
  expect(f.store.list("run")).toHaveLength(1);
});
test("interrupt acknowledgement alone cannot fabricate cancellation", async () => {
  const lane = setup();
  const run = await admit(lane, "stop-ack-only");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/cancel`);
  background.tick();
  await Bun.sleep(50);
  expect(f.store.get("run", run.id)).toMatchObject({
    status: "cancel_requested",
    cancellation: "requested",
  });
  await background.stop(30);
  expect(f.store.get("run", run.id)).toMatchObject({
    status: "unknown",
    cancellation: "requested",
  });
  await broker.close();
  await background.idle();
});
test("revoked connection cannot answer a pending native question", async () => {
  const lane = setup();
  const run = await admit(lane, "question");
  await waitRunning(run.id);
  await post(`/v1/connections/${lane.connection.id}/revoke`);
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "user_input",
        request_id: "question-1",
        answers: [{ questionId: "q", selectedLabel: "SQLite" }],
      }),
    },
  );
  expect(response.status).toBe(403);
});
for (const input of ["question", "approval"])
  test(`native ${input} exposes scoped pending interaction and validates its answer`, async () => {
    const lane = setup();
    const run = await admit(lane, input);
    await waitRunning(run.id);
    const query = async () =>
      (
        await fetch(`http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json();
    let pending = await query();
    for (let i = 0; i < 100; i++) {
      pending = await query();
      if (pending.approvals?.length || pending.user_inputs?.length) break;
      await Bun.sleep(5);
    }
    expect(pending[input === "question" ? "user_inputs" : "approvals"]).toHaveLength(1);
    const invalid =
      input === "question"
        ? {
            type: "user_input",
            request_id: "question-1",
            answers: [{ questionId: "q", selectedLabel: "invented" }],
          }
        : { type: "approval", request_id: "approval-1", source_index: 1, choice_id: "approve" };
    const bad = await fetch(`http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(invalid),
    });
    expect(bad.status).toBe(409);
    const answer =
      input === "question"
        ? {
            type: "user_input",
            request_id: "question-1",
            answers: [{ questionId: "q", selectedLabel: "SQLite" }],
          }
        : { type: "approval", request_id: "approval-1", source_index: 2, choice_id: "deny" };
    await post(`/v1/runs/${run.id}/interactions`, answer);
    await background.idle();
    expect(f.store.get("run", run.id).status).toBe("succeeded");
    expect(f.store.list("message").at(-1)?.text).toContain(
      input === "question" ? "SQLite" : "deny",
    );
  });
for (const [input, status] of [
  ["failed", "failed"],
  ["disconnect", "unknown"],
  ["gap", "unknown"],
  ["unknown-terminal", "unknown"],
  ["reject", "failed"],
] as const)
  test(`native ${input} remains ${status}`, async () => {
    const lane = setup();
    const run = await admit(lane, input);
    await background.idle();
    expect(f.store.get("run", run.id).status).toBe(status);
    if (input === "disconnect")
      expect(f.store.list("message").at(-1)).toMatchObject({
        text: "Partial before disconnect",
        state: "partial",
      });
    if (input === "failed")
      expect(f.store.list("message").at(-1)).toMatchObject({
        text: "Partial response",
        state: "partial",
      });
  });
