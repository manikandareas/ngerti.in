import { afterEach, expect, test } from "bun:test";
import { Background } from "../src/background";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import type { HarnessClient, RecoveryObservation } from "../src/harness/client";
import { CredentialContexts } from "../src/harness/context";
import { HarnessError, unknownCapabilities } from "../src/harness/contracts";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

let f: Awaited<ReturnType<typeof fixture>>;
let broker: HarnessBroker;
let background: Background;
afterEach(async () => {
  await background?.stop(100);
  await broker?.close();
  await f?.close();
});

async function until(predicate: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 2000;
  while (!(await predicate()) && Date.now() < deadline) await Bun.sleep(5);
  expect(await predicate()).toBe(true);
}

async function setup(
  mode: "disconnect" | "silent" = "disconnect",
  group = false,
  holdClose = false,
) {
  f = await fixture();
  await f.lifecycle.updateAgent(f.agent.id, {
    expected_revision: f.agent.revision,
    changes: { model_id: "model-a", reasoning: "high" },
  });
  let status: RecoveryObservation["status"] = "unknown";
  let foreign = false;
  let reads = 0;
  let closes = 0;
  let opens = 0;
  let releaseClose = () => {};
  const closed = new Promise<void>((resolve) => {
    releaseClose = resolve;
  });
  let event: Parameters<HarnessClient["prompt"]>[0]["onEvent"] = () => {};
  const prompts: string[] = [];
  const client: HarnessClient = {
    async inspect() {
      return {
        login: "authenticated",
        account_id: "recovery-test-account",
        auth_method: "native_login",
        billing_source: "subscription",
        capabilities: {
          ...unknownCapabilities,
          resume: "supported",
          settings: "supported",
          product_tools: "supported",
        },
      };
    },
    async discoverModels() {
      return [{ id: "model-a", reasoning: ["high"] }];
    },
    async start() {
      return { native_session_id: "recovery-test-session" };
    },
    async resume(identity) {
      return identity;
    },
    async settings() {},
    async close() {
      closes++;
      if (holdClose) await closed;
    },
    async stop() {
      return { confirmed: false };
    },
    async prompt(request) {
      prompts.push(request.run_id);
      event = request.onEvent;
      request.onEvent({
        type: "accepted",
        native_session_id: request.identity.native_session_id,
        native_run_id: request.run_id,
      });
      request.onEvent({ type: "activity", activity: "generating" });
      if (mode === "disconnect") throw new HarnessError("NATIVE_UNKNOWN", "unknown");
      return new Promise(() => {});
    },
    async reconcile(identity, nativeRunId) {
      reads++;
      return {
        ...identity,
        native_run_id: foreign ? "foreign-native-turn" : nativeRunId,
        status,
        text: "The durable final answer.",
      };
    },
  };
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir),
    await ProductTools.open(f.lifecycle),
    {
      codex: {
        harness: "codex",
        async connect() {
          return opens++ === 0 ? client : { ...client, async close() {} };
        },
      },
    },
    async () => ({
      harness: "codex",
      state: "supported",
      executable: process.execPath,
      version: "0.166.0",
      manifest: manifests.codex,
    }),
    undefined,
    { request_ms: 100, close_ms: 20 },
    { interval_ms: 5, stale_ms: 30, retry_ms: 10, max_retry_ms: 40 },
  );
  const thread = group
    ? await f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] })
    : f.thread;
  await broker.openSession(thread.id, f.agent.id);
  background = new Background(f.lifecycle, broker.executors());
  const { run } = await f.lifecycle.admit({
    thread_id: thread.id,
    agent_id: f.agent.id,
    text: "Inspect this project.",
  });
  await background.tick();
  await until(
    async () =>
      (await f.store.get("run", run.id)).status === (mode === "silent" ? "running" : "unknown"),
  );
  await broker.startRecovery();
  return {
    run,
    prompts,
    releaseClose,
    reads: () => reads,
    closes: () => closes,
    complete: (value: RecoveryObservation["status"] = "succeeded") => {
      status = value;
    },
    foreign: () => {
      foreign = true;
    },
    event: (value: Parameters<typeof event>[0]) => event(value),
  };
}

