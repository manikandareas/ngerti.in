import { afterEach, expect, test } from "bun:test";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { Connections } from "../src/harness/connections";
import { Redactor } from "../src/harness/context";
import { diagnostic, HarnessError } from "../src/harness/contracts";
import { ProductTools } from "../src/harness/tools";
import { RunControls } from "../src/run-controls";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let background: Background;
let app: Awaited<ReturnType<typeof createApi>>;
const token = "control-test-".repeat(4);
afterEach(async () => {
  await background?.stop(5);
  if (app?.server) await app.stop();
  await f?.close();
});
async function setup() {
  f = await fixture();
  await f.bind();
  background = new Background(f.lifecycle);
  app = await createApi(f.lifecycle, background, token);
  return new RunControls(f.lifecycle);
}
async function api(path: string, body?: object, key = crypto.randomUUID()) {
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  return { status: response.status, body: await response.json() };
}
async function start() {
  const receipt = await f.admit();
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing claimed run.");
  await f.lifecycle.started(run.id, run.dispatch_token, "native-turn");
  return { ...receipt, token: run.dispatch_token };
}

async function scopedTools(runId: string) {
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(await f.store.get("run", runId));
  return {
    tools,
    lease,
    call: async (name: string, input: unknown) => tools.call(lease.token, lease.scope, name, input),
  };
}

test("queued HTTP edits use revisions, preserve FIFO and survive exact retries and restart", async () => {
  await setup();
  const first = await start();
  const second = await f.admit("Original 日本語");
  const key = crypto.randomUUID();
  const path = `/v1/messages/${second.message.id}/edit`;
  const changed = { expected_revision: 1, text: "Revised 日本語" };
  const responses = await Promise.all(
    Array.from({ length: 12 }, async () => api(path, changed, key)),
  );
  expect(responses.every((item) => item.status === 200 && item.body.revision === 2)).toBe(true);
  expect((await api(path, { ...changed, text: "Different" }, key)).status).toBe(409);
  expect((await api(path, changed)).status).toBe(409);
  expect((await api(`/v1/messages/${first.message.id}/edit`, changed)).status).toBe(409);
  await f.lifecycle.settle(first.run.id, first.token, "succeeded");
  await f.restart();
  expect((await f.store.get("message", second.message.id)).text).toBe("Revised 日本語");
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(second.run.id);
  await expect(
    (async () =>
      new RunControls(f.lifecycle).edit(second.message.id, {
        expected_revision: 2,
        text: "Too late",
      }))(),
  ).rejects.toThrow("CONFLICT");
});

test("deleting a waiting message creates a replayable tombstone without stopping the active run", async () => {
  await setup();
  const active = await start();
  const waiting = await f.admit("Remove this waiting input");
  const key = crypto.randomUUID();
  const path = `/v1/messages/${waiting.message.id}/delete`;
  const deleted = await api(path, { expected_revision: 1 }, key);
  expect(deleted.status).toBe(200);
  expect(deleted.body.state).toBe("deleted");
  expect((await api(path, { expected_revision: 1 }, key)).body).toEqual(deleted.body);
  expect((await f.store.get("run", active.run.id)).status).toBe("running");
  expect((await f.store.get("run", waiting.run.id)).status).toBe("cancelled");
  expect(
    (await new Conversations(f.lifecycle).history(f.thread.id)).messages.some(
      (item) => item.id === waiting.message.id,
    ),
  ).toBe(false);
  expect(
    (await f.store.events(0)).some(
      (item) =>
        item.entity_id === waiting.message.id &&
        item.data.kind === "message" &&
        item.data.state === "deleted",
    ),
  ).toBe(true);
  await f.lifecycle.settle(active.run.id, active.token, "succeeded");
  expect(
    (await api(`/v1/messages/${active.message.id}/delete`, { expected_revision: 1 })).status,
  ).toBe(409);
});

test("deletion-only history pages keep a usable pagination anchor", async () => {
  const controls = await setup();
  await f.admit("Older visible input");
  const deleted = await f.admit("Deleted input");
  await controls.remove(deleted.message.id, { expected_revision: 1 });
  const history = new Conversations(f.lifecycle);
  const page = await history.history(f.thread.id, { limit: 1 });
  expect(page.messages).toEqual([]);
  expect(page.has_more).toBe(true);
  expect(page.next_before).toBe(deleted.message.id);
  expect(
    (await history.history(f.thread.id, { before: page.next_before, limit: 1 })).messages[0].text,
  ).toBe("Older visible input");
});

