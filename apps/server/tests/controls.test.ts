import { afterEach, expect, test } from "bun:test";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { Redactor } from "../src/harness/context";
import { diagnostic, HarnessError } from "../src/harness/contracts";
import { cancellationIntent, RunControls } from "../src/run-controls";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
let background: Background;
let app: ReturnType<typeof createApi>;
const token = "control-test-".repeat(4);
afterEach(async () => {
  await background?.stop(5);
  if (app?.server) await app.stop();
  f?.close();
});
function setup() {
  f = fixture();
  f.bind();
  background = new Background(f.lifecycle);
  app = createApi(f.lifecycle, background, token);
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
function start() {
  const receipt = f.admit();
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing claimed run.");
  f.lifecycle.started(run.id, run.dispatch_token, "native-turn");
  return { ...receipt, token: run.dispatch_token };
}

test("queued HTTP edits use revisions, preserve FIFO and survive exact retries and restart", async () => {
  setup();
  const first = start();
  const second = f.admit("Original 日本語");
  const key = crypto.randomUUID();
  const path = `/v1/messages/${second.message.id}/edit`;
  const changed = { expected_revision: 1, text: "Revised 日本語" };
  const responses = await Promise.all(Array.from({ length: 12 }, () => api(path, changed, key)));
  expect(responses.every((item) => item.status === 200 && item.body.revision === 2)).toBe(true);
  expect((await api(path, { ...changed, text: "Different" }, key)).status).toBe(409);
  expect((await api(path, changed)).status).toBe(409);
  expect((await api(`/v1/messages/${first.message.id}/edit`, changed)).status).toBe(409);
  f.lifecycle.settle(first.run.id, first.token, "succeeded");
  f.restart();
  expect(f.store.get("message", second.message.id).text).toBe("Revised 日本語");
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(second.run.id);
  expect(() =>
    new RunControls(f.lifecycle).edit(second.message.id, {
      expected_revision: 2,
      text: "Too late",
    }),
  ).toThrow("CONFLICT");
});

test("deleting a waiting message creates a replayable tombstone without stopping the active run", async () => {
  setup();
  const active = start();
  const waiting = f.admit("Remove this waiting input");
  const key = crypto.randomUUID();
  const path = `/v1/messages/${waiting.message.id}/delete`;
  const deleted = await api(path, { expected_revision: 1 }, key);
  expect(deleted.status).toBe(200);
  expect(deleted.body.state).toBe("deleted");
  expect((await api(path, { expected_revision: 1 }, key)).body).toEqual(deleted.body);
  expect(f.store.get("run", active.run.id).status).toBe("running");
  expect(f.store.get("run", waiting.run.id).status).toBe("cancelled");
  expect(
    new Conversations(f.lifecycle)
      .history(f.thread.id)
      .messages.some((item) => item.id === waiting.message.id),
  ).toBe(false);
  expect(
    f.store
      .events(0)
      .some(
        (item) =>
          item.entity_id === waiting.message.id &&
          item.data.kind === "message" &&
          item.data.state === "deleted",
      ),
  ).toBe(true);
  f.lifecycle.settle(active.run.id, active.token, "succeeded");
  expect(
    (await api(`/v1/messages/${active.message.id}/delete`, { expected_revision: 1 })).status,
  ).toBe(409);
});

test("deletion-only history pages keep a usable pagination anchor", () => {
  const controls = setup();
  f.admit("Older visible input");
  const deleted = f.admit("Deleted input");
  controls.remove(deleted.message.id, { expected_revision: 1 });
  const history = new Conversations(f.lifecycle);
  const page = history.history(f.thread.id, { limit: 1 });
  expect(page.messages).toEqual([]);
  expect(page.has_more).toBe(true);
  expect(page.next_before).toBe(deleted.message.id);
  expect(
    history.history(f.thread.id, { before: page.next_before, limit: 1 }).messages[0].text,
  ).toBe("Older visible input");
});

test("contextual stop excludes quotations, hypothetical discussion, negation and task payloads", () => {
  for (const text of [
    "stop",
    "gajadi deh",
    "ga jadi deh",
    "tolong hentikan pekerjaan ini ya",
    "Please cancel the current task.",
    "never mind",
  ])
    expect(cancellationIntent(text)).toBe("run");
  for (const text of [
    '"stop"',
    "What happens if I say stop?",
    "Kalau aku bilang gajadi deh gimana?",
    "Do not stop",
    "Jangan stop",
    "Write a stop button",
    "Translate: stop",
    "stop the server after the tests",
    "Stop?",
    "```stop```",
    "If this fails, stop.",
  ])
    expect(cancellationIntent(text)).toBeNull();
  expect(cancellationIntent("pause goal ini")).toBe("pause_goal");
  expect(cancellationIntent("hentikan tujuan ini")).toBe("stop_goal");
});

test("conversational stop bypasses a stalled agent and an occupied ordinary queue", async () => {
  setup();
  let resolve: (outcome: "cancelled") => void = () => {};
  let aborted = false;
  background = new Background(f.lifecycle, {
    codex: {
      execute(_run, context) {
        context.started("busy-native");
        context.signal.addEventListener("abort", () => {
          aborted = true;
        });
        return new Promise((done) => {
          resolve = done;
        });
      },
    },
  });
  app = createApi(f.lifecycle, background, token);
  const current = f.admit();
  background.tick();
  const waiting = f.admit("This should remain waiting");
  const key = crypto.randomUUID();
  const result = await api(
    "/v1/runs",
    { thread_id: f.thread.id, agent_id: f.agent.id, text: "gajadi deh" },
    key,
  );
  expect(result.body.control.action).toBe("stop_run");
  expect(result.body.run.status).toBe("cancel_requested");
  expect(aborted).toBe(true);
  expect(f.store.get("run", current.run.id).cancellation).toBe("requested");
  expect(f.store.get("run", waiting.run.id).status).toBe("queued");
  expect(f.store.list("run")).toHaveLength(2);
  resolve("cancelled");
  await background.idle();
  expect(f.store.get("run", current.run.id).cancellation).toBe("confirmed");
  expect(
    (
      await api(
        "/v1/runs",
        { thread_id: f.thread.id, agent_id: f.agent.id, text: "gajadi deh" },
        key,
      )
    ).body,
  ).toEqual(result.body);
});

test("quoted stop is ordinary queued work; run stop leaves its goal active; goal stop cancels continuation", async () => {
  const controls = setup();
  const goal = f.lifecycle.create("goal", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    title: "Research",
  });
  const first = f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Begin",
    goal_id: goal.id,
  });
  const active = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!active?.dispatch_token) throw new Error("No active run.");
  f.lifecycle.started(active.id, active.dispatch_token, "native");
  expect(
    controls.send({ thread_id: f.thread.id, agent_id: f.agent.id, text: 'Explain "stop"' }).run
      ?.status,
  ).toBe("queued");
  controls.send({ thread_id: f.thread.id, agent_id: f.agent.id, text: "stop" });
  expect(f.store.get("goal", goal.id).state).toBe("active");
  f.lifecycle.settle(first.run.id, active.dispatch_token, "cancelled");
  const continuation = f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    goal_id: goal.id,
    text: "Continue later",
  });
  const stopped = controls.send({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "stop goal ini",
  });
  expect(stopped.control?.action).toBe("stop_goal");
  expect(f.store.get("run", continuation.run.id).status).toBe("cancelled");
  f.restart();
  expect(f.store.get("goal", goal.id).state).toBe("stopped");
});

