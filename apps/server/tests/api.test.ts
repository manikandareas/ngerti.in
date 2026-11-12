import { afterEach, expect, test } from "bun:test";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { fixture } from "./helpers";

const token = "a".repeat(64);
let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
async function setup() {
  f = await fixture();
  return await createApi(f.lifecycle, new Background(f.lifecycle), token);
}
function request(path: string, body?: unknown, key = crypto.randomUUID(), bearer = token) {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test("HTTP authentication is required for state and contracts", async () => {
  const app = await setup();
  expect((await app.handle(new Request("http://localhost/health/live"))).status).toBe(200);
  expect((await app.handle(request("/v1/contracts", undefined, undefined, "wrong"))).status).toBe(
    401,
  );
  expect(
    (await app.handle(request("/v1/contracts", undefined, undefined, "é".repeat(64)))).status,
  ).toBe(401);
  const response = await app.handle(request("/health/ready"));
  expect(response.status).toBe(200);
  expect((await response.json()).api_readiness_gate).toBe("ready");
});

test("HTTP admission retry returns the same persisted receipt and changed input conflicts", async () => {
  const app = await setup();
  const key = crypto.randomUUID();
  const body = { thread_id: f.thread.id, agent_id: f.agent.id, text: "Tolong periksa" };
  const first = await app.handle(request("/v1/runs", body, key));
  expect(first.status).toBe(200);
  const saved = await first.json();
  expect(await (await app.handle(request("/v1/runs", body, key))).json()).toEqual(saved);
  expect((await app.handle(request("/v1/runs", { ...body, text: "changed" }, key))).status).toBe(
    409,
  );
  expect(await f.store.list("message")).toHaveLength(1);
});

test("HTTP rejects identity injection, missing command keys and cross-scope references", async () => {
  const app = await setup();
  expect(
    (
      await app.handle(
        request("/v1/agents", {
          name: "Injected",
          harness: "codex",
          connection_id: crypto.randomUUID(),
          owner_id: f.owner,
        }),
      )
    ).status,
  ).toBe(422);
  const noKey = request("/v1/runs", {
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "hello",
  });
  noKey.headers.delete("Idempotency-Key");
  expect((await app.handle(noKey)).status).toBe(422);
  expect((await app.handle(request(`/v1/entities/thread/${crypto.randomUUID()}`))).status).toBe(
    404,
  );
});

test("HTTP errors do not echo malformed input or exception details", async () => {
  const app = await setup();
  const secret = "META_API_KEY=private-example-do-not-echo";
  const response = await app.handle(
    new Request("http://localhost/v1/agents", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: secret,
    }),
  );
  expect(response.status).toBe(422);
  expect(await response.text()).not.toContain(secret);
});

test("HTTP exposes schemas and cursor replay, and validates cursor bounds", async () => {
  const app = await setup();
  await f.admit();
  expect((await (await app.handle(request("/v1/contracts"))).json()).version).toBe("1.32.0");
  const first = await (await app.handle(request("/v1/events?limit=1"))).json();
  const second = await (await app.handle(request(`/v1/events?after=${first.next_cursor}`))).json();
  expect(second.events[0].cursor).toBeGreaterThan(first.next_cursor);
  expect((await app.handle(request("/v1/events?after=-1"))).status).toBe(422);
  expect((await app.handle(request("/v1/events?limit=1001"))).status).toBe(422);
});

test("HTTP cancel records local cancellation without changing goal responsibility", async () => {
  const app = await setup();
  const { run } = await f.admit();
  const cancelled = await (await app.handle(request(`/v1/runs/${run.id}/cancel`, {}))).json();
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.cancellation).toBe("confirmed");
  expect(
    (
      await app.handle(
        request("/v1/agents", {
          name: "Muse",
          harness: "codex",
          connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
        }),
      )
    ).status,
  ).toBe(200);
});
