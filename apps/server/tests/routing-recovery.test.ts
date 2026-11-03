import { afterEach, expect, test } from "bun:test";
import { chmodSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readAgentActivities } from "../src/agents/activity";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { conversationEvent } from "../src/conversations/projection";
import { Groups } from "../src/groups/service";
import { requireAvailable } from "../src/harness/availability";
import { HarnessError } from "../src/harness/contracts";
import { HarnessRuntime } from "../src/harness/runtime";
import { Lifecycle } from "../src/lifecycle";
import { fixture } from "./helpers";

function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected fixture value.");
  return value;
}

let f: ReturnType<typeof fixture>;
let background: Background | undefined;
afterEach(async () => {
  await background?.stop();
  background = undefined;
  f?.close();
});
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(5);
  expect(predicate()).toBe(true);
}
function setup() {
  f = fixture();
  const lifecycle = new Lifecycle(f.store, {
    async choose() {
      return {
        agent_id: null,
        model: "jev-1.14.0",
        confidence: 0.16,
        probabilities: { unresolved: 1 },
        input_tokens: 20,
      };
    },
  });
  const peer = lifecycle.createAgent({
    name: "Peer",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const group = lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  return { lifecycle, group, groups: new Groups(lifecycle) };
}
function executable(path: string, version: string) {
  writeFileSync(`${path}.next`, `#!/bin/sh\necho 'codex-cli ${version}'\n`);
  chmodSync(`${path}.next`, 0o700);
  renameSync(`${path}.next`, path);
}

test("the shared runtime discovers an installed executable and coalesces cached probes", async () => {
  f = fixture();
  const path = join(f.dir, "codex");
  const runtime = new HarnessRuntime({ codex: path });
  expect((await runtime.detect("codex")).state).toBe("missing");
  const missing = runtime.fingerprint("codex");
  writeFileSync(path, '#!/bin/sh\nprintf "probe\\n" >> "$0.probes"\necho "codex-cli 0.166.0"\n', {
    mode: 0o700,
  });
  expect(runtime.fingerprint("codex")).not.toBe(missing);
  const [first, second] = await Promise.all([runtime.detect("codex"), runtime.detect("codex")]);
  expect(first).toBe(second);
  expect(first).toMatchObject({ executable: path, state: "supported", version: "0.166.0" });
  expect(await runtime.detect("codex")).toBe(first);
  expect(readFileSync(`${path}.probes`, "utf8")).toBe("probe\n");
});

test("a blocked fallback is visible on its parent group without exposing routing instructions", async () => {
  const { lifecycle, group, groups } = setup();
  background = new Background(lifecycle, {
    codex: {
      async prepare() {
        throw new HarnessError("VERSION_TOO_OLD");
      },
      async execute() {
        throw new Error("Must not execute");
      },
    },
  });
  background.start(60_000);
  const route = groups.send(group.id, { text: "Ask the peer to say hi." });
  await until(() => {
    const r = f.store.get("group_route", route.id);
    return (
      !!r.router_run_id && f.store.get("run", r.router_run_id).preparation?.state === "blocked"
    );
  });
  const snapshot = new Conversations(lifecycle).snapshot(group.id);
  expect(snapshot.routes[0]?.execution).toMatchObject({
    stage: "blocked",
    retry_preparation: true,
    diagnostic: { code: "VERSION_TOO_OLD" },
  });
  expect(snapshot.runs).toHaveLength(0);
  expect(snapshot.messages).toHaveLength(1);
  expect(snapshot.messages[0]?.text).toBe("Ask the peer to say hi.");
  expect(
    readAgentActivities(f.store).items.find((item) => item.thread_id === group.id)?.preparation
      ?.state,
  ).toBe("blocked");
  const routerRun = f.store.get("run", present(f.store.get("group_route", route.id).router_run_id));
  const event = present(
    f.store
      .events(0, 1000)
      .filter((item) => item.entity_id === routerRun.id)
      .at(-1),
  );
  expect(conversationEvent(f.store, event).conversation_thread_id).toBe(group.id);
  const inputEvent = present(
    f.store.events(0, 1000).find((item) => item.entity_id === routerRun.input_message_id),
  );
  expect(conversationEvent(f.store, inputEvent).data).toMatchObject({
    text: "[Internal execution input]",
  });
});

test("replacing the pinned executable resumes the original undispatched fallback once", async () => {
  const { lifecycle, group, groups } = setup();
  const path = join(f.dir, "codex");
  executable(path, "0.136.0");
  const runtime = new HarnessRuntime({ codex: path });
  let executions = 0;
  background = new Background(lifecycle, {
    codex: {
      preparationRevision: () => runtime.fingerprint("codex"),
      async prepare(threadId, agentId) {
        requireAvailable(await runtime.detect("codex"));
        lifecycle.bind(threadId, agentId, crypto.randomUUID());
      },
      async execute(run, context) {
        executions++;
        context.started(run.id);
        lifecycle.appendAnswer(run.id, JSON.stringify({ agent_id: f.agent.id }));
        return "succeeded";
      },
    },
  });
  const route = groups.send(group.id, { text: "Ask the peer to say hi." });
  background.start(60_000);
  await until(() => {
    const r = f.store.get("group_route", route.id);
    return (
      !!r.router_run_id && f.store.get("run", r.router_run_id).preparation?.state === "blocked"
    );
  });
  const originalRunId = present(f.store.get("group_route", route.id).router_run_id);
  const fingerprint = runtime.fingerprint("codex");
  executable(path, "0.166.0");
  expect(runtime.fingerprint("codex")).not.toBe(fingerprint);
  background.tick();
  await until(() => f.store.get("group_route", route.id).state === "selected");
  expect(f.store.get("group_route", route.id).router_run_id).toBe(originalRunId);
  expect(f.store.get("run", originalRunId).status).toBe("succeeded");
  expect(
    f.store
      .list("message")
      .filter((message) => message.author === "user" && message.thread_id === group.id),
  ).toHaveLength(1);
  // The chosen member may immediately execute; the original router itself ran exactly once.
  expect(f.store.list("run").filter((run) => run.thread_id !== group.id)).toHaveLength(1);
  expect(executions).toBeGreaterThanOrEqual(1);
});

test("unknown native fallback remains fenced and never exposes preparation retry", async () => {
  const { lifecycle, group, groups } = setup();
  const route = groups.send(group.id, { text: "Resolve the request." });
  background = new Background(lifecycle);
  background.tick();
  await background.idle();
  const current = f.store.get("group_route", route.id);
  const run = f.store.get("run", present(current.router_run_id));
  lifecycle.bind(run.thread_id, run.agent_id, crypto.randomUUID());
  const claimed = present(lifecycle.claimNext(run.thread_id, run.agent_id));
  lifecycle.started(claimed.id, present(claimed.dispatch_token));
  lifecycle.settle(claimed.id, present(claimed.dispatch_token), "unknown");
  groups.advance();
  const view = present(new Conversations(lifecycle).snapshot(group.id).routes[0]);
  expect(view.execution.stage).toBe("reconcile");
  expect(view.execution.retry_preparation).toBe(false);
  expect(() =>
    lifecycle.retryPreparation(claimed.id, f.store.get("run", claimed.id).revision),
  ).toThrow("CONFLICT");
});
