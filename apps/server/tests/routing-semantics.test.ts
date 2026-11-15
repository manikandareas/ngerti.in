import { afterEach, expect, test } from "bun:test";
import { Background } from "../src/background";
import { Conversations } from "../src/conversations";
import { type GroupRouter, JevRouter, type RoutingPacket } from "../src/groups/router";
import { memberKey, routingState } from "../src/groups/routing-context";
import { routingEvidence } from "../src/groups/routing-policy";
import { Groups } from "../src/groups/service";
import { productToolSchemas } from "../src/harness/product-tool-contracts";
import { Lifecycle } from "../src/lifecycle";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
let background: Background | undefined;
afterEach(async () => {
  await background?.stop();
  background = undefined;
  await f?.close();
});
async function setup(router?: GroupRouter) {
  f = await fixture();
  const lifecycle = await Lifecycle.open(f.store, router);
  const peer = await lifecycle.createAgent({
    name: "Writer",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const group = await lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  });
  return { lifecycle, peer, group, groups: new Groups(lifecycle) };
}
function focused(key: string, basis = "addressed", relationship = "direct") {
  return {
    model: "jev-1.14.0",
    answers: {
      responder: {
        type: "choice",
        choice: key,
        confidence: 0.98,
        probabilities: { [key]: 0.99, unresolved: 0.01 },
      },
      basis: { type: "choice", choice: basis, confidence: 0.98, probabilities: { [basis]: 0.99 } },
      relationship: {
        type: "choice",
        choice: relationship,
        confidence: 0.98,
        probabilities: { [relationship]: 0.99 },
      },
    },
    usage: { input_tokens: 120, output_tokens: 30 },
  };
}
function packet(): RoutingPacket {
  return {
    group: { name: "Shared work", shared_instructions: "" },
    request: "Writer, answer this.",
    request_message_id: "request",
    members: [
      { agent_id: "one", name: "Researcher", handle: null, soul: "Research", instructions: "" },
      { agent_id: "two", name: "Writer", handle: null, soul: "Write", instructions: "" },
    ],
    history: [{ id: "old", author: "agent", agent_id: "one", text: "unrelated-history-canary" }],
    attachments: [],
  };
}

test("focused decisions exclude historical bodies, retain the complete request and use identity-stable keys", async () => {
  const sample = packet();
  sample.request = `Writer, answer this. ${"x".repeat(20_000)}`;
  let calls = 0;
  const router = new JevRouter("private-sdk-key", 1500, (async (_url, options) => {
    calls++;
    const body = JSON.parse(options?.body as string);
    expect(body.state.latest_request).toBe(sample.request);
    expect(JSON.stringify(body)).not.toContain("unrelated-history-canary");
    expect(JSON.stringify(body)).not.toContain("private-sdk-key");
    return Response.json(focused(memberKey("two")));
  }) as typeof fetch);
  const first = await router.choose(sample, new AbortController().signal);
  expect(first.agent_id).toBe("two");
  expect(calls).toBe(1);
  const reversed = structuredClone(sample);
  reversed.members.reverse();
  expect(Object.keys(routingState(reversed).members).sort()).toEqual(
    Object.keys(routingState(sample).members).sort(),
  );
});

test("semantic context selection expands factual shared history once within the same decision", async () => {
  const sample = packet();
  sample.request = "Continue your previous work.";
  let calls = 0;
  const router = new JevRouter("fixture", 1500, (async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    calls++;
    if (calls === 1) {
      expect(body.state.recent_history).toEqual([]);
      return Response.json(focused("unresolved", "shared_context", "continuation"));
    }
    expect(body.state.recent_history[0].text).toBe("unrelated-history-canary");
    return Response.json({
      model: "jev-1.14.0",
      answers: { responder: focused(memberKey("one")).answers.responder },
      usage: { input_tokens: 200, output_tokens: 10 },
    });
  }) as typeof fetch);
  const decision = await router.choose(sample, new AbortController().signal);
  expect(decision).toMatchObject({
    agent_id: "one",
    context_scope: "shared",
    model_calls: 2,
    input_tokens: 320,
  });
  expect(calls).toBe(2);
});

