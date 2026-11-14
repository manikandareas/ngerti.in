import { afterEach, beforeEach, expect, spyOn, test } from "bun:test";
import { nativeContinuation, signedOAuthQuery } from "../src/features/account/oauth-continuation";
import { selectedAgent } from "../src/features/account/selection";
import type { AISelection } from "../src/features/account/types";
import { durableCommand, followEvents, pendingMessage, request } from "../src/lib/api-client";
import {
  type ClientIdentity,
  clientScope,
  scopedFetch,
  scopedStorageKey,
  setClientScope,
} from "../src/lib/client-scope";
import type { Agent, Connection } from "../src/types/workspace";

const identity: ClientIdentity = {
  server: "https://workspace.example",
  user: "alice",
  organization: "engineering",
  session: "device-1",
  generation: "1:1",
};
const values = new Map<string, string>();
let mock: ReturnType<typeof spyOn> | undefined;
beforeEach(() => {
  values.clear();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  setClientScope(identity);
});
afterEach(() => {
  mock?.mockRestore();
  mock = undefined;
  setClientScope(null);
});

test("changing server, user, organization or session aborts the previous immutable request", async () => {
  for (const replacement of [
    { server: "https://other.example" },
    { user: "bob" },
    { organization: "marketing" },
    { session: "device-2" },
  ]) {
    setClientScope(identity);
    mock = spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
    const old = clientScope();
    const operation = request("/v1/runs", { text: "old scope" });
    setClientScope({ ...identity, ...replacement });
    await expect(operation).rejects.toThrow("Workspace changed");
    expect(old?.abort.signal.aborted).toBe(true);
    mock.mockRestore();
    mock = undefined;
  }
});

test("a lost acknowledgement retains its original private operation and cannot become another scope's submission", async () => {
  mock = spyOn(globalThis, "fetch").mockImplementation(() => new Promise(() => {}));
  const oldKey = scopedStorageKey("ngertiin:pending:message:thread");
  const operation = durableCommand("message:thread", "/v1/runs", { text: "private draft" });
  setClientScope({ ...identity, organization: "marketing" });
  await expect(operation).rejects.toThrow("Workspace changed");
  expect(values.has(oldKey)).toBe(true);
  expect(pendingMessage("thread")).toBeNull();
  expect(scopedStorageKey("ngertiin:pending:message:thread")).not.toBe(oldKey);
});

test("event resume carries the signed snapshot context and drops it at a scope boundary", async () => {
  const headers: Headers[] = [];
  mock = spyOn(globalThis, "fetch").mockImplementation(async (_path, init) => {
    headers.push(new Headers(init?.headers));
    return headers.length === 1
      ? Response.json({ cursor: 12 }, { headers: { "X-Ngertiin-Event-Context": "signed-context" } })
      : new Response(": done\n\n");
  });
  await request("/v1/threads/thread/snapshot");
  await followEvents(12, new AbortController().signal, () => {});
  expect(headers[1].get("X-Ngertiin-Organization")).toBe("engineering");
  expect(headers[1].get("X-Ngertiin-Event-Context")).toBe("signed-context");
  setClientScope({ ...identity, organization: "marketing" });
  expect(clientScope()?.eventContext).toBeNull();
});

test("external images and links receive no organization or event capability headers", async () => {
  let headers = new Headers();
  mock = spyOn(globalThis, "fetch").mockImplementation(async (_path, init) => {
    headers = new Headers(init?.headers);
    return new Response("image");
  });
  const scope = clientScope();
  if (scope) scope.eventContext = "private-event-context";
  await scopedFetch("https://images.example/image.png");
  expect(headers.has("X-Ngertiin-Organization")).toBe(false);
  expect(headers.has("X-Ngertiin-Event-Context")).toBe(false);
});

test("an unavailable explicit connection stays selected rather than inheriting organization billing", () => {
  const agent = { id: "agent", harness: "codex" } as Agent;
  const rows = [
    {
      scope: "conversation",
      harness: "codex",
      thread_id: "thread",
      agent_id: "agent",
      selection: { connection_id: "retired", model_id: "private-model", reasoning: null },
    },
    {
      scope: "organization",
      harness: "codex",
      selection: { connection_id: "organization-key", model_id: "shared-model", reasoning: null },
    },
  ] as AISelection[];
  const connection = {
    id: "organization-key",
    authentication: { billing_source: "api_key" },
  } as Connection;
  const selected = selectedAgent(agent, "thread", rows, [connection]);
  expect(selected.connection_id).toBe("retired");
  expect(selected.model_id).toBe("private-model");
  expect(selected.billing_source).toBeNull();
});

test("native login forwards only signed provider parameters and accepts only the pinned callback", () => {
  expect(
    signedOAuthQuery(
      "client_id=ngertiin-tauri&ba_param=client_id&ba_param=ba_param&sig=signature&unrelated=value",
    ),
  ).toBe("client_id=ngertiin-tauri&ba_param=client_id&ba_param=ba_param&sig=signature");
  expect(signedOAuthQuery("client_id=ngertiin-tauri")).toBeUndefined();
  expect(
    nativeContinuation(
      "http://127.0.0.1:43119/callback?code=test",
      "http://127.0.0.1:43119/callback",
    ),
  ).toContain("code=test");
  expect(
    nativeContinuation(
      "https://other.example/callback?code=test",
      "http://127.0.0.1:43119/callback",
    ),
  ).toBeNull();
});