test("chat text always preserves ordinary FIFO admission without choosing cancellation intent", async () => {
  const controls = await setup();
  const current = await start();
  for (const text of [
    "stop",
    "gajadi deh",
    "Please cancel the current task.",
    "pause goal ini",
    "hentikan tujuan ini",
    'Explain "stop"',
    "Do not stop",
    "Enough for this task, leave the rest for tomorrow",
  ]) {
    const admitted = await controls.send({ thread_id: f.thread.id, agent_id: f.agent.id, text });
    expect(admitted.control).toBeNull();
    expect(admitted.message.text).toBe(text);
    expect(admitted.run?.status).toBe("queued");
    expect((await f.store.get("run", current.run.id)).cancellation).toBe("none");
  }
});

test("direct HTTP cancellation bypasses a stalled agent and an occupied ordinary queue", async () => {
  await setup();
  let resolve: (outcome: "cancelled") => void = () => {};
  let aborted = false;
  const entered = Promise.withResolvers<void>();
  background = new Background(f.lifecycle, {
    codex: {
      async execute(_run, context) {
        await context.started("busy-native");
        context.signal.addEventListener("abort", () => {
          aborted = true;
        });
        entered.resolve();
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
  });
  app = await createApi(f.lifecycle, background, token);
  const current = await f.admit();
  await background.tick();
  await entered.promise;
  const waiting = await f.admit("This should remain waiting");
  const key = crypto.randomUUID();
  const result = await api(`/v1/runs/${current.run.id}/cancel`, {}, key);
  expect(result.body.status).toBe("cancel_requested");
  expect(aborted).toBe(true);
  expect((await f.store.get("run", current.run.id)).cancellation).toBe("requested");
  expect((await f.store.get("run", waiting.run.id)).status).toBe("queued");
  expect(await f.store.list("run")).toHaveLength(2);
  resolve("cancelled");
  await background.idle();
  expect((await f.store.get("run", current.run.id)).cancellation).toBe("confirmed");
  expect((await api(`/v1/runs/${current.run.id}/cancel`, {}, key)).body).toEqual(result.body);
});

test("the cancellation tool stops only its current run, returns its receipt and fences later tools", async () => {
  await setup();
  const goal = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Research",
  });
  const routine = await f.lifecycle.create("routine", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    instruction: "Continue later",
    timezone: "UTC",
    schedule: { type: "interval", anchor_at: "2026-10-31T00:00:00.000Z", every_ms: 60000 },
  });
  const admitted = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Begin",
    goal_id: goal.id,
  });
  const active = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!active?.dispatch_token) throw new Error("No active run.");
  await f.lifecycle.started(active.id, active.dispatch_token, "native");
  const waiting = await f.admit("Leave this queued");
  const s = await scopedTools(active.id),
    command_id = crypto.randomUUID();
  const receipt = await s.call("ngertiin.cancel_run", { command_id });
  expect(receipt).toMatchObject({
    id: admitted.run.id,
    kind: "run",
    status: "cancel_requested",
    cancellation: "requested",
    outcome: "none",
  });
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  expect((await f.store.get("routine", routine.id)).state).toBe("active");
  expect((await f.store.get("run", waiting.run.id)).status).toBe("queued");
  expect((await f.store.get("run", active.id)).product_tools).toContain("ngertiin.cancel_run");
  const cursor = await f.store.cursor;
  await expect(s.call("ngertiin.read_run_context", {})).rejects.toThrow("STALE_DISPATCH");
  await expect(s.call("ngertiin.cancel_run", { command_id })).rejects.toThrow("STALE_DISPATCH");
  expect(await f.store.cursor).toBe(cursor);
  await f.restart();
  expect(await f.store.get("run", active.id)).toMatchObject({
    status: "unknown",
    cancellation: "requested",
  });
  expect((await f.store.get("goal", goal.id)).state).toBe("active");
  expect((await f.store.get("routine", routine.id)).state).toBe("active");
});

