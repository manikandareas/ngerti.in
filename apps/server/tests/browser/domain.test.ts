import { afterEach, expect, test } from "bun:test";
import type { BrowserHost } from "../../src/browser/host";
import { Browsers } from "../../src/browser/service";
import type { Entity } from "../../src/contracts";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
class Host implements BrowserHost {
  calls: string[] = [];
  detached = 0;
  closed = 0;
  resets = 0;
  url = "https://example.org/account";
  before: (() => void | Promise<void>) | null = null;
  effect: (() => Promise<void>) | null = null;
  async connect() {
    await this.before?.();
  }
  async call(_id: string, name: string) {
    this.calls.push(name);
    if (name !== "browser_get_state") await this.effect?.();
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            url: this.url,
            binding: {
              native_session_id: "native-session",
              target_id: "target-1234",
              tabs: [{ target_id: "target-1234", tab_id: "1234" }],
            },
          }),
        },
      ],
    };
  }
  detach() {
    this.detached++;
  }
  async close() {
    this.closed++;
  }
  async reset() {
    this.resets++;
  }
  async vncPort() {
    return 12345;
  }
}
async function setup(actions = true) {
  f = await fixture();
  const connections = new Connections(f.lifecycle);
  const connection = await connections.get((await f.store.get("agent", f.agent.id)).connection_id);
  await connections.update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const host = new Host();
  const tools = await ProductTools.open(f.lifecycle, undefined, host);
  const scope = { agent_id: f.agent.id, thread_id: f.thread.id };
  const profile = await tools.browsers.create({ name: "Account", grants: [{ ...scope, actions }] });
  await f.bind();
  await f.admit();
  const run = (await f.lifecycle.claimNext(f.thread.id, f.agent.id)) as Entity<"run">;
  const lease = await tools.issue(run);
  const call = async (name: string, input: unknown) =>
    tools.call(lease.token, lease.scope, name, input);
  return { tools, host, scope, profile, run, lease, call, browsers: tools.browsers };
}
async function action(s: Awaited<ReturnType<typeof setup>>, fields: Record<string, unknown> = {}) {
  const session = await s.browsers.open(s.profile.id, s.scope);
  return {
    command_id: crypto.randomUUID(),
    session_id: session.id,
    generation: session.generation,
    tool: "browser_navigate",
    arguments: { url: "https://example.org" },
    ...fields,
  };
}

test("browser grants are explicit per conversation and action permission is separate from viewing", async () => {
  const s = await setup(false);
  const group = await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  });
  expect(await s.browsers.list({ ...s.scope, thread_id: group.id })).toEqual([]);
  await expect(s.browsers.open(s.profile.id, { ...s.scope, thread_id: group.id })).rejects.toThrow(
    "SCOPE_DENIED",
  );
  const input = await action(s);
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow("SCOPE_DENIED");
  expect((await s.browsers.observe(input.session_id, s.scope)).binding.target_id).toBe(
    "target-1234",
  );
});