test("a high-confidence downstream selection is not admitted when semantic role review disagrees", async () => {
  let calls = 0;
  const router = new JevRouter("fixture", 1500, (async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    calls++;
    const key = Object.keys(body.state.members)[0];
    if (calls === 1) return Response.json(focused(key, "addressed", "delegation"));
    expect(body.state.recent_history).toEqual([]);
    return Response.json({
      model: "jev-1.14.0",
      answers: {
        delegator: {
          type: "choice",
          choice: "unclear",
          confidence: 0.1,
          probabilities: { unclear: 0.4, none: 0.3, Writer: 0.3 },
        },
        delegation: { type: "noul", noul: 0.5 },
        peer: { type: "choice", choice: "none", confidence: 1, probabilities: { none: 1 } },
      },
      usage: { input_tokens: 120, output_tokens: 20 },
    });
  }) as typeof fetch);
  const { lifecycle, group, groups } = await setup(router);
  const route = await groups.send(group.id, { text: "Ask the writer to greet me." });
  background = new Background(lifecycle);
  await background.tick();
  await background.idle();
  await background.tick();
  await background.idle();
  const saved = await f.store.get("group_route", route.id);
  expect(saved.routing).toMatchObject({
    provider: "member",
    review_role: "unclear",
    review_support: 0,
    evidence: { reason: "review" },
  });
  expect(saved.router_run_id).not.toBeNull();
  expect(await f.store.list("peer_task")).toHaveLength(0);
  expect(await f.store.list("run")).toHaveLength(1);
  expect(calls).toBe(2);
});

test("a coherent relational judgment can resolve the initiator without a phrase recognizer", async () => {
  let calls = 0;
  const router = new JevRouter("fixture", 1500, (async (_url, options) => {
    const body = JSON.parse(options?.body as string);
    calls++;
    if (calls === 1)
      return Response.json(focused(Object.keys(body.state.members)[0], "addressed", "delegation"));
    return Response.json({
      model: "jev-1.14.0",
      answers: {
        delegator: {
          type: "choice",
          choice: "Writer",
          confidence: 0.98,
          probabilities: { Writer: 0.98, none: 0.02 },
        },
        peer: {
          type: "choice",
          choice: "Researcher",
          confidence: 1,
          probabilities: { Researcher: 1 },
        },
        delegation: { type: "noul", noul: 0.95 },
      },
      usage: { input_tokens: 100, output_tokens: 20 },
    });
  }) as typeof fetch);
  const { lifecycle, group, groups, peer } = await setup(router);
  const text = "Writer, ask Researcher to greet me.";
  const route = await groups.send(group.id, { text });
  background = new Background(lifecycle);
  await background.tick();
  await background.idle();
  const selected = await f.store.get("group_route", route.id);
  expect(selected).toMatchObject({
    state: "selected",
    selected_agent_id: peer.id,
    router_run_id: null,
  });
  expect((await f.store.get("message", route.message_id)).text).toBe(text);
  expect(await f.store.list("peer_task")).toHaveLength(1);
  expect(calls).toBe(2);
});

test("observations remain in scoped owner diagnostics and survive restart without rerouting", async () => {
  const { lifecycle, group, groups } = await setup({
    async choose(sample, _signal, observe) {
      observe?.({
        phase: "focused",
        request: {
          state: { request: sample.request },
          questions: { private_question_canary: "Interpret the initial actor." },
        },
      });
      observe?.({
        phase: "focused",
        request: { state: { request: sample.request } },
        response: { selected: sample.members[0].agent_id },
        duration_ms: 1,
      });
      return {
        agent_id: sample.members[0].agent_id,
        model: "fixture",
        confidence: 1,
        probabilities: { selected: 1 },
        input_tokens: 10,
      };
    },
  });
  const route = await groups.send(group.id, { text: "Read the shared request." });
  background = new Background(lifecycle);
  await background.tick();
  await background.idle();
  const before = await f.store.cursor;
  expect(JSON.stringify(await new Conversations(lifecycle).snapshot(group.id))).not.toContain(
    "private_question_canary",
  );
  const ownerToken = "a".repeat(64);
  const api = await createApi(lifecycle, background, ownerToken);
  const request = (path: string, token = ownerToken) =>
    api.handle(
      new Request(`http://localhost${path}`, { headers: { Authorization: `Bearer ${token}` } }),
    );
  const result = await request(`/v1/groups/${group.id}/routes/${route.id}/decision`);
  expect(result.status).toBe(200);
  expect(JSON.stringify(await result.json())).toContain("private_question_canary");
  expect(
    (await request(`/v1/groups/${group.id}/routes/${route.id}/decision`, "wrong")).status,
  ).toBe(401);
  expect((await request(`/v1/groups/${f.thread.id}/routes/${route.id}/decision`)).status).toBe(403);
  expect(await f.store.cursor).toBe(before);
  await background.stop();
  background = undefined;
  await f.restart();
  expect((await f.store.routingTrace(route.id))?.events).toHaveLength(2);
  expect((await f.store.get("group_route", route.id)).state).toBe("selected");
});