test("cancellation tool rejects caller target injection, forged scope and revoked grants", async () => {
  await setup();
  const current = await start(),
    s = await scopedTools(current.run.id);
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  const foreign = await f.lifecycle.admit({
    agent_id: f.agent.id,
    thread_id: group.id,
    text: "Other conversation",
  });
  await expect(
    s.call("ngertiin.cancel_run", { command_id: crypto.randomUUID(), run_id: foreign.run.id }),
  ).rejects.toThrow();
  await expect(
    s.tools.call(s.lease.token, { ...s.lease.scope, thread_id: group.id }, "ngertiin.cancel_run", {
      command_id: crypto.randomUUID(),
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  const connections = new Connections(f.lifecycle);
  await connections.revoke((await f.store.get("agent", f.agent.id)).connection_id);
  await expect(s.call("ngertiin.cancel_run", { command_id: crypto.randomUUID() })).rejects.toThrow(
    "SCOPE_DENIED",
  );
  expect((await f.store.get("run", current.run.id)).cancellation).toBe("none");
  expect((await f.store.get("run", foreign.run.id)).cancellation).toBe("none");
});

test("agent goal control selects an explicit responsibility and persists its stopped continuation", async () => {
  await setup();
  const first = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "First",
  });
  const other = await f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Other",
  });
  const current = await start(),
    s = await scopedTools(current.run.id);
  const continuation = await f.lifecycle.admit({
    agent_id: f.agent.id,
    thread_id: f.thread.id,
    goal_id: first.id,
    text: "Continue later",
  });
  const stopped = await s.call("ngertiin.control_goal", {
    command_id: crypto.randomUUID(),
    goal_id: first.id,
    expected_revision: first.revision,
    state: "stopped",
  });
  expect(stopped).toMatchObject({ id: first.id, state: "stopped" });
  expect((await f.store.get("run", continuation.run.id)).status).toBe("cancelled");
  expect((await f.store.get("goal", other.id)).state).toBe("active");
  expect((await f.store.get("run", current.run.id)).cancellation).toBe("none");
  await f.restart();
  expect((await f.store.get("goal", first.id)).state).toBe("stopped");
  expect((await f.store.get("goal", other.id)).state).toBe("active");
});

test("queued steering is reserved atomically, revision-protected and never dispatched twice", async () => {
  const controls = await setup();
  const current = await start();
  const waiting = await f.admit("Use this correction immediately");
  const control = await controls.requestSteer(current.run.id, {
    queued_run_id: waiting.run.id,
    expected_native_run_id: "native-turn",
  });
  expect((await f.store.get("run", waiting.run.id)).delivery).toBe("steering");
  await expect(
    (async () => controls.edit(waiting.message.id, { expected_revision: 1, text: "Changed" }))(),
  ).rejects.toThrow("CONFLICT");
  await expect(
    (async () =>
      controls.requestSteer(current.run.id, {
        text: "stale",
        expected_native_run_id: "old-turn",
      }))(),
  ).rejects.toThrow("CONFLICT");
  await controls.settleSteer(control.id, "accepted");
  await f.lifecycle.settle(current.run.id, current.token, "succeeded");
  expect((await f.store.get("run", waiting.run.id)).status).toBe("steered");
  expect((await new Conversations(f.lifecycle).snapshot(f.thread.id)).controls[0].state).toBe(
    "accepted",
  );
  expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  expect((await controls.settleSteer(control.id, "unknown")).state).toBe("accepted");
});

