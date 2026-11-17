import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { operationSchemas } from "../../../apps/server/src/api-responses";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION } from "../../../apps/server/src/contracts";
import { conversationSnapshot } from "../../../apps/server/src/conversations";
import { routingInputHash } from "../../../apps/server/src/groups/routing-policy";
import { Groups } from "../../../apps/server/src/groups/service";
import { Connections } from "../../../apps/server/src/harness/connections";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const directory = mkdtempSync(join(tmpdir(), "ngertiin-semantic-api-"));
const store = new Store(join(directory, "state.sqlite"), crypto.randomUUID());
let release: () => void = () => {};
const waiting = new Promise<void>((resolve) => {
  release = resolve;
});
const privatePolicy = "PRIVATE_ROUTING_POLICY_CANARY_9341";
const lifecycle = new Lifecycle(store, {
  async choose(packet, _signal, observe) {
    const request = {
      model: "fixture",
      state: { latest_request: packet.request },
      questions: { recipient: privatePolicy },
    };
    observe?.({ phase: "focused", request });
    observe?.({
      phase: "focused",
      request,
      response: { choice: packet.members[0].agent_id },
      duration_ms: 1,
    });
    observe?.({ phase: "reviewing", request });
    await waiting;
    observe?.({ phase: "reviewing", request, response: { role: "addressee" }, duration_ms: 1 });
    return {
      agent_id: packet.members[0].agent_id,
      model: "fixture",
      confidence: 1,
      probabilities: { selected: 1 },
      input_tokens: 10,
      variant: "semantic",
      policy_version: "semantic-routing-v3",
      input_sha256: routingInputHash(request),
      model_calls: 2,
      review_support: 1,
    };
  },
});
const background = new Background(lifecycle);
const token = "s".repeat(64);
const app = createApi(lifecycle, background, token);
async function request(path: string, body?: object, key = crypto.randomUUID(), auth = token) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${auth}`,
        "Idempotency-Key": key,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
}
try {
  const connection = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = lifecycle.createAgent({
    name: "Semantic actor",
    harness: "codex",
    connection_id: connection.id,
  });
  const group = lifecycle.create("thread", { type: "group", member_agent_ids: [agent.id] });
  const another = lifecycle.create("thread", { type: "group", member_agent_ids: [agent.id] });
  const body = { text: "Preserve the original conversational request." },
    key = crypto.randomUUID();
  const sent = await request(`/v1/groups/${group.id}/messages`, body, key);
  assert.equal(sent.status, 200);
  const route = await sent.json();
  background.tick();
  await Bun.sleep(1);
  const pending = conversationSnapshot.parse(
    await (await request(`/v1/threads/${group.id}/snapshot`)).json(),
  );
  assert.equal(pending.routes[0].execution.stage, "reviewing");
  assert(!JSON.stringify(pending).includes(privatePolicy));
  const events = await (await request("/v1/events?after=0&limit=1000")).json();
  assert(!JSON.stringify(events).includes(privatePolicy));
  const publicEntity = await (await request(`/v1/entities/group_route/${route.id}`)).json();
  assert(!JSON.stringify(publicEntity).includes(privatePolicy));
  const inspected = await request(`/v1/groups/${group.id}/routes/${route.id}/decision`);
  assert.equal(inspected.status, 200);
  const trace = operationSchemas.routing_decision.parse(await inspected.json());
  assert.equal(trace.trace?.events.length, 3);
  assert(JSON.stringify(trace).includes(privatePolicy));
  assert.equal((await request(`/v1/groups/${another.id}/routes/${route.id}/decision`)).status, 403);
  assert.equal(
    (
      await request(
        `/v1/groups/${group.id}/routes/${route.id}/decision`,
        undefined,
        undefined,
        "invalid",
      )
    ).status,
    401,
  );
  release();
  await background.idle();
  assert.equal(store.get("group_route", route.id).state, "selected");
  assert.equal(store.routingTrace(route.id)?.events.length, 4);
  const cursor = store.cursor;
  assert.deepEqual(
    await (await request(`/v1/groups/${group.id}/messages`, body, key)).json(),
    route,
  );
  assert.equal(store.cursor, cursor);
  assert.equal(store.list("message").length, 1);
  assert.equal(store.list("run").length, 1);
  assert.equal(store.list("peer_task").length, 1);
  assert.equal(store.list("thread").filter((t) => t.purpose === "routing").length, 0);
  const contract = await (await request("/v1/contracts")).json();
  assert.equal(contract.version, CONTRACT_VERSION);
  const health = operationSchemas.ready.parse(await (await request("/health/ready")).json());
  await Bun.write(
    `docs/contracts/${CONTRACT_VERSION}.json`,
    JSON.stringify(contract, null, 2) + "\n",
  );
  await Bun.write(
    ".dev/verification/jev-routing-v3/api.json",
    JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        contract: CONTRACT_VERSION,
        declared_operations: contract.http.length,
        review_progress_visible: true,
        public_policy_leaks: 0,
        owner_trace_events: 4,
        wrong_group_status: 403,
        unauthorized_status: 401,
        exact_replay_extra_events: 0,
        messages: 1,
        runs: 1,
        tasks: 1,
        native_router_runs: 0,
        harnesses: health.harnesses,
        result: "passed",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      contract: CONTRACT_VERSION,
      operations: contract.http.length,
      result: "passed",
    }),
  );
} finally {
  release();
  await background.stop();
  store.close();
  rmSync(directory, { recursive: true, force: true });
}