test("queued classification never imports later messages or private DM history", async () => {
  const { groups, group } = await setup({
    async choose() {
      throw new Error("Not used");
    },
  });
  await f.admit("private-DM-canary");
  const first = await groups.send(group.id, { text: "Earlier request." });
  await groups.send(group.id, { text: "future-turn-canary" });
  const firstPacket = await groups.routingPacket(first.id);
  expect(JSON.stringify(firstPacket)).not.toContain("private-DM-canary");
  expect(JSON.stringify(firstPacket)).not.toContain("future-turn-canary");
  expect(firstPacket.origin).toMatchObject({ kind: "user_request", actor_id: null });
  await groups.rejectRouting(first.id, null, "ROUTING_UNAVAILABLE");
  const rejected = await f.store.get("group_route", first.id);
  const refreshed = await groups.retry(group.id, first.id, {
    expected_revision: rejected.revision,
  });
  expect(JSON.stringify(await groups.routingPacket(refreshed.id))).toContain("future-turn-canary");
  expect(
    (await f.store.list("message")).filter((message) => message.thread_id === group.id),
  ).toHaveLength(2);
});

test("identity ambiguity is factual evidence while the model retains the semantic choice", () => {
  const sample = packet();
  sample.members[0].name = "Raka Pratama";
  sample.members[1].name = "Raka Utama";
  const state = routingState(sample);
  expect(state.identity_ambiguities.raka).toEqual([memberKey("one"), memberKey("two")]);
  expect(state.latest_request).toBe(sample.request);
});

test("member fallback can ask for clarification without assigning an arbitrary member", async () => {
  const { lifecycle, groups, group } = await setup();
  const route = await groups.send(group.id, {
    text: "Ask Raka, but there are two possible people.",
  });
  const run = await f.store.get("run", route.router_run_id);
  await lifecycle.bind(run.thread_id, run.agent_id, crypto.randomUUID());
  const claimed = await lifecycle.claimNext(run.thread_id, run.agent_id);
  if (!claimed?.dispatch_token) throw new Error("Expected a router claim.");
  await lifecycle.started(claimed.id, claimed.dispatch_token, crypto.randomUUID());
  await lifecycle.appendAnswer(
    claimed.id,
    JSON.stringify({ unresolved: true, question: "Raka yang mana yang Anda maksud?" }),
  );
  await lifecycle.settle(claimed.id, claimed.dispatch_token, "succeeded");
  await groups.advance();
  expect(await f.store.get("group_route", route.id)).toMatchObject({
    state: "rejected",
    error_code: "ROUTING_UNRESOLVED",
    clarification: "Raka yang mana yang Anda maksud?",
  });
  expect(await f.store.list("peer_task")).toHaveLength(0);
  expect((await f.store.list("message")).filter((m) => m.thread_id === group.id)).toHaveLength(1);
});

test("public handoff tools require an agent-authored announcement without prescribing its wording", () => {
  const data = {
    command_id: crypto.randomUUID(),
    agent_id: crypto.randomUUID(),
    instruction: "Please review the shared result.",
    purpose: "review",
  };
  expect(productToolSchemas["ngertiin.group_handoff"].safeParse(data).success).toBe(false);
  expect(
    productToolSchemas["ngertiin.group_handoff"].safeParse({
      ...data,
      announcement: "Could you take a look at this result?",
    }).success,
  ).toBe(true);
});

test("unrelated optional judgments do not veto an otherwise supported decision", () => {
  expect(
    routingEvidence({
      agent_id: "a",
      model: "fixture",
      confidence: 0.9,
      probabilities: { a: 0.94, other: 0.06 },
      input_tokens: 10,
      requested_peer_id: null,
    }).reason,
  ).toBe("accepted");
});
