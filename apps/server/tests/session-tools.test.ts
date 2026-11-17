import { afterEach, expect, test } from "bun:test";
import type { ToolLease } from "../src/harness/client";
import { SessionTools } from "../src/harness/session-tools";

const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
function bridge(endpoint: () => string) {
  const value = new SessionTools(endpoint);
  cleanups.push(() => value.close());
  return value;
}
async function call(tools: SessionTools, method: string, authorization?: string) {
  const config = tools.config.ngertiin;
  const response = await fetch(config.url, {
    method: "POST",
    headers: {
      Authorization: authorization ?? config.headers.Authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(method === "tools/call"
        ? { params: { name: "ngertiin.read_run_context", arguments: {} } }
        : {}),
    }),
  });
  if (!response.ok) return { status: response.status };
  return response.json();
}
function active(token: string, revoke = () => {}) {
  return {
    lease: { token, revoke, scope: {} } as ToolLease,
    signal: new AbortController().signal,
    accepted: () => true,
  };
}

test("discovery before dispatch cannot acquire a run's tool authority", async () => {
  let effects = 0;
  const tools = bridge(() => {
    effects++;
    return "http://127.0.0.1:1";
  });
  expect(await call(tools, "initialize")).toHaveProperty("result.capabilities.tools");
  expect(await call(tools, "tools/list")).toHaveProperty("result.tools");
  expect(await call(tools, "tools/call")).toHaveProperty("error.data.code", "NATIVE_REJECTED");
  expect(effects).toBe(0);
});

test("concurrent calls initialize once per immutable run lease and retain each tool authorization", async () => {
  const counts: Record<string, number> = {};
  const authorization: string[] = [];
  const gateway = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const frame = (await request.json()) as { id?: unknown; method: string };
      counts[frame.method] = (counts[frame.method] ?? 0) + 1;
      authorization.push(request.headers.get("Authorization") ?? "");
      if (frame.method === "notifications/initialized") return new Response(null, { status: 202 });
      return Response.json({
        jsonrpc: "2.0",
        id: frame.id,
        result: frame.method === "initialize" ? {} : { content: [], isError: false },
      });
    },
  });
  cleanups.push(() => gateway.stop(true));
  const tools = bridge(() => `http://127.0.0.1:${gateway.port}/tools`);
  tools.active = active("one-immutable-run");
  const answers = await Promise.all(Array.from({ length: 5 }, () => call(tools, "tools/call")));
  expect(answers.every((answer) => answer.result?.isError === false)).toBe(true);
  expect(counts).toEqual({ initialize: 1, "notifications/initialized": 1, "tools/call": 5 });
  expect(new Set(authorization)).toEqual(new Set(["Bearer one-immutable-run"]));
  tools.revoke();
  expect(await call(tools, "tools/call")).toHaveProperty("error.data.code", "NATIVE_REJECTED");
  expect(counts["tools/call"]).toBe(5);
});

test("an old endpoint never receives the next run's privileges even when a late call arrives", async () => {
  const received: string[] = [];
  const gateway = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const frame = (await request.json()) as { method: string; id?: unknown };
      if (frame.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (frame.method === "tools/call") received.push(request.headers.get("Authorization") ?? "");
      return Response.json({
        jsonrpc: "2.0",
        id: frame.id,
        result: frame.method === "initialize" ? {} : { content: [], isError: false },
      });
    },
  });
  cleanups.push(() => gateway.stop(true));
  const endpoint = () => `http://127.0.0.1:${gateway.port}/tools`;
  let revoked = false;
  const old = bridge(endpoint);
  old.active = active("old-run", () => {
    revoked = true;
  });
  expect(await call(old, "tools/call")).toHaveProperty("result.isError", false);
  old.revoke();
  expect(revoked).toBe(true);
  expect(() => {
    old.active = active("next-run");
  }).toThrow("NATIVE_REJECTED");
  const next = bridge(endpoint);
  next.active = active("next-run");
  expect(await call(old, "tools/call")).toHaveProperty("error.data.code", "NATIVE_REJECTED");
  expect(await call(next, "tools/call", old.config.ngertiin.headers.Authorization)).toEqual({
    status: 403,
  });
  expect(await call(next, "tools/call")).toHaveProperty("result.isError", false);
  expect(received).toEqual(["Bearer old-run", "Bearer next-run"]);
});

test("revoking a bridge aborts an in-flight call and fences its delayed result", async () => {
  let received = false;
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gateway = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const frame = (await request.json()) as { method: string; id?: unknown };
      if (frame.method === "notifications/initialized") return new Response(null, { status: 202 });
      if (frame.method === "tools/call") {
        received = true;
        await delayed;
      }
      return Response.json({
        jsonrpc: "2.0",
        id: frame.id,
        result: frame.method === "initialize" ? {} : { content: [], isError: false },
      });
    },
  });
  cleanups.push(() => gateway.stop(true));
  const tools = bridge(() => `http://127.0.0.1:${gateway.port}/tools`);
  tools.active = active("run");
  const pending = call(tools, "tools/call");
  for (let i = 0; i < 100 && !received; i++) await Bun.sleep(5);
  expect(received).toBe(true);
  tools.revoke();
  release();
  expect(await pending).toHaveProperty("error");
  expect(tools.active).toBeNull();
});
