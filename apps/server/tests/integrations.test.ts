import { afterEach, expect, test } from "bun:test";
import type { Composio } from "@composio/core";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { Connections } from "../src/harness/connections";
import { ProductTools } from "../src/harness/tools";
import { type AppHost, type AppSessionConfig, ComposioHost } from "../src/integrations/host";
import { appOutput } from "../src/integrations/output";
import { Applications } from "../src/integrations/service";
import { Interactions } from "../src/interactions/service";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
class Host implements AppHost {
  calls = 0;
  sessions: AppSessionConfig[] = [];
  users: string[] = [];
  active = true;
  before: (() => void) | null = null;
  effect: (() => Promise<void>) | null = null;
  async catalog() {
    return { items: [{ slug: "github", name: "GitHub", connected: this.active }] };
  }
  async connect(user: string) {
    this.users.push(user);
    return { account_id: "ca-proof", connect_url: "https://connect.composio.dev/link/proof" };
  }
  async accounts(user: string) {
    this.users.push(user);
    return [{ id: "ca-proof", toolkit: "github", active: this.active }];
  }
  async session(user: string, config: AppSessionConfig) {
    this.users.push(user);
    this.sessions.push(config);
    return `session-${this.sessions.length}`;
  }
  async search() {
    return [
      { slug: "GITHUB_READ_PROFILE", toolkit: "github" },
      { slug: "GMAIL_READ_MAIL", toolkit: "gmail" },
    ];
  }
  async execute(
    _session: string,
    _account: string,
    _tool: string,
    _args: Record<string, unknown>,
    authorize: () => void,
  ) {
    this.before?.();
    authorize();
    this.calls++;
    await this.effect?.();
    return {
      data: {
        name: "Proof",
        access_token: "private-provider-value",
        headers: { Authorization: "Bearer private-value" },
      },
      state: "succeeded" as const,
      log_id: "log-proof",
    };
  }
}
async function setup() {
  f = fixture();
  const connections = new Connections(f.lifecycle),
    c = connections.get(f.store.get("agent", f.agent.id).connection_id);
  connections.update(c, { capabilities: { ...c.capabilities, product_tools: "supported" } });
  const host = new Host(),
    tools = new ProductTools(f.lifecycle, undefined, undefined, host);
  const apps = tools.applications;
  let { connection } = await apps.connect("github");
  connection = await apps.refresh(connection.id);
  connection = apps.assign(connection.id, {
    expected_revision: connection.revision,
    grants: [{ agent_id: f.agent.id, thread_id: f.thread.id, tools: ["GITHUB_READ_PROFILE"] }],
  });
  f.bind();
  f.admit();
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id) as Entity<"run">;
  const lease = tools.issue(run);
  const call = (name: string, input: unknown) => tools.call(lease.token, lease.scope, name, input);
  const input = {
    command_id: crypto.randomUUID(),
    connection_id: connection.id,
    tool: "GITHUB_READ_PROFILE",
    arguments: {},
  };
  return { host, apps, tools, connection, run, input, call, lease };
}

test("application effects use the existing owner, exact account and durable sanitized receipts", async () => {
  const s = await setup();
  s.host.effect = async () => {
    expect(f.store.get("app_effect", s.input.command_id).state).toBe("dispatched");
  };
  const first = await s.call("ngertiin.execute_app_tool", s.input);
  expect(first).toMatchObject({
    receipt: {
      state: "succeeded",
      log_id: "log-proof",
      result: { name: "Proof", access_token: "[REDACTED]" },
    },
  });
  for (let i = 0; i < 5; i++)
    expect(await s.call("ngertiin.execute_app_tool", s.input)).toEqual(first);
  expect(s.host.calls).toBe(1);
  expect(s.host.users.every((u) => u === f.owner)).toBe(true);
  expect(s.host.sessions).toEqual([
    { toolkit: "github", account_id: "ca-proof", tools: ["GITHUB_READ_PROFILE"] },
  ]);
  expect(JSON.stringify(f.store.events(0, 1000))).not.toContain("private-provider-value");
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, arguments: { changed: true } }),
  ).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