test("unknown work is reconciled automatically with backoff and no prompt replay", async () => {
  const state = await setup();
  await until(() => state.reads() >= 2);
  expect((await f.store.get("run", state.run.id)).status).toBe("unknown");
  expect(state.reads()).toBeLessThan(8);
  const queued = (await f.admit("Next ordinary input.")).run;
  await background.tick();
  expect((await f.store.get("run", queued.id)).status).toBe("queued");
  state.complete();
  await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
  expect((await f.store.answer(state.run.id))?.text).toBe("The durable final answer.");
  expect(state.prompts).toEqual([state.run.id]);
  expect((await f.lifecycle.claimNext(f.thread.id, f.agent.id))?.id).toBe(queued.id);
});

test("a lost native completion is recovered through the executing owner and fences late output", async () => {
  const state = await setup("silent");
  state.complete();
  await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
  await background.idle();
  expect(state.closes()).toBeGreaterThan(0);
  expect(state.prompts).toEqual([state.run.id]);
  expect((await f.store.answer(state.run.id))?.text).toBe("The durable final answer.");
  state.event({ type: "text", text: "Late stale answer." });
  expect((await f.store.answer(state.run.id))?.text).toBe("The durable final answer.");
});

test("silence with no terminal receipt preserves running work and its tools", async () => {
  const state = await setup("silent");
  await until(() => state.reads() >= 2);
  expect(await f.store.get("run", state.run.id)).toMatchObject({
    status: "running",
    cancellation: "none",
  });
  expect(state.prompts).toEqual([state.run.id]);
  state.complete();
  await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
});

test("current native observations postpone stale checks during a long valid run", async () => {
  const state = await setup("silent");
  for (let index = 0; index < 8; index++) {
    state.event({ type: "activity", activity: "generating" });
    await Bun.sleep(5);
  }
  expect(state.reads()).toBe(0);
  expect((await f.store.get("run", state.run.id)).status).toBe("running");
  state.complete();
  await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
});

test("foreign receipts and unexpected cancellation cannot release an unknown lane", async () => {
  const state = await setup();
  state.foreign();
  state.complete();
  await until(() => state.reads() >= 2);
  expect((await f.store.get("run", state.run.id)).status).toBe("unknown");
  expect(await f.store.answer(state.run.id)).toBeNull();
  expect(state.prompts).toEqual([state.run.id]);
});

test("an unrequested native interruption remains unresolved", async () => {
  const state = await setup("silent");
  state.complete("cancelled");
  await until(() => state.reads() >= 2);
  expect(await f.store.get("run", state.run.id)).toMatchObject({
    status: "running",
    cancellation: "none",
  });
  state.complete();
  await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
});

test("closing recovery cancels timers and prevents further receipt reads", async () => {
  const state = await setup();
  await until(() => state.reads() >= 1);
  await broker.close();
  const reads = state.reads();
  await Bun.sleep(70);
  expect(state.reads()).toBe(reads);
  expect((await f.store.get("run", state.run.id)).status).toBe("unknown");
});

test("automatic group recovery keeps the writer fenced until its owned transport is quiescent", async () => {
  const state = await setup("silent", true, true);
  try {
    state.complete();
    await until(async () => (await f.store.get("run", state.run.id)).status === "unknown");
    await Bun.sleep(100);
    expect((await f.store.get("run", state.run.id)).status).toBe("unknown");
    expect(state.prompts).toEqual([state.run.id]);
    state.releaseClose();
    await until(async () => (await f.store.get("run", state.run.id)).status === "succeeded");
    expect((await f.store.answer(state.run.id))?.state).toBe("complete");
  } finally {
    state.releaseClose();
  }
});
