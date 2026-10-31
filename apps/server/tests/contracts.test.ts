import { afterEach, expect, test } from "bun:test";
import { z } from "zod";
import { createApi } from "../src/api";
import { httpContract, responseSchemas } from "../src/api-contract";
import { Background } from "../src/background";
import { contractDocument, domainEvent, type Entity } from "../src/contracts";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());

test("published replay schema accepts browser and application receipts across restart", () => {
  f = fixture();
  const uuid = () => crypto.randomUUID();
  const scope = { agent_id: f.agent.id, thread_id: f.thread.id };
  const profile = uuid(),
    session = uuid(),
    connection = uuid(),
    run = uuid();
  const records = [
    {
      kind: "browser_profile",
      id: profile,
      name: "Account",
      auth_policy: null,
      grants: [{ ...scope, actions: true }],
      generation: 1,
      state: "active",
    },
    {
      kind: "browser_session",
      id: session,
      profile_id: profile,
      generation: 1,
      state: "unknown",
      active_run_id: run,
      control_intent: null,
    },
    {
      kind: "browser_action",
      id: uuid(),
      session_id: session,
      profile_id: profile,
      generation: 1,
      run_id: run,
      ...scope,
      fingerprint: "a".repeat(64),
      native_session_id: "native-session",
      target_id: "target",
      tool: "browser_click",
      state: "unknown",
      error_code: "BROWSER_UNKNOWN",
      elapsed_ms: 5,
    },
    {
      kind: "app_connection",
      id: connection,
      toolkit: "linear",
      account_id: "account",
      state: "active",
      generation: 1,
      grants: [],
    },
    {
      kind: "app_session",
      id: uuid(),
      connection_id: connection,
      ...scope,
      generation: 1,
      native_session_id: "app-session",
    },
    {
      kind: "app_effect",
      id: uuid(),
      connection_id: connection,
      account_id: "account",
      ...scope,
      run_id: run,
      generation: 1,
      tool: "LINEAR_GET_CURRENT_USER",
      fingerprint: "b".repeat(64),
      state: "unknown",
      log_id: null,
      error_code: "APP_UNKNOWN",
      result: null,
    },
  ];
  for (const record of records) {
    const now = new Date().toISOString();
    f.store.put({
      ...record,
      owner_id: f.owner,
      revision: 1,
      created_at: now,
      updated_at: now,
    } as Entity);
  }
  const before = f.store.events(0, 1000);
  f.restart();
  expect(f.store.events(0, 1000)).toEqual(before);
  const published = z.fromJSONSchema(contractDocument().event);
  for (const event of before) {
    expect(domainEvent.safeParse(event).success).toBe(true);
    expect(published.safeParse(event).success).toBe(true);
  }
  expect(
    before
      .filter((event) => event.data.kind.endsWith("action") || event.data.kind === "app_effect")
      .every((event) => "state" in event.data && event.data.state === "unknown"),
  ).toBe(true);
});

test("published command schemas retain optional defaulted admission fields", () => {
  f = fixture();
  const schema = z.fromJSONSchema(contractDocument().commands.admit);
  expect(
    schema.safeParse({ thread_id: f.thread.id, agent_id: f.agent.id, text: "Hello" }).success,
  ).toBe(true);
  expect(contractDocument().commands.admit.required).toEqual(["thread_id", "agent_id", "text"]);
});

test("consumer contract describes actual routes without executing native operations", async () => {
  f = fixture();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "a".repeat(64));
  const cursor = f.store.cursor;
  const response = await app.handle(
    new Request("http://localhost/v1/contracts", {
      headers: { Authorization: `Bearer ${"a".repeat(64)}` },
    }),
  );
  expect(response.status).toBe(200);
  const contract = await response.json();
  expect(contract.http).toEqual(httpContract(app.routes));
  expect(contract.http.length).toBe(app.routes.length);
  expect(contract.http.find((r: { path: string }) => r.path === "/v1/runs").idempotency).toBe(
    "required_uuid",
  );
  expect(
    contract.http.find((r: { path: string }) => r.path === "/v1/apps/connect").idempotency,
  ).toBe("not_applicable");
  expect(
    contract.http.filter((r: { authentication: string }) => r.authentication === "run_lease"),
  ).toHaveLength(2);
  expect(contract.readiness.state).toBe("pending");
  expect(f.store.cursor).toBe(cursor);
  expect(f.store.list("run")).toHaveLength(0);
  expect(() => httpContract([{ method: "POST", path: "/v1/unclassified", hooks: {} }])).toThrow(
    "semantics are missing",
  );
});

test("published response schemas validate admission, control, history, snapshots and safe errors", async () => {
  f = fixture();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "a".repeat(64));
  async function read(path: string, body?: unknown) {
    const response = await app.handle(
      new Request(`http://localhost${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${"a".repeat(64)}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
    return response.json();
  }
  const input = { thread_id: f.thread.id, agent_id: f.agent.id, text: "Hello" };
  const admitted = await read("/v1/runs", input);
  expect(responseSchemas.admission.safeParse(admitted).success).toBe(true);
  expect(
    responseSchemas.admission.safeParse(await read("/v1/runs", { ...input, text: "stop" })).success,
  ).toBe(true);
  expect(
    responseSchemas.history.safeParse(await read(`/v1/threads/${f.thread.id}/history`)).success,
  ).toBe(true);
  expect(
    responseSchemas.conversation.safeParse(await read(`/v1/threads/${f.thread.id}/snapshot`))
      .success,
  ).toBe(true);
  expect(responseSchemas.events.safeParse(await read("/v1/events")).success).toBe(true);
  expect(
    responseSchemas.error.safeParse(await read(`/v1/runs/${admitted.run.id}/reconcile`, {}))
      .success,
  ).toBe(true);
  expect(responseSchemas.error.safeParse(await read("/v1/events?after=-1")).success).toBe(true);
});
