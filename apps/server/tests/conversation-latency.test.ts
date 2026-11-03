import { afterEach, expect, test } from "bun:test";
import { Background } from "../src/background";
import { eventStream } from "../src/event-stream";
import {
  type GroupRouter,
  JevRouter,
  type RoutingDecision,
  type RoutingPacket,
} from "../src/groups/router";
import { Groups } from "../src/groups/service";
import { Lifecycle } from "../src/lifecycle";
import { fixture } from "./helpers";

function present<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("Expected a fixture value.");
  return value;
}

let f: ReturnType<typeof fixture>;
let background: Background | undefined;
afterEach(async () => {
  await background?.stop();
  background = undefined;
  f?.close();
});
const decision = (id: string | null, confidence = 1): RoutingDecision => ({
  agent_id: id,
  model: "jev-1.14.0",
  confidence,
  probabilities: { selected: confidence, unresolved: 1 - confidence },
  input_tokens: 200,
});
function groupFixture(router: GroupRouter) {
  f = fixture();
  const lifecycle = new Lifecycle(f.store, router);
  const peer = lifecycle.createAgent({
    name: "Writer",
    handle: "writer",
    soul: "Writes the requested final article.",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const group = lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  const groups = new Groups(lifecycle);
  background = new Background(lifecycle);
  return { lifecycle, groups, group, peer };
}
async function until(predicate: () => boolean) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(5);
  expect(predicate()).toBe(true);
}

test("commit notifications coalesce nested writes and ignore rolled-back commands", async () => {
  f = fixture();
  await Promise.resolve();
  let notifications = 0;
  const unsubscribe = f.store.subscribe(() => notifications++);
  const before = f.store.cursor;
  expect(() =>
    f.store.transaction(() => {
      f.admit();
      throw new Error("rollback");
    }),
  ).toThrow("rollback");
  await Promise.resolve();
  expect(f.store.cursor).toBe(before);
  expect(notifications).toBe(0);
  f.store.transaction(() => {
    f.admit();
    f.admit();
  });
  await Promise.resolve();
  expect(notifications).toBe(1);
  unsubscribe();
});

test("SSE wakes on a committed event without waiting for its periodic heartbeat", async () => {
  f = fixture();
  const abort = new AbortController();
  const reader = present(eventStream(f.store, f.store.cursor, abort.signal).body).getReader();
  await reader.read();
  const waiting = reader.read();
  const start = performance.now();
  f.admit();
  const next = await waiting;
  expect(new TextDecoder().decode(next.value)).toContain("event: domain");
  expect(performance.now() - start).toBeLessThan(200);
  abort.abort();
  await reader.cancel();
});

test("committed admission and settlement drain FIFO without waiting for a 60-second scheduler tick", async () => {
  f = fixture();
  f.bind();
  const visited: string[] = [];
  background = new Background(f.lifecycle, {
    codex: {
      async execute(run, context) {
        visited.push(run.id);
        context.started(run.id);
        return "succeeded";
      },
    },
  });
  background.start(60_000);
  const start = performance.now();
  const first = f.admit("First");
  const second = f.admit("Second");
  await until(() => f.store.get("run", second.run.id).status === "succeeded");
  expect(visited).toEqual([first.run.id, second.run.id]);
  expect(performance.now() - start).toBeLessThan(500);
  expect(f.store.get("run", first.run.id).timings?.accepted_at).toBeDefined();
  expect(f.store.get("run", first.run.id).timings?.settled_at).toBeDefined();
});

test("configuration preparation failures stay explicit and retry the exact queued input", async () => {
  f = fixture();
  let attempts = 0;
  background = new Background(f.lifecycle, {
    codex: {
      async prepare() {
        attempts++;
        throw new Error("untrusted provider detail");
      },
      async execute() {
        throw new Error("Must not dispatch");
      },
    },
  });
  const receipt = f.admit();
  background.tick();
  await background.idle();
  background.tick();
  await background.idle();
  const blocked = f.store.get("run", receipt.run.id);
  expect(blocked.preparation?.state).toBe("blocked");
  expect(blocked.diagnostic?.code).not.toContain("untrusted");
  expect(attempts).toBe(1);
  f.lifecycle.retryPreparation(blocked.id, blocked.revision);
  background.tick();
  await background.idle();
  expect(attempts).toBe(2);
  expect(f.store.list("message")).toHaveLength(1);
  expect(f.store.list("run")).toHaveLength(1);
});

test("repairing configuration resumes the same blocked input without a polling delay", async () => {
  f = fixture();
  f.bind();
  let repaired = false;
  background = new Background(f.lifecycle, {
    codex: {
      async prepare() {
        if (!repaired) throw new Error("Configuration is missing.");
      },
      async execute(run, context) {
        context.started(run.id);
        return "succeeded";
      },
    },
  });
  background.start(60_000);
  const receipt = f.admit();
  await until(() => f.store.get("run", receipt.run.id).preparation?.state === "blocked");
  repaired = true;
  const agent = f.store.get("agent", f.agent.id);
  f.lifecycle.updateAgent(agent.id, {
    expected_revision: agent.revision,
    changes: { instructions: "Repaired configuration." },
  });
  f.bind();
  await until(() => f.store.get("run", receipt.run.id).status === "succeeded");
  expect(f.store.list("message")).toHaveLength(1);
  expect(f.store.list("run")).toHaveLength(1);
});

test("a rejected claim does not spin or let later queued inputs bypass the blocked head", async () => {
  f = fixture();
  let prepared = 0;
  background = new Background(f.lifecycle, {
    codex: {
      async prepare() {
        prepared++;
      },
      async execute(run, context) {
        context.started(run.id);
        return "succeeded";
      },
    },
  });
  background.start(60_000);
  const first = f.admit("Blocked head");
  const second = f.admit("Later input");
  await until(() => f.store.get("run", first.run.id).preparation?.state === "blocked");
  await Bun.sleep(20);
  expect(prepared).toBe(1);
  expect(f.store.get("run", second.run.id).preparation).toBeUndefined();
  f.bind();
  const blocked = f.store.get("run", first.run.id);
  f.lifecycle.retryPreparation(blocked.id, blocked.revision);
  await until(() => f.store.get("run", second.run.id).status === "succeeded");
  expect(f.store.list("message")).toHaveLength(2);
  expect(f.store.list("run")).toHaveLength(2);
});

test("Jev makes one typed SDK request and keeps its API key out of the routing state", async () => {
  let requests = 0;
  const fetcher = (async (_url: unknown, options?: RequestInit) => {
    requests++;
    const body = JSON.parse(options?.body as string);
    expect(body.model).toBe("jev-1.14.0");
    expect(body.questions.responder.type).toBe("choice");
    expect(JSON.stringify(body)).not.toContain("test-routing-key");
    const selected = Object.keys(body.state.members)[0];
    return Response.json({
      model: "jev-1.14.0",
      answers: {
        responder: {
          type: "choice",
          choice: selected,
          confidence: 1,
          probabilities: { [selected]: 1, unresolved: 0 },
        },
        basis: {
          type: "choice",
          choice: "addressed",
          confidence: 1,
          probabilities: { addressed: 1 },
        },
        relationship: {
          type: "choice",
          choice: "direct",
          confidence: 1,
          probabilities: { direct: 1 },
        },
      },
      usage: { input_tokens: 200, output_tokens: 0 },
    });
  }) as unknown as typeof fetch;
  const router = new JevRouter("test-routing-key", 1500, fetcher);
  const id = crypto.randomUUID();
  const result = await router.choose(
    {
      group: { name: null, shared_instructions: "" },
      request: "Write it.",
      request_message_id: crypto.randomUUID(),
      history: [],
      attachments: [],
      members: [
        { agent_id: id, name: "Writer", handle: "writer", soul: "Writes", instructions: "" },
      ],
    },
    new AbortController().signal,
  );
  expect(result.agent_id).toBe(id);
  expect(requests).toBe(1);
});

test("Jev rate limits do not trigger the SDK's default retry cascade", async () => {
  let requests = 0;
  const fetcher = (async () => {
    requests++;
    return Response.json(
      { error: "Rate limited" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }) as unknown as typeof fetch;
  const router = new JevRouter("fixture-key", 100, fetcher);
  await expect(
    router.choose(
      {
        group: { name: null, shared_instructions: "" },
        request: "Help",
        request_message_id: crypto.randomUUID(),
        members: [
          {
            agent_id: crypto.randomUUID(),
            name: "Helper",
            handle: null,
            soul: "Helps",
            instructions: "",
          },
        ],
        history: [],
        attachments: [],
      },
      new AbortController().signal,
    ),
  ).rejects.toThrow();
  expect(requests).toBe(1);
});

test("a persisted unfinished pure decision recomputes once and rejects the old attempt", async () => {
  let calls = 0;
  const context = groupFixture({
    async choose() {
      calls++;
      return decision(context.peer.id);
    },
  });
  const route = context.groups.send(context.group.id, { text: "Write the requested article." });
  const oldAttempt = crypto.randomUUID();
  const routing = present(route.routing);
  f.store.put(
    {
      ...route,
      revision: route.revision + 1,
      routing: { ...routing, attempt_id: oldAttempt, started_at: new Date().toISOString() },
    },
    route.revision,
  );
  const restored = new Lifecycle(f.store, context.lifecycle.groupRouter);
  const resumed = new Background(restored);
  resumed.tick();
  await resumed.idle();
  new Groups(restored).resolveRouting(route.id, oldAttempt, decision(f.agent.id), 1);
  resumed.tick();
  await resumed.idle();
  expect(calls).toBe(1);
  expect(f.store.get("group_route", route.id).selected_agent_id).toBe(context.peer.id);
  expect(f.store.list("peer_task")).toHaveLength(1);
  await resumed.stop();
});

test("Jev selects one valid member without creating a native routing session or importing DM history", async () => {
  let packet!: RoutingPacket;
  const context = groupFixture({
    async choose(value) {
      packet = value;
      return decision(context.peer.id);
    },
  });
  f.admit("private-DM-canary");
  const route = context.groups.send(context.group.id, { text: "Tolong tuliskan artikel." });
  expect(route.router_run_id).toBeNull();
  present(background).tick();
  await present(background).idle();
  const selected = f.store.get("group_route", route.id);
  expect(selected.selected_agent_id).toBe(context.peer.id);
  expect(selected.routing?.model).toBe("jev-1.14.0");
  expect(f.store.list("thread").some((thread) => thread.purpose === "routing")).toBe(false);
  expect(JSON.stringify(packet)).not.toContain("private-DM-canary");
  expect(f.store.list("peer_task")).toHaveLength(1);
  context.groups.resolveRouting(
    route.id,
    present(present(selected.routing).attempt_id),
    decision(context.peer.id),
    1,
  );
  expect(f.store.list("peer_task")).toHaveLength(1);
});

test("explicit mentions bypass Jev and stale membership fences a late decision", async () => {
  let release!: (value: RoutingDecision) => void;
  let calls = 0;
  const context = groupFixture({
    choose() {
      calls++;
      return new Promise((resolve) => {
        release = resolve;
      });
    },
  });
  context.groups.send(context.group.id, { text: "@writer Write this." });
  expect(calls).toBe(0);
  const route = context.groups.send(context.group.id, { text: "Choose a responder." });
  present(background).tick();
  await Promise.resolve();
  context.groups.membership(context.group.id, {
    expected_revision: context.group.revision,
    member_agent_ids: [f.agent.id],
  });
  release(decision(context.peer.id));
  await present(background).idle();
  expect(f.store.get("group_route", route.id).error_code).toBe("ROUTING_STALE");
  expect(f.store.list("peer_task")).toHaveLength(1);
});

test("ambiguous Jev results create exactly one explicit member-model fallback", async () => {
  const context = groupFixture({
    async choose() {
      return decision(null, 0);
    },
  });
  const route = context.groups.send(context.group.id, { text: "Can you help with this?" });
  present(background).tick();
  await present(background).idle();
  present(background).tick();
  await present(background).idle();
  const saved = f.store.get("group_route", route.id);
  expect(saved.routing?.fallback_reason).toBe("ambiguous");
  expect(saved.routing?.provider).toBe("member");
  expect(saved.router_run_id).not.toBeNull();
  expect(f.store.list("run")).toHaveLength(1);
  expect(f.store.list("peer_task")).toHaveLength(0);
});

test("switching back to the member router drains a persisted pure Jev decision without replaying work", async () => {
  const context = groupFixture({
    async choose() {
      return decision(context.peer.id);
    },
  });
  const route = context.groups.send(context.group.id, { text: "Select the next responder." });
  const restored = new Lifecycle(f.store);
  const replacement = new Background(restored);
  replacement.tick();
  await replacement.idle();
  const saved = f.store.get("group_route", route.id);
  expect(saved.routing?.provider).toBe("member");
  expect(saved.routing?.fallback_reason).toBe("configuration");
  expect(saved.router_run_id).not.toBeNull();
  expect(f.store.list("peer_task")).toHaveLength(0);
  replacement.tick();
  expect(f.store.list("run")).toHaveLength(1);
  await replacement.stop();
});

test("Jev service failures reject the original route and can retry without duplicate messages", async () => {
  let calls = 0;
  const context = groupFixture({
    async choose() {
      if (++calls === 1) throw new Error("private transport error");
      return decision(context.peer.id);
    },
  });
  const route = context.groups.send(context.group.id, { text: "Write the result." });
  present(background).tick();
  await present(background).idle();
  const rejected = f.store.get("group_route", route.id);
  expect(rejected.error_code).toBe("ROUTING_UNAVAILABLE");
  context.groups.retry(context.group.id, route.id, { expected_revision: rejected.revision });
  present(background).tick();
  await present(background).idle();
  expect(f.store.list("message")).toHaveLength(1);
  expect(f.store.list("peer_task")).toHaveLength(1);
});

test("ordinary complete handoffs settle the task without a third model run", () => {
  const context = groupFixture({
    async choose() {
      throw new Error("Explicit target must bypass routing");
    },
  });
  const route = context.groups.send(context.group.id, {
    agent_id: f.agent.id,
    text: "Ask Writer to deliver the final response.",
  });
  const task = f.store.get("peer_task", present(route.task_id));
  const start = (agentId: string) => {
    context.lifecycle.bind(context.group.id, agentId, crypto.randomUUID());
    const run = present(context.lifecycle.claimNext(context.group.id, agentId));
    context.lifecycle.started(run.id, present(run.dispatch_token), run.id);
    return run;
  };
  const parent = start(f.agent.id);
  const child = context.groups.handoff(parent.id, {
    agent_id: context.peer.id,
    purpose: "handoff",
    instruction: "Deliver the final response.",
    continuation: "complete",
  });
  context.lifecycle.settle(parent.id, present(parent.dispatch_token), "succeeded");
  const peer = start(context.peer.id);
  context.lifecycle.appendAnswer(peer.id, "Here is the complete requested response.");
  context.lifecycle.settle(peer.id, present(peer.dispatch_token), "succeeded");
  context.groups.advance();
  context.groups.advance();
  expect(f.store.get("peer_task", child.id).state).toBe("completed");
  expect(f.store.get("peer_task", task.id).state).toBe("completed");
  expect(f.store.list("run")).toHaveLength(2);
  expect(f.store.get("peer_task", task.id).continuation).toBe(0);
});