test("ambiguous or cross-thread goal cancellation never guesses a responsibility", () => {
  const controls = setup();
  for (const title of ["First", "Second"])
    f.lifecycle.create("goal", { thread_id: f.thread.id, agent_id: f.agent.id, title });
  const before = f.store.cursor;
  expect(() =>
    controls.send({ thread_id: f.thread.id, agent_id: f.agent.id, text: "stop goal" }),
  ).toThrow("CONTROL_AMBIGUOUS");
  expect(f.store.cursor).toBe(before);
  expect(f.store.list("goal").every((item) => item.state === "active")).toBe(true);
});

test("queued steering is reserved atomically, revision-protected and never dispatched twice", () => {
  const controls = setup();
  const current = start();
  const waiting = f.admit("Use this correction immediately");
  const control = controls.requestSteer(current.run.id, {
    queued_run_id: waiting.run.id,
    expected_native_run_id: "native-turn",
  });
  expect(f.store.get("run", waiting.run.id).delivery).toBe("steering");
  expect(() =>
    controls.edit(waiting.message.id, { expected_revision: 1, text: "Changed" }),
  ).toThrow("CONFLICT");
  expect(() =>
    controls.requestSteer(current.run.id, { text: "stale", expected_native_run_id: "old-turn" }),
  ).toThrow("CONFLICT");
  controls.settleSteer(control.id, "accepted");
  f.lifecycle.settle(current.run.id, current.token, "succeeded");
  expect(f.store.get("run", waiting.run.id).status).toBe("steered");
  expect(new Conversations(f.lifecycle).snapshot(f.thread.id).controls[0].state).toBe("accepted");
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
  expect(controls.settleSteer(control.id, "unknown").state).toBe("accepted");
});