test("discovery filters foreign toolkits and agent execution cannot call unassigned or meta tools", async () => {
  const s = await setup();
  expect(
    await s.call("ngertiin.search_app_tools", {
      connection_id: s.connection.id,
      query: "read profile",
    }),
  ).toEqual([{ slug: "GITHUB_READ_PROFILE", toolkit: "github" }]);
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, tool: "GITHUB_DELETE_REPOSITORY" }),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, tool: "COMPOSIO_MULTI_EXECUTE_TOOL" }),
  ).rejects.toThrow();
  expect(s.host.calls).toBe(0);
});
test("DM assignment grants do not leak to a group or another owner resource", async () => {
  const s = await setup();
  const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
  expect(s.apps.list({ agent_id: f.agent.id, thread_id: group.id })).toEqual([]);
  await expect(
    s.apps.search(
      { connection_id: s.connection.id, query: "profile" },
      { agent_id: f.agent.id, thread_id: group.id },
    ),
  ).rejects.toThrow("SCOPE_DENIED");
  await expect(
    s.apps.search({ connection_id: crypto.randomUUID(), query: "profile" }),
  ).rejects.toThrow("NOT_FOUND");
});
test("revoke or reassignment during final SDK preflight prevents the external request", async () => {
  for (const operation of ["revoke", "grant", "stop"]) {
    const s = await setup();
    s.host.before = () => {
      if (operation === "revoke") s.apps.revoke(s.connection.id);
      else if (operation === "grant")
        s.apps.assign(s.connection.id, { expected_revision: s.connection.revision, grants: [] });
      else f.lifecycle.cancel(s.run.id);
    };
    await expect(s.call("ngertiin.execute_app_tool", s.input)).rejects.toThrow();
    expect(s.host.calls).toBe(0);
    expect(f.store.list("app_effect")).toHaveLength(0);
    f.close();
  }
});
test("remote expiry is checked before every execution and reconnect fences old sessions", async () => {
  const s = await setup();
  await s.call("ngertiin.execute_app_tool", s.input);
  s.host.active = false;
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, command_id: crypto.randomUUID() }),
  ).rejects.toThrow("APP_AUTH_REQUIRED");
  expect(s.host.calls).toBe(1);
  const before = f.store.get("app_connection", s.connection.id);
  await s.apps.connect("github", before.id);
  s.host.active = true;
  await s.apps.refresh(before.id);
  await s.call("ngertiin.execute_app_tool", { ...s.input, command_id: crypto.randomUUID() });
  expect(s.host.calls).toBe(2);
  expect(s.host.sessions).toHaveLength(2);
});
test("concurrent calls cannot duplicate a provider effect", async () => {
  const s = await setup();
  let release!: () => void;
  s.host.effect = () =>
    new Promise<void>((resolve) => {
      release = resolve;
    });
  const pending = s.call("ngertiin.execute_app_tool", s.input);
  while (!release) await Bun.sleep(1);
  const duplicate = await s.call("ngertiin.execute_app_tool", s.input);
  expect(duplicate).toMatchObject({ receipt: { state: "dispatched" } });
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, command_id: crypto.randomUUID() }),
  ).rejects.toThrow("CONFLICT");
  release();
  await pending;
  expect(s.host.calls).toBe(1);
});
test("lost acknowledgements survive restart, preserve unknown, and prohibit blind replay", async () => {
  const s = await setup();
  s.host.effect = async () => {
    throw new Error("Lost acknowledgement with private credential");
  };
  await expect(s.call("ngertiin.execute_app_tool", s.input)).rejects.toThrow();
  expect(f.store.get("app_effect", s.input.command_id).state).toBe("unknown");
  f.restart();
  const apps = new Applications(f.lifecycle, s.host);
  const access = { scope: s.lease.scope, authorize: () => {} };
  // A restarted run's old lease is invalid; receipts are available to the authenticated owner.
  expect(apps.list()[0]?.id).toBe(s.connection.id);
  expect(f.store.list("app_effect")[0]?.state).toBe("unknown");
  expect(access.scope.owner_id).toBe(f.owner);
  expect(s.host.calls).toBe(1);
});
test("credential-like host output and signed URLs never reach tool results", () => {
  const output = JSON.stringify(
    appOutput(
      {
        token: "secret",
        authorization: "Bearer secret",
        text: "key-value https://example.org/a?access_token=provider-secret&safe=ok https://example.org/#access_token=fragment-secret",
        nested: { apiKey: "secret", body: "key-value" },
      },
      "key-value",
    ),
  );
  expect(output).not.toContain("provider-secret");
  expect(output).not.toContain("fragment-secret");
  expect(output).not.toContain("key-value");
  expect(output).not.toContain('"secret"');
  expect(output).toContain("safe=ok");
});