test("actions commit a receipt before dispatch and exact retry never repeats the native effect", async () => {
  const s = await setup();
  const input = await action(s);
  s.host.effect = async () =>
    expect((await f.store.get("browser_action", input.command_id)).state).toBe("dispatched");
  const first = await s.call("ngertiin.browser_action", input);
  expect(first).toMatchObject({ receipt: { state: "succeeded" } });
  for (let i = 0; i < 5; i++) await s.call("ngertiin.browser_action", input);
  expect(s.host.calls.filter((n) => n === "browser_navigate")).toHaveLength(1);
  await expect(
    s.call("ngertiin.browser_action", { ...input, arguments: { url: "https://example.com" } }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  const text = JSON.stringify(await f.store.list("browser_action"));
  expect(text).not.toContain("example.org");
});

test("revocation during connect fences final native action dispatch", async () => {
  const s = await setup();
  s.host.before = async () => {
    s.host.before = null;
    await s.browsers.grant(s.profile.id, 1, {
      name: "Account",
      grants: [{ ...s.scope, actions: false }],
    });
  };
  await expect(s.browsers.open(s.profile.id, s.scope)).rejects.toThrow("STALE_DISPATCH");
  expect(await f.store.list("browser_action")).toHaveLength(0);
});

test("stop rejects late actions without dispatching browser effects", async () => {
  const s = await setup();
  const input = await action(s);
  await f.lifecycle.cancel(s.run.id);
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow();
  expect(s.host.calls).toHaveLength(0);
});

test("unknown acknowledgements survive application restart without blind replay", async () => {
  const s = await setup();
  const input = await action(s);
  s.host.effect = async () => {
    throw new Error("Lost acknowledgement with private input");
  };
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow("BROWSER_UNKNOWN");
  expect((await f.store.get("browser_action", input.command_id)).state).toBe("unknown");
  await f.restart();
  const browsers = await Browsers.open(f.lifecycle, s.host);
  expect((await browsers.receipts(input.session_id, s.scope))[0].state).toBe("unknown");
  await expect(browsers.open(s.profile.id, s.scope)).rejects.toThrow("RECONCILIATION_REQUIRED");
  expect(s.host.calls.filter((n) => n === "browser_navigate")).toHaveLength(1);
});

test("foreign targets, stale generations, unlisted tools and local profile URLs are rejected", async () => {
  const s = await setup();
  const input = await action(s);
  await expect(
    s.call("ngertiin.browser_action", { ...input, expected_target_id: "foreign" }),
  ).rejects.toThrow("STALE_DISPATCH");
  await expect(s.call("ngertiin.browser_action", { ...input, generation: 99 })).rejects.toThrow(
    "STALE_DISPATCH",
  );
  await expect(
    s.call("ngertiin.browser_action", { ...input, tool: "retry_with_browser_use_agent" }),
  ).rejects.toThrow();
  await expect(
    s.call("ngertiin.browser_action", {
      ...input,
      arguments: { url: "file:///profile/Default/Cookies" },
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    s.call("ngertiin.browser_action", {
      ...input,
      tool: "browser_switch_tab",
      arguments: { tab_id: "FFFF" },
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(await f.store.list("browser_action")).toHaveLength(0);
});

test("concurrent native calls serialize by profile, and unknown effects remain held after close", async () => {
  const s = await setup();
  const input = await action(s);
  const entered = Promise.withResolvers<void>();
  let release = () => {};
  s.host.effect = () =>
    new Promise<void>((resolve) => {
      release = resolve;
      entered.resolve();
    });
  const pending = s.call("ngertiin.browser_action", input);
  await entered.promise;
  await expect(
    s.call("ngertiin.browser_action", { ...input, command_id: crypto.randomUUID() }),
  ).rejects.toThrow("CONFLICT");
  await expect(s.browsers.control(input.session_id, s.scope, "close")).rejects.toThrow("CONFLICT");
  release();
  await pending;
  await s.browsers.control(input.session_id, s.scope, "detach");
  expect(s.host.closed).toBe(0);
  expect(s.host.resets).toBe(0);
  await expect(s.browsers.observe(input.session_id, s.scope)).rejects.toThrow("STALE_DISPATCH");
});

test("cancellation during a dispatched effect holds unknown and suppresses returned page content", async () => {
  const s = await setup();
  const input = await action(s);
  s.host.effect = async () => {
    await f.lifecycle.cancel(s.run.id);
    await Bun.sleep(100);
    throw new Error("Aborted transport");
  };
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow();
  expect((await f.store.get("browser_action", input.command_id)).state).toBe("unknown");
  expect(s.host.detached).toBeGreaterThan(0);
});

test("indexed input requires a fresh observation and exact native target", async () => {
  const s = await setup();
  const input = await action(s, { tool: "browser_get_state", arguments: {} });
  const observed = (await s.call("ngertiin.browser_action", input)) as {
    content: { type: string; text?: string }[];
  };
  const snapshot = JSON.parse(observed.content.at(-1)?.text as string);
  const type = {
    ...input,
    command_id: crypto.randomUUID(),
    tool: "browser_type",
    arguments: { index: 10, text: "PRIVATE_INPUT_123" },
    ...snapshot,
  };
  await expect(
    s.call("ngertiin.browser_action", { ...type, observation_id: crypto.randomUUID() }),
  ).rejects.toThrow("STALE_DISPATCH");
  expect(await s.call("ngertiin.browser_action", type)).toMatchObject({
    receipt: { state: "succeeded", target_id: "target-1234", native_session_id: "native-session" },
  });
  await expect(
    s.call("ngertiin.browser_action", { ...type, command_id: crypto.randomUUID() }),
  ).rejects.toThrow("STALE_DISPATCH");
  expect(JSON.stringify(await f.store.events(0, 1000))).not.toContain("PRIVATE_INPUT_123");
});

test("HTTP browser resources require owner authentication and explicit scoped grants", async () => {
  const { fixtureApi: createApi } = await import("../http-fixture");
  const { Background } = await import("../../src/background");
  const s = await setup();
  const token = "b".repeat(64);
  const app = await createApi(f.lifecycle, new Background(f.lifecycle, {}), token, {
    connections: new Connections(f.lifecycle),
    tools: s.tools,
  });
  const url = `/v1/browser/profiles?agent_id=${s.scope.agent_id}&thread_id=${s.scope.thread_id}`;
  expect((await app.handle(new Request(`http://localhost${url}`))).status).toBe(401);
  const response = await app.handle(
    new Request(`http://localhost${url}`, { headers: { Authorization: `Bearer ${token}` } }),
  );
  expect(response.status).toBe(200);
  expect((await response.json())[0].profile.id).toBe(s.profile.id);
  const command = crypto.randomUUID();
  const request = () =>
    new Request("http://localhost/v1/browser/profiles", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": command,
      },
      body: JSON.stringify({ name: "Another", grants: [{ ...s.scope, actions: false }] }),
    });
  const first = await (await app.handle(request())).json();
  expect((await (await app.handle(request())).json()).id).toBe(first.id);
});

test("single-use view tickets reject foreign origins and existing viewers close on grant change", async () => {
  const { createServer } = await import("node:net");
  const { BrowserViews } = await import("../../src/browser/view");
  const s = await setup();
  const session = await s.browsers.open(s.profile.id, s.scope);
  const tcp = createServer((socket) => socket.write("RFB 003.008\n"));
  await new Promise<void>((resolve) => tcp.listen(0, "127.0.0.1", resolve));
  const address = tcp.address();
  if (!address || typeof address === "string") throw new Error("Missing local port");
  s.host.vncPort = async () => address.port;
  const views = new BrowserViews(s.browsers);
  let ws: WebSocket | undefined;
  try {
    const denied = await views.issue(session.id, s.scope, "http://localhost");
    const response = await fetch(denied.url.replace("ws:", "http:"), {
      headers: { Origin: "http://foreign.example" },
    });
    expect(response.status).toBe(403);
    const view = await views.issue(session.id, s.scope, "http://localhost");
    ws = new WebSocket(view.url);
    ws.binaryType = "arraybuffer";
    const received = await new Promise<string>((resolve, reject) => {
      if (!ws) return reject();
      ws.onmessage = (event) => resolve(Buffer.from(event.data as ArrayBuffer).toString());
      ws.onerror = () => reject(new Error("View failed"));
    });
    expect(received).toBe("RFB 003.008\n");
    expect((await fetch(view.url.replace("ws:", "http:"))).status).toBe(403);
    const closed = new Promise<void>((resolve) => {
      if (ws) ws.onclose = () => resolve();
    });
    await s.browsers.grant(s.profile.id, 1, {
      name: "Changed",
      grants: [{ ...s.scope, actions: false }],
    });
    await closed;
    expect(ws.readyState).toBe(WebSocket.CLOSED);
  } finally {
    ws?.close();
    views.close();
    tcp.close();
  }
});

test("callback credentials and raw browser errors are excluded from tool output", async () => {
  const { safeBrowserOutput } = await import("../../src/browser/output");
  const result = safeBrowserOutput({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          url: "https://example.org/callback?code=PRIVATE_CODE&state=PRIVATE_STATE&q=allowed#secret",
          tabs: [{ url: "https://example.org?access_token=PRIVATE_TOKEN" }],
          href: "/callback?code=PRIVATE_RELATIVE_CODE",
        }),
      },
    ],
  });
  const text = JSON.stringify(result);
  expect(text).not.toContain("PRIVATE_");
  expect(text).toContain("allowed");
  expect(
    JSON.stringify(
      safeBrowserOutput({
        isError: true,
        content: [{ type: "text", text: "PRIVATE_NATIVE_ERROR" }],
      }),
    ),
  ).not.toContain("PRIVATE_NATIVE_ERROR");
});

test("explicit site authentication signals distinguish valid, expired and unknown sessions", async () => {
  const s = await setup();
  await s.browsers.grant(s.profile.id, 1, {
    name: "Account",
    grants: [{ ...s.scope, actions: true }],
    auth_policy: {
      origin: "https://example.org",
      login_path_prefix: "/login",
      authenticated_path_prefix: "/account",
    },
  });
  const session = await s.browsers.open(s.profile.id, s.scope);
  expect((await s.browsers.observe(session.id, s.scope)).auth).toBe("authenticated");
  s.host.url = "https://example.org/login?reason=expired";
  expect((await s.browsers.observe(session.id, s.scope)).auth).toBe("required");
  const input = await action(s, {
    tool: "browser_type",
    arguments: { index: 10, text: "do not submit" },
  });
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow("BROWSER_AUTH_REQUIRED");
  s.host.url = "https://other.example.org/account";
  expect((await s.browsers.observe(session.id, s.scope)).auth).toBe("unknown");
});

test("removing the last grant revokes observation, screenshots, tools and subsequent reopen", async () => {
  const s = await setup();
  const input = await action(s);
  await s.browsers.grant(s.profile.id, 1, { name: "Revoked", grants: [] });
  expect(await s.browsers.list(s.scope)).toHaveLength(0);
  await expect(s.browsers.observe(input.session_id, s.scope)).rejects.toThrow("SCOPE_DENIED");
  await expect(s.browsers.open(s.profile.id, s.scope)).rejects.toThrow("SCOPE_DENIED");
  await expect(s.call("ngertiin.browser_action", input)).rejects.toThrow("SCOPE_DENIED");
  expect(await f.store.list("browser_action")).toHaveLength(0);
});

test("lost host-control acknowledgement persists an intent and prevents implicit restart or reset replay", async () => {
  const s = await setup();
  const session = await s.browsers.open(s.profile.id, s.scope);
  let dispatched = 0;
  s.host.close = async () => {
    dispatched++;
    expect((await f.store.get("browser_session", session.id)).control_intent).toBe("close");
    throw new Error("Lost process-control acknowledgement");
  };
  await expect(s.browsers.control(session.id, s.scope, "close")).rejects.toThrow();
  await f.restart();
  const browsers = await Browsers.open(f.lifecycle, s.host);
  expect(await f.store.get("browser_session", session.id)).toMatchObject({
    state: "unknown",
    control_intent: "close",
  });
  await expect(browsers.open(s.profile.id, s.scope)).rejects.toThrow("RECONCILIATION_REQUIRED");
  await expect(browsers.observe(session.id, s.scope)).rejects.toThrow("RECONCILIATION_REQUIRED");
  await expect(browsers.control(session.id, s.scope, "reset")).rejects.toThrow(
    "RECONCILIATION_REQUIRED",
  );
  expect(dispatched).toBe(1);
});
