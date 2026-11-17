import { afterEach, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
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
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
let broker: HarnessBroker;
let background: Background;
let accounts: MuseAccounts;
let app: Awaited<ReturnType<typeof createApi>>;
const token = "a".repeat(64);
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  await accounts?.close();
  if (app?.server) await app.stop();
  await f?.close();
});
async function compose() {
  const tools = await ProductTools.open(f.lifecycle);
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
      accounts: new HarnessAccounts(broker.connections, { muse: accounts }),
    })
  ).listen({ hostname: "127.0.0.1", port: 0 });
}
async function setup(key = false) {
  f = await fixture();
  const connection = await new Connections(f.lifecycle).create({
    harness: "muse",
    authentication: key
      ? { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() }
      : { method: "native_login", billing_source: "subscription" },
  });
  const agent = (await f.lifecycle.create("agent", {
    name: "Muse",
    harness: "muse",
    connection_id: connection.id,
    model_id: "model-a",
    reasoning: "high",
    instructions: "",
  })) as Entity<"agent">;
  const thread = (await f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  })) as Entity<"thread">;
  await compose();
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
  const deadline = performance.now() + 10_000;
  while (performance.now() < deadline) {
    if ((await f.store.get("run", id)).status === "running") return;
    await Bun.sleep(10);
  }
  throw new Error("Run did not reach native acceptance.");
}
test("official Muse SDK fixture completes an actual scoped HTTP product-tool call", async () => {
  const lane = await setup(true);
  const run = await admit(lane, "Private DM input 日本語");
  await background.idle();
  expect(await f.store.get("run", run.id)).toMatchObject({
    status: "succeeded",
    native_run_id: expect.any(String),
  });
  const answer = (await f.store.list("message")).find((m) => m.author === "agent");
  expect(answer?.text).toContain(lane.thread.id);
  expect(answer?.text).toContain("Private DM input 日本語");
  expect(answer?.text).not.toContain('"error"');
  expect(JSON.stringify(await f.store.events(0))).not.toContain("selected-key");
  expect(await f.store.get("connection", lane.connection.id)).toMatchObject({
    authentication: { billing_source: "api_key" },
    login: "authenticated",
    discovery: "succeeded",
    inference: "succeeded",
    effective_billing_source: "api_key",
  });
});
test("Muse maps the official tool field and clears terminal updates without a completed notification", async () => {
  const lane = await setup(true);
  const run = await admit(lane, "activity-search");
  await background.idle();
  const observations = (await f.store.events(0))
    .filter((event) => event.entity_id === run.id)
    .map((event) => event.data as Entity<"run">);
  expect(
    observations.some((value) => value.active_tools?.some((step) => step.kind === "searching")),
  ).toBe(true);
  expect(
    observations.some(
      (value) =>
        value.status === "running" &&
        value.activity === "generating" &&
        value.active_tools?.length === 0,
    ),
  ).toBe(true);
  expect(await f.store.get("run", run.id)).toMatchObject({ status: "succeeded", active_tools: [] });
});
test("native history resumes the exact DM after restart without importing group history", async () => {
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
  await accounts.close();
  await app.stop();
  await f.restart();
  await compose();
  const run = await admit(lane, "DM-after-restart");
  await background.idle();
  expect(await f.store.list("binding")).toEqual(bindings);
  const answer = (await f.store.list("message")).find(
    (m) => m.author === "agent" && m.run_id === run.id,
  );
  expect(answer?.text).toContain("DM-secret");
  expect(answer?.text).not.toContain("group-secret");
});
test("effective stored key cannot masquerade as a subscription after browser login", async () => {
  const lane = await setup();
  await post(`/v1/connections/${lane.connection.id}/inspect`);
  writeFileSync(join(f.dir, "connections", lane.connection.id, "home", "mode"), "apiKey");
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/connections/${lane.connection.id}/inspect`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "BILLING_MISMATCH" } });
  expect((await f.store.get("connection", lane.connection.id)).inference).toBe("not_attempted");
  expect((await f.store.get("connection", lane.connection.id)).effective_billing_source).toBe(
    "unknown",
  );
});
test("missing credentials remain login-required and device login does not claim inference", async () => {
  const lane = await setup();
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
  expect((await f.store.get("connection", lane.connection.id)).inference).toBe("not_attempted");
  await post(`/v1/connections/${lane.connection.id}/login/cancel`);
});
test("key-selected connection cannot start browser login", async () => {
  const lane = await setup(true);
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/connections/${lane.connection.id}/login`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } },
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "BILLING_MISMATCH" } });
});
test("interrupt acknowledgement remains intent until native cancelled terminal arrives", async () => {
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
test("unverified Muse steering preserves queued correction and does not dispatch it natively", async () => {
  const lane = await setup();
  const run = await admit(lane, "wait");
  await waitRunning(run.id);
  const queued = await f.lifecycle.admit({
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Updated direction",
  });
  const control = await post(`/v1/runs/${run.id}/steer`, { queued_run_id: queued.run.id });
  expect(control).toMatchObject({ state: "rejected", error_code: "CAPABILITY_UNKNOWN" });
  expect((await f.store.get("run", queued.run.id)).delivery).toBe("pending");
  await post(`/v1/runs/${run.id}/cancel`);
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("cancelled");
  expect(await f.store.list("run")).toHaveLength(2);
});

test("Muse streams a stable partial message and repairs final native text without duplicate messages", async () => {
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
  await post(`/v1/runs/${run.id}/cancel`);
  await background.idle();
  expect((await f.store.list("message")).filter((item) => item.author === "agent")).toHaveLength(1);
  expect((await f.store.get("message", partial?.id as string)).state).toBe("partial");
});

test("Muse reconciles durable native commit and product-tool receipt after process loss without resubmission", async () => {
  const lane = await setup();
  const run = await admit(
    lane,
    `crash-after-commit:${JSON.stringify({ name: "ngertiin.update_agent", arguments: { command_id: crypto.randomUUID(), agent_id: lane.agent.id, expected_revision: 1, changes: { soul: "Committed exactly once" } } })}`,
  );
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
  expect((await f.store.get("agent", lane.agent.id)).revision).toBe(2);
  await background.stop();
  await broker.close();
  await accounts.close();
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
test("interrupt acknowledgement alone cannot fabricate cancellation", async () => {
  const lane = await setup();
  const run = await admit(lane, "stop-ack-only");
  await waitRunning(run.id);
  await post(`/v1/runs/${run.id}/cancel`);
  await background.tick();
  await Bun.sleep(50);
  expect(await f.store.get("run", run.id)).toMatchObject({
    status: "cancel_requested",
    cancellation: "requested",
  });
  await background.stop(30);
  expect(await f.store.get("run", run.id)).toMatchObject({
    status: "unknown",
    cancellation: "requested",
  });
  await broker.close();
  await background.idle();
});
test("revoked connection cannot answer a pending native question", async () => {
  const lane = await setup();
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
    const lane = await setup();
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
    expect(await post(`/v1/runs/${run.id}/interactions`, answer)).toEqual({ status: "submitted" });
    await background.idle();
    expect((await f.store.get("run", run.id)).status).toBe("succeeded");
    expect((await f.store.list("message")).at(-1)?.text).toContain(
      input === "question" ? "SQLite" : "deny",
    );
  });
test("replayed Muse approval notifications are reconciled before display or dispatch", async () => {
  const lane = await setup();
  const run = await admit(lane, "approval-stale");
  await waitRunning(run.id);
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  expect(await response.json()).toEqual({ approvals: [], user_inputs: [] });
  const stale = await fetch(`http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "approval",
      request_id: "approval-1",
      source_index: 2,
      choice_id: "deny",
    }),
  });
  expect(stale.status).toBe(409);
  await post(`/v1/runs/${run.id}/cancel`);
  await background.notifyControls();
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("cancelled");
});

test("a late pending-state response cannot repopulate interactions after native completion", async () => {
  const lane = await setup();
  const run = await admit(lane, "approval-finish-during-read");
  await waitRunning(run.id);
  const response = await fetch(
    `http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  expect(response.status).toBe(409);
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  const next = await admit(lane, "Next work after pending-state race");
  await background.idle();
  expect((await f.store.get("run", next.id)).status).toBe("succeeded");
});

test("revocation during a native pending-state read fences the subsequent approval decision", async () => {
  const lane = await setup();
  const run = await admit(lane, "approval-delayed");
  await waitRunning(run.id);
  const responding = fetch(`http://127.0.0.1:${app.server?.port}/v1/runs/${run.id}/interactions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "approval",
      request_id: "approval-1",
      source_index: 2,
      choice_id: "deny",
    }),
  });
  await Bun.sleep(15);
  await new Connections(f.lifecycle).revoke(lane.connection.id);
  expect((await responding).status).toBe(403);
  await post(`/v1/runs/${run.id}/cancel`);
  await background.notifyControls();
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("cancelled");
  expect((await f.store.answer(run.id))?.text ?? "").not.toContain("Permission deny");
});

for (const [input, status] of [
  ["failed", "failed"],
  ["disconnect", "unknown"],
  ["gap", "unknown"],
  ["unknown-terminal", "unknown"],
  ["reject", "failed"],
] as const)
  test(`native ${input} remains ${status}`, async () => {
    const lane = await setup();
    const run = await admit(lane, input);
    await background.idle();
    expect((await f.store.get("run", run.id)).status).toBe(status);
    if (input === "disconnect")
      expect((await f.store.list("message")).at(-1)).toMatchObject({
        text: "Partial before disconnect",
        state: "partial",
      });
    if (input === "failed")
      expect((await f.store.list("message")).at(-1)).toMatchObject({
        text: "Partial response",
        state: "partial",
      });
  });

test("typed Muse authentication rejection and temporary provider failure retain distinct diagnostics", async () => {
  const lane = await setup();
  const temporary = await admit(lane, "terminal-temporary");
  await background.idle();
  expect(await f.store.get("run", temporary.id)).toMatchObject({
    status: "failed",
    diagnostic: { code: "SERVICE_UNAVAILABLE", category: "temporary", outcome: "failed" },
  });
  expect((await f.store.get("connection", lane.connection.id)).login).toBe("authenticated");
  const auth = await admit(lane, "terminal-auth");
  await background.idle();
  expect(await f.store.get("run", auth.id)).toMatchObject({
    status: "failed",
    diagnostic: { code: "LOGIN_REQUIRED", category: "authentication", outcome: "failed" },
  });
  expect((await f.store.get("connection", lane.connection.id)).login).toBe("required");
  expect((await f.store.get("connection", lane.connection.id)).authentication.billing_source).toBe(
    "subscription",
  );
});

test("authoritative empty Muse history clears ephemeral text without minting a second answer", async () => {
  const lane = await setup();
  const run = await admit(lane, "empty-final");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  const answer = await f.store.answer(run.id);
  expect(answer).toMatchObject({ text: "", state: "complete" });
  expect((await f.store.list("message")).filter((item) => item.author === "agent")).toHaveLength(1);
});

test("Muse snapshot bursts settle to authoritative text without leaking an intermediate credential", async () => {
  const lane = await setup(true);
  const run = await admit(lane, "snapshot-burst");
  await background.idle();
  expect((await f.store.get("run", run.id)).status).toBe("succeeded");
  expect(await f.store.answer(run.id)).toMatchObject({
    text: "Authoritative burst answer.",
    state: "complete",
  });
  const answers = (await f.store.list("message")).filter((message) => message.author === "agent");
  expect(answers).toHaveLength(1);
  expect(JSON.stringify(answers)).not.toContain("selected-key");
});