test("certain steer rejection restores FIFO; lost acknowledgement survives restart held unknown", async () => {
  const controls = await setup();
  const current = await start();
  const queued = await f.admit("Steer this");
  const rejected = await controls.requestSteer(current.run.id, { queued_run_id: queued.run.id });
  await controls.settleSteer(rejected.id, "rejected", "CAPABILITY_UNSUPPORTED");
  expect((await f.store.get("run", queued.run.id)).delivery).toBe("pending");
  const unknown = await controls.requestSteer(current.run.id, { queued_run_id: queued.run.id });
  await f.restart();
  expect((await f.store.get("control", unknown.id)).state).toBe("unknown");
  expect((await f.store.get("run", queued.run.id)).delivery).toBe("unknown");
  expect((await f.store.get("run", current.run.id)).status).toBe("unknown");
  await f.lifecycle.reconcile(
    current.run.id,
    (await f.store.get("run", current.run.id)).revision,
    "succeeded",
    "receipt",
  );
  await f.admit("A later message");
  expect(await f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
});

test("streaming snapshots upsert one message and stale epochs cannot append after restart", async () => {
  await setup();
  const active = await start();
  const one = await f.lifecycle.appendAnswer(active.run.id, "Partial", "partial");
  const two = await f.lifecycle.appendAnswer(active.run.id, "Partial answer", "partial");
  expect(two.id).toBe(one.id);
  const cursor = await f.store.cursor;
  expect(
    (await f.lifecycle.appendAnswer(active.run.id, "Partial answer", "partial")).revision,
  ).toBe(two.revision);
  expect(await f.store.cursor).toBe(cursor);
  const previous = f.lifecycle;
  await f.restart();
  await expect(
    (async () => f.lifecycle.appendAnswer(active.run.id, "Late", "complete"))(),
  ).rejects.toThrow("STALE_DISPATCH");
  await expect(
    (async () => previous.appendAnswer(active.run.id, "Late", "complete"))(),
  ).rejects.toThrow();
  const unknown = await f.store.get("run", active.run.id);
  await f.lifecycle.reconcile(
    unknown.id,
    unknown.revision,
    "succeeded",
    "native-receipt",
    "Final answer",
  );
  expect((await f.store.list("message")).filter((item) => item.author === "agent")).toHaveLength(1);
  expect(await f.store.get("message", one.id)).toMatchObject({
    text: "Final answer",
    state: "complete",
  });
});

test("SSE streams committed envelopes, reconnects from Last-Event-ID and publishes no rollback", async () => {
  await setup();
  app.listen({ hostname: "127.0.0.1", port: 0 });
  const cursor = await f.store.cursor;
  await expect(
    (async () =>
      f.store.transaction(async () => {
        await f.admit("Rolled back");
        throw new Error("rollback");
      }))(),
  ).rejects.toThrow();
  const admitted = await f.admit("Committed input");
  const controller = new AbortController();
  const response = await fetch(`http://127.0.0.1:${app.server?.port}/v1/events/stream?after=0`, {
    headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": String(cursor) },
    signal: controller.signal,
  });
  expect(response.headers.get("Content-Type")).toContain("text/event-stream");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing stream.");
  let text = "";
  while (!text.includes(admitted.message.id))
    text += new TextDecoder().decode((await reader.read()).value);
  controller.abort();
  await reader.cancel().catch(() => {});
  expect(text).not.toContain("Rolled back");
  const event = JSON.parse(text.split("data: ")[1].split("\n")[0]);
  expect(event.cursor).toBe(cursor + 1);
  const replay = await f.store.events(cursor);
  const messages = new Map(
    replay
      .filter((item) => item.data.kind === "message")
      .map((item) => [item.entity_id, item.data]),
  );
  for (const item of replay)
    if (item.data.kind === "message") messages.set(item.entity_id, item.data);
  expect(messages.size).toBe(1);
});

test("stream redaction withholds known secret prefixes and distinguishes actionable failure categories", () => {
  const redactor = new Redactor();
  const secret = "selected-private-key";
  redactor.add(secret);
  for (let i = 1; i <= secret.length; i++) {
    const preview = redactor.stream(`Visible text ${secret.slice(0, i)}`);
    expect(preview).not.toContain("selected");
  }
  expect(redactor.stream(`Visible text ${secret} done`, true)).toBe("Visible text [REDACTED] done");
  expect(diagnostic(new HarnessError("SERVICE_UNAVAILABLE"))).toMatchObject({
    category: "temporary",
    outcome: "not_dispatched",
  });
  expect(diagnostic(new HarnessError("AUTH_REJECTED"))).toMatchObject({
    category: "authentication",
    outcome: "not_dispatched",
  });
  expect(diagnostic(new HarnessError("NATIVE_UNKNOWN", "unknown"))).toMatchObject({
    category: "unknown",
    outcome: "unknown",
  });
  expect(JSON.stringify(diagnostic(new Error("Bearer secret sk-private")))).not.toContain("secret");
});
