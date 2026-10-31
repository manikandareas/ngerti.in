import assert from "node:assert/strict";
import { z } from "../../../apps/server/node_modules/zod";
import { createApi } from "../../../apps/server/src/api";
import { responseSchemas } from "../../../apps/server/src/api-contract";
import { Background } from "../../../apps/server/src/background";
import { type DomainEvent, domainEvent, type Entity } from "../../../apps/server/src/contracts";
import { fixture } from "../../../apps/server/tests/helpers";

const directory = process.argv[2] ?? "docs/verification/nma-060/cancellation";
const f = fixture(),
  token = "c".repeat(64);
let app = createApi(f.lifecycle, new Background(f.lifecycle), token);
const checks: string[] = [];
const examples: Record<string, unknown> = {};
async function request(
  path: string,
  body?: unknown,
  key: string = crypto.randomUUID(),
  bearer = token,
) {
  return app.handle(
    new Request(`http://localhost${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
}
async function json(path: string, body?: unknown, key?: string) {
  const response = await request(path, body, key);
  assert.equal(response.status, 200, path);
  return response.json();
}
try {
  const contract = await json("/v1/contracts");
  assert.equal(contract.version, "1.12.0");
  assert.equal(contract.http.length, app.routes.length);
  assert.equal(contract.readiness.state, "pending");
  for (const name of Object.keys(responseSchemas)) assert(contract.projections[name]);
  checks.push("published_contract_matches_router_and_keeps_gate_pending");
  await Bun.write(
    `docs/contracts/${contract.version}.json`,
    `${JSON.stringify(contract, null, 2)}\n`,
  );

  const setup = await json("/v1/setup", {});
  responseSchemas.setup.parse(setup);
  const initial = responseSchemas.conversation.parse(
    await json(`/v1/threads/${f.thread.id}/snapshot`),
  );
  const command = crypto.randomUUID();
  const input = {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Please inspect the attached project.",
  };
  const admission = responseSchemas.admission.parse(await json("/v1/runs", input, command));
  assert(admission.run);
  z.fromJSONSchema(
    contract.http.find(
      (r: { method: string; path: string }) => r.method === "POST" && r.path === "/v1/runs",
    ).request.body,
  ).parse(input);
  z.fromJSONSchema(contract.projections.admission).parse(admission);
  examples.setup = setup;
  examples.admission_request = input;
  examples.admission = admission;
  const deleted = await json(`/v1/messages/${admission.message.id}/delete`, {
    expected_revision: admission.message.revision,
  });
  assert.equal(deleted.state, "deleted");
  const cursor = f.store.cursor;
  assert.deepEqual(await json("/v1/runs", input, command), admission);
  assert.equal(f.store.cursor, cursor);
  assert.equal((await json(`/v1/entities/run/${admission.run.id}`)).status, "cancelled");
  examples.original_receipt_after_cancellation = admission;
  checks.push("original_command_receipt_is_stable_and_distinct_from_current_run_state");

  const projection = new Map<string, Entity>();
  let handled = initial.cursor;
  function apply(event: DomainEvent) {
    domainEvent.parse(event);
    z.fromJSONSchema(contract.event).parse(event);
    if (event.cursor <= handled) return;
    assert.equal(event.entity_kind, event.data.kind);
    assert.equal(event.entity_id, event.data.id);
    assert.equal(event.revision, event.data.revision);
    assert.equal(event.owner_id, event.data.owner_id);
    const key = `${event.entity_kind}:${event.entity_id}`;
    const previous = projection.get(key);
    if (!previous || previous.revision < event.revision) projection.set(key, event.data);
    handled = event.cursor;
  }
  let after = initial.cursor;
  const replay: DomainEvent[] = [];
  for (;;) {
    const page = responseSchemas.events.parse(await json(`/v1/events?after=${after}&limit=2`));
    z.fromJSONSchema(contract.projections.events).parse(page);
    for (const event of page.events) {
      replay.push(event);
      apply(event);
    }
    after = page.next_cursor;
    if (page.events.length < 2) break;
  }
  const serialized = JSON.stringify([...projection]);
  for (const event of [...replay, ...replay].reverse()) apply(event);
  assert.equal(JSON.stringify([...projection]), serialized);
  assert.equal(
    (projection.get(`message:${admission.message.id}`) as Entity<"message">).state,
    "deleted",
  );
  examples.events = replay;
  examples.history = responseSchemas.history.parse(
    await json(`/v1/threads/${f.thread.id}/history`),
  );
  assert.equal((examples.history as z.infer<typeof responseSchemas.history>).messages.length, 0);
  checks.push("snapshot_cursor_pagination_duplicate_replay_and_tombstones_preserve_projection");

  const abort = new AbortController();
  const stream = await app.handle(
    new Request("http://localhost/v1/events/stream?after=0", {
      headers: { Authorization: `Bearer ${token}`, "Last-Event-ID": String(initial.cursor) },
      signal: abort.signal,
    }),
  );
  assert.equal(stream.headers.get("Content-Type"), "text/event-stream");
  const reader = stream.body!.getReader(),
    decoder = new TextDecoder();
  let buffer = "",
    first: DomainEvent | null = null;
  try {
    while (!first) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      buffer += decoder.decode(chunk.value, { stream: true });
      for (const frame of buffer.split("\n\n").slice(0, -1)) {
        const data = frame.split("\n").find((line) => line.startsWith("data: "));
        if (data) {
          first = domainEvent.parse(JSON.parse(data.slice(6)));
          break;
        }
      }
    }
    assert.deepEqual(first, replay[0]);
    examples.sse_frame = `id: ${first.cursor}\nevent: domain\ndata: ${JSON.stringify(first)}\n\n`;
  } finally {
    abort.abort();
    await reader.cancel();
  }
  checks.push("authenticated_sse_matches_polling_and_last_event_id_precedes_query");

  const errorCases = [
    ["unauthorized", await request("/v1/contracts", undefined, undefined, "wrong"), 401],
    ["invalid", await request("/v1/events?after=-1"), 422],
    ["conflict", await request("/v1/runs", { ...input, text: "Changed" }, command), 409],
    ["harness", await request(`/v1/runs/${admission.run.id}/reconcile`, {}), 409],
  ] as const;
  for (const [name, response, status] of errorCases) {
    assert.equal(response.status, status);
    const error = responseSchemas.error.parse(await response.json());
    z.fromJSONSchema(contract.projections.error).parse(error);
    examples[`error_${name}`] = { status, body: error };
  }
  checks.push("domain_harness_validation_and_authentication_error_examples_validate");

  f.restart();
  app = createApi(f.lifecycle, new Background(f.lifecycle), token);
  assert.deepEqual(await json("/v1/runs", input, command), admission);
  assert.equal(f.store.cursor, cursor);
  assert.equal(f.store.list("run").length, 1);
  checks.push(
    "sqlite_restart_preserves_original_receipt_events_and_cancelled_state_without_dispatch",
  );
  examples.conversation = responseSchemas.conversation.parse(
    await json(`/v1/threads/${f.thread.id}/snapshot`),
  );
  await Bun.write(`${directory}/consumer-fixtures.json`, `${JSON.stringify(examples, null, 2)}\n`);
  await Bun.write(
    `${directory}/consumer.json`,
    `${JSON.stringify(
      {
        evidence_level: "contract_fixture_http_in_process",
        pass: checks.length,
        fail: 0,
        skip: 0,
        checks,
        routes: contract.http.length,
        entities: Object.keys(contract.entities).length,
        product_tools: contract.product_tools.length,
        native_inference: 0,
        api_readiness_gate: "pending",
      },
      null,
      2,
    )}\n`,
  );
  console.log(JSON.stringify({ pass: checks.length, fail: 0, checks }));
} finally {
  f.close();
}
