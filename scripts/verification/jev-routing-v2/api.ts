import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { operationSchemas } from "../../../apps/server/src/api-responses";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION, run } from "../../../apps/server/src/contracts";
import { conversationSnapshot } from "../../../apps/server/src/conversations";
import { Groups } from "../../../apps/server/src/groups/service";
import { Connections } from "../../../apps/server/src/harness/connections";
import { diagnostic, HarnessError } from "../../../apps/server/src/harness/contracts";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const root = mkdtempSync(join(tmpdir(), "ngertiin-latency-api-"));
const projectRoot = resolve(import.meta.dir, "../../..");
const store = new Store(join(root, "state.sqlite"), crypto.randomUUID());
const lifecycle = new Lifecycle(store);
const background = new Background(lifecycle);
const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
const app = createApi(lifecycle, background, token);
const request = async (path: string, body?: object, key = crypto.randomUUID()) => {
  const method = body ? "POST" : "GET";
  const response = await app.handle(
    new Request(`http://localhost${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: body ? JSON.stringify(body) : undefined,
    }),
  );
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json();
};
try {
  const connection = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const agent = lifecycle.createAgent({
    name: "Latency test",
    harness: "codex",
    connection_id: connection.id,
  });
  const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
  const admission = lifecycle.admit({
    thread_id: thread.id,
    agent_id: agent.id,
    text: "An exact original request.",
  });
  lifecycle.preparing(admission.run.id);
  const blocked = lifecycle.preparationFailed(
    admission.run.id,
    diagnostic(new HarnessError("MODEL_UNAVAILABLE")),
  );
  const body = { expected_revision: blocked.revision };
  const key = crypto.randomUUID();
  const first = await request(`/v1/runs/${blocked.id}/retry-preparation`, body, key);
  const cursor = store.cursor;
  assert.deepEqual(await request(`/v1/runs/${blocked.id}/retry-preparation`, body, key), first);
  assert.equal(store.cursor, cursor);
  const ready = await request(`/v1/threads/${thread.id}/prepare`, { agent_id: agent.id });
  assert.equal(ready.state, "skipped");
  operationSchemas.session_preparation.parse(ready);
  run.parse(first);
  const health = await request("/health/ready");
  operationSchemas.ready.parse(health);
  assert(health.harnesses.some((item: { harness: string }) => item.harness === "codex"));
  const group = lifecycle.create("thread", { type: "group", member_agent_ids: [agent.id] });
  const route = new Groups(lifecycle).send(group.id, {
    text: "Preserve the blocked group request.",
  });
  assert(route.router_run_id);
  lifecycle.preparing(route.router_run_id);
  const router = lifecycle.preparationFailed(
    route.router_run_id,
    diagnostic(new HarnessError("VERSION_TOO_OLD")),
  );
  const snapshot = conversationSnapshot.parse(await request(`/v1/threads/${group.id}/snapshot`));
  assert.equal(snapshot.routes[0].execution.stage, "blocked");
  assert.equal(snapshot.routes[0].execution.retry_preparation, true);
  assert.equal(snapshot.runs.length, 0);
  const events = await request("/v1/events?after=0&limit=1000");
  assert(
    events.events.some(
      (event: { entity_id: string; conversation_thread_id?: string }) =>
        event.entity_id === router.id && event.conversation_thread_id === group.id,
    ),
  );
  const repairKey = crypto.randomUUID();
  const repairBody = { expected_revision: router.revision };
  const repaired = await request(`/v1/runs/${router.id}/retry-preparation`, repairBody, repairKey);
  const afterRepair = store.cursor;
  assert.deepEqual(
    await request(`/v1/runs/${router.id}/retry-preparation`, repairBody, repairKey),
    repaired,
  );
  assert.equal(store.cursor, afterRepair);
  const contract = await request("/v1/contracts");
  assert.equal(contract.version, CONTRACT_VERSION);
  assert.equal(store.list("message").length, 3);
  assert.equal(store.list("run").length, 2);
  await Bun.write(
    join(projectRoot, `docs/contracts/${CONTRACT_VERSION}.json`),
    `${JSON.stringify(contract, null, 2)}\n`,
  );
  await Bun.write(
    join(projectRoot, ".dev/verification/jev-routing-v2/api.json"),
    `${JSON.stringify(
      {
        captured_at: new Date().toISOString(),
        contract: CONTRACT_VERSION,
        checked_operations: ["POST /v1/threads/:id/prepare", "POST /v1/runs/:id/retry-preparation"],
        declared_routes: contract.http.length,
        exact_retry_new_events: 0,
        preserved_messages: 3,
        preserved_runs: 2,
        blocked_router_visible: true,
        router_retry_new_events: 0,
        harness_readiness_observed: health.harnesses,
        result: "passed",
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    JSON.stringify({ contract: CONTRACT_VERSION, routes: contract.http.length, result: "passed" }),
  );
} finally {
  await background.stop();
  store.close();
  rmSync(root, { recursive: true, force: true });
}