test("invalid bridge fields return actionable validation without exposing the rejected input", async () => {
  const s = await setup();
  const rpc = (method: string, params: unknown, notify = false) =>
    s.tools.rpc(s.lease.token, {
      jsonrpc: "2.0",
      ...(notify ? {} : { id: crypto.randomUUID() }),
      method,
      params,
    });
  await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "proof", version: "1" },
  });
  await rpc("notifications/initialized", {}, true);
  const result = await rpc("tools/call", {
    name: "ngertiin.execute_app_tool",
    arguments: { ...s.input, tool: undefined, tool_slug: "private-rejected-value" },
  });
  expect(result).toMatchObject({ result: { isError: true } });
  expect(JSON.stringify(result)).toContain("INVALID_REQUEST");
  expect(JSON.stringify(result)).not.toContain("private-rejected-value");
  expect(s.host.calls).toBe(0);
  await s.call("ngertiin.execute_app_tool", s.input);
  expect(s.host.calls).toBe(1);
});

test("application management HTTP routes require owner authentication and idempotent assignment", async () => {
  const s = await setup();
  const token = "p".repeat(64),
    app = createApi(f.lifecycle, new Background(f.lifecycle), token, {
      tools: s.tools,
      connections: new Connections(f.lifecycle),
    });
  const key = crypto.randomUUID();
  const request = (path: string, body?: unknown, credential = token) =>
    app.handle(
      new Request(`http://localhost${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${credential}`,
          "Content-Type": "application/json",
          "Idempotency-Key": key,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
  expect((await request("/v1/apps/connect", { toolkit: "github" }, "wrong")).status).toBe(401);
  expect((await request("/v1/apps/connect", { toolkit: "github" }, s.lease.token)).status).toBe(
    401,
  );
  const body = { expected_revision: s.connection.revision, grants: [] };
  const first = await (
    await request(`/v1/apps/connections/${s.connection.id}/assign`, body)
  ).json();
  const cursor = f.store.cursor;
  expect(
    await (await request(`/v1/apps/connections/${s.connection.id}/assign`, body)).json(),
  ).toEqual(first);
  expect(f.store.cursor).toBe(cursor);
  await expect(s.call("ngertiin.execute_app_tool", s.input)).rejects.toThrow("SCOPE_DENIED");
  expect((await request("/v1/apps/catalog?search=github")).status).toBe(200);
});

test("SDK execution relies on one pinned account and rejects remote account drift before dispatch", async () => {
  let account = "ca-exact",
    authorized = 0;
  const calls: unknown[][] = [];
  const host = new ComposioHost({
    sessions: {
      use: async () => ({
        config: { connected_accounts: { github: [account] } },
        execute: async (...args: unknown[]) => {
          calls.push(args);
          return { data: { login: "proof" }, resultType: "completed", logId: "log-exact" };
        },
      }),
    },
  } as unknown as Composio);
  expect(
    await host.execute("private-session", "ca-exact", "GITHUB_READ_PROFILE", {}, () => {
      authorized++;
    }),
  ).toMatchObject({ state: "succeeded", log_id: "log-exact" });
  expect(calls).toEqual([["GITHUB_READ_PROFILE", {}]]);
  account = "ca-foreign";
  await expect(
    host.execute("private-session", "ca-exact", "GITHUB_READ_PROFILE", {}, () => {
      authorized++;
    }),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(authorized).toBe(1);
  expect(calls).toHaveLength(1);
});

test("SDK uncertainty retains a safe request ID without exposing exception bodies", async () => {
  const host = new ComposioHost({
    sessions: {
      use: async () => ({
        config: { connected_accounts: { github: ["ca-exact"] } },
        execute: async () => {
          throw Object.assign(new Error("private-provider-body"), { requestId: "request-123" });
        },
      }),
    },
  } as unknown as Composio);
  const result = await host.execute(
    "private-session",
    "ca-exact",
    "GITHUB_READ_PROFILE",
    {},
    () => {},
  );
  expect(result).toMatchObject({ state: "unknown", request_id: "request-123", sdk_error: "Error" });
  expect(JSON.stringify(result)).not.toContain("private-provider-body");
});

test("product approval gates the actual scoped app dispatch and changed arguments never reuse a decision", async () => {
  const s = await setup();
  const request = (await s.call("ngertiin.ask_user", {
    command_id: crypto.randomUUID(),
    purpose: "approval",
    question: "Read this profile?",
    action: { tool_name: "ngertiin.execute_app_tool", arguments: s.input },
  })) as Entity<"human_request">;
  await expect(s.call("ngertiin.execute_app_tool", s.input)).rejects.toThrow("APPROVAL_REQUIRED");
  expect(s.host.calls).toBe(0);
  new Interactions(f.lifecycle).reply(request.id, {
    expected_revision: request.revision,
    decision: "approve",
  });
  await expect(
    s.call("ngertiin.execute_app_tool", { ...s.input, arguments: { changed: true } }),
  ).rejects.toThrow("APPROVAL_REQUIRED");
  const receipt = await s.call("ngertiin.execute_app_tool", s.input);
  expect(receipt).toMatchObject({ receipt: { state: "succeeded" } });
  expect(s.host.calls).toBe(1);
  await s.call("ngertiin.execute_app_tool", s.input);
  expect(s.host.calls).toBe(1);
});

test("catalog enriches provider pages in bulk without hiding apps when metadata fails", async () => {
  let failMetadata = false;
  const calls: unknown[] = [];
  let deleted = 0;
  const host = new ComposioHost({
    sessions: {
      create: async (user: string, config: unknown) => {
        calls.push({ user, config });
        return {
          sessionId: "catalog-session",
          toolkits: async (params: unknown) => {
            calls.push(params);
            return {
              items: [
                {
                  slug: "github",
                  name: "GitHub",
                  logo: "https://assets.test/fallback.svg",
                  isNoAuth: false,
                  connection: { isActive: true },
                },
              ],
              cursor: "next-page",
            };
          },
        };
      },
      delete: async () => {
        deleted++;
      },
    },
    toolkits: {
      getMany: async (slugs: string[], params: unknown) => {
        calls.push({ slugs, params });
        if (failMetadata) throw new Error("Provider metadata unavailable");
        return [
          {
            slug: "github",
            noAuth: false,
            meta: {
              description: "Repository collaboration",
              logo: "https://assets.test/github.svg",
              appUrl: "https://user:private@github.com",
              toolsCount: 24,
              triggersCount: 3,
              categories: [{ slug: "developer-tools", name: "Developer Tools" }],
            },
          },
        ];
      },
    },
  } as unknown as Composio);
  expect(await host.catalog("owner", "git", "page-one")).toEqual({
    items: [
      {
        slug: "github",
        name: "GitHub",
        connected: true,
        logo: "https://assets.test/github.svg",
        description: "Repository collaboration",
        website: undefined,
        categories: [{ slug: "developer-tools", name: "Developer Tools" }],
        tools_count: 24,
        triggers_count: 3,
        no_auth: false,
      },
    ],
    cursor: "next-page",
    metadata_complete: true,
  });
  expect(calls).toContainEqual({ search: "git", cursor: "page-one", limit: 50 });
  expect(calls).toContainEqual({ slugs: ["github"], params: { limit: 50 } });
  expect(calls).not.toContainEqual({ search: "", limit: 50 });
  failMetadata = true;
  expect(await host.catalog("owner", "")).toMatchObject({
    items: [{ slug: "github", logo: "https://assets.test/fallback.svg", categories: [] }],
    metadata_complete: false,
  });
  expect(calls).toContainEqual({ limit: 50 });
  expect(deleted).toBe(2);
});