test("certain steer rejection restores FIFO; lost acknowledgement survives restart held unknown", () => {
  const controls = setup();
  const current = start();
  const queued = f.admit("Steer this");
  const rejected = controls.requestSteer(current.run.id, { queued_run_id: queued.run.id });
  controls.settleSteer(rejected.id, "rejected", "CAPABILITY_UNSUPPORTED");
  expect(f.store.get("run", queued.run.id).delivery).toBe("pending");
  const unknown = controls.requestSteer(current.run.id, { queued_run_id: queued.run.id });
  f.restart();
  expect(f.store.get("control", unknown.id).state).toBe("unknown");
  expect(f.store.get("run", queued.run.id).delivery).toBe("unknown");
  expect(f.store.get("run", current.run.id).status).toBe("unknown");
  f.lifecycle.reconcile(
    current.run.id,
    f.store.get("run", current.run.id).revision,
    "succeeded",
    "receipt",
  );
  f.admit("A later message");
  expect(f.lifecycle.claimNext(f.thread.id, f.agent.id)).toBeNull();
});

test("streaming snapshots upsert one message and stale epochs cannot append after restart", () => {
  setup();
  const active = start();
  const one = f.lifecycle.appendAnswer(active.run.id, "Partial", "partial");
  const two = f.lifecycle.appendAnswer(active.run.id, "Partial answer", "partial");
  expect(two.id).toBe(one.id);
  const cursor = f.store.cursor;
  expect(f.lifecycle.appendAnswer(active.run.id, "Partial answer", "partial").revision).toBe(
    two.revision,
  );
  expect(f.store.cursor).toBe(cursor);
  const previous = f.lifecycle;
  f.restart();
  expect(() => f.lifecycle.appendAnswer(active.run.id, "Late", "complete")).toThrow(
    "STALE_DISPATCH",
  );
  expect(() => previous.appendAnswer(active.run.id, "Late", "complete")).toThrow();
  const unknown = f.store.get("run", active.run.id);
  f.lifecycle.reconcile(
    unknown.id,
    unknown.revision,
    "succeeded",
    "native-receipt",
    "Final answer",
  );
  expect(f.store.list("message").filter((item) => item.author === "agent")).toHaveLength(1);
  expect(f.store.get("message", one.id)).toMatchObject({ text: "Final answer", state: "complete" });
});

test("SSE streams committed envelopes, reconnects from Last-Event-ID and publishes no rollback", async () => {
  setup();
  app.listen({ hostname: "127.0.0.1", port: 0 });
  const cursor = f.store.cursor;
  expect(() =>
    f.store.transaction(() => {
      f.admit("Rolled back");
      throw new Error("rollback");
    }),
  ).toThrow();
  const admitted = f.admit("Committed input");
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
  const replay = f.store.events(cursor);
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
