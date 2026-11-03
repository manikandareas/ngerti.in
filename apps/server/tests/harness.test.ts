import { afterEach, expect, test } from "bun:test";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { Groups } from "../src/groups/service";
import {
  detectHarness,
  type HarnessId,
  manifests,
  versionState,
} from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import type { HarnessAdapter, HarnessClient } from "../src/harness/client";
import { Connections } from "../src/harness/connections";
import { CredentialContexts, Diagnostics, Redactor } from "../src/harness/context";
import { HarnessError, type NativeEvent, unknownCapabilities } from "../src/harness/contracts";
import { OwnedProcess } from "../src/harness/process";
import { ProductTools } from "../src/harness/tools";
import { RunControls } from "../src/run-controls";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
let broker: HarnessBroker | undefined;
afterEach(async () => {
  await broker?.close();
  broker = undefined;
  f?.close();
});
const caps = {
  ...unknownCapabilities,
  product_tools: "supported",
  settings: "supported",
  resume: "supported",
} as const;
function setup() {
  f = fixture();
  return new Connections(f.lifecycle);
}
function assign(connection: Entity<"connection">, name = "Researcher", model = "model-a") {
  const agent = f.lifecycle.create("agent", {
    name,
    harness: connection.harness,
    connection_id: connection.id,
    model_id: model,
    reasoning: "high",
  }) as Entity<"agent">;
  const thread = f.lifecycle.create("thread", {
    type: "dm",
    member_agent_ids: [agent.id],
  }) as Entity<"thread">;
  return { agent, thread };
}
function client(overrides: Partial<HarnessClient> = {}): HarnessClient {
  let identity: { native_session_id: string } = { native_session_id: crypto.randomUUID() };
  return {
    async inspect() {
      return {
        login: "authenticated",
        account_id: "account-a",
        auth_method: "native_login",
        billing_source: "subscription",
        capabilities: { ...caps },
      };
    },
    async discoverModels() {
      return [
        { id: "model-a", reasoning: ["high"] },
        { id: "model-b", reasoning: ["high"] },
      ];
    },
    async start() {
      return identity;
    },
    async resume(previous) {
      identity = previous;
      return identity;
    },
    async settings() {},
    async close() {},
    async stop() {
      return { confirmed: false };
    },
    async prompt(request) {
      const runId = crypto.randomUUID();
      request.onEvent({
        type: "accepted",
        native_session_id: request.identity.native_session_id,
        native_run_id: runId,
      });
      const value = await tools.call(
        request.tools.token,
        request.tools.scope,
        "ngertiin.read_run_context",
        {},
      );
      expect(value).toMatchObject({
        agent_id: request.tools.scope.agent_id,
        input: "Please inspect this project.",
      });
      return {
        status: "succeeded",
        native_session_id: request.identity.native_session_id,
        native_run_id: runId,
      };
    },
    ...overrides,
  };
}
// Tools are retained alongside each fixture so adapter callbacks use the exact server-issued leases.
let tools: ProductTools;
function makeBroker(
  adapters: Partial<Record<HarnessId, HarnessAdapter>>,
  publish?: (run: string, event: NativeEvent) => void,
  readSecret?: (ref: string) => string,
) {
  tools = new ProductTools(f.lifecycle);
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir, readSecret),
    tools,
    adapters,
    async (harness) => ({
      harness,
      state: "supported",
      version: manifests[harness].minimum_version,
      executable: Bun.which("bun"),
      manifest: manifests[harness],
    }),
    publish,
  );
  return broker;
}
function adapter(
  harness: HarnessId,
  factory: HarnessAdapter["connect"] = async () => client(),
): HarnessAdapter {
  return { harness, connect: factory };
}

test("DM prewarm performs no inference and reuses skills, transport and presentation-only revisions", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let opens = 0;
  let skills = 0;
  let prompts = 0;
  const native = makeBroker({
    codex: adapter("codex", async () => {
      opens++;
      return client({
        async skills() {
          skills++;
          return [];
        },
        async prompt(request) {
          prompts++;
          request.onEvent({
            type: "accepted",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          });
          return {
            status: "succeeded",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          };
        },
      });
    }),
  });
  expect(native.prewarm(lane.thread.id, lane.agent.id).state).toBe("preparing");
  await native.openSession(lane.thread.id, lane.agent.id);
  expect(f.store.list("run")).toHaveLength(0);
  expect(prompts).toBe(0);
  expect(native.prewarm(lane.thread.id, lane.agent.id).state).toBe("ready");
  await dispatch(lane, native);
  f.lifecycle.updateAgent(lane.agent.id, {
    expected_revision: lane.agent.revision,
    changes: { avatar: "https://example.test/avatar.png" },
  });
  await dispatch(lane, native);
  expect(opens).toBe(1);
  expect(skills).toBe(1);
  expect(prompts).toBe(2);
});
async function dispatch(lane: ReturnType<typeof assign>, native = broker) {
  if (!native) throw new Error("Broker is required.");
  await native.openSession(lane.thread.id, lane.agent.id);
  const receipt = f.lifecycle.admit({
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Please inspect this project.",
  });
  const bg = new Background(f.lifecycle, native.executors());
  bg.tick();
  await bg.idle();
  return { run: f.store.get("run", receipt.run.id), bg };
}

test("minimum policies reject below-floor and prerelease versions for both harnesses", () => {
  for (const [harness, below] of [
    ["codex", "0.164.9"],
    ["muse", "1.4.11"],
  ] as const) {
    const minimum = manifests[harness].minimum_version;
    expect(versionState(below, minimum).state).toBe("too_old");
    expect(versionState(minimum, minimum).state).toBe("supported");
    expect(versionState(`${minimum}-alpha.1`, minimum).state).toBe("unknown");
    expect(versionState("unreadable", minimum).state).toBe("unknown");
  }
  expect(versionState("Muse 1.4.12-R2.3", "1.4.12")).toEqual({
    state: "supported",
    version: "1.4.12-R2.3",
  });
  expect(versionState("Muse Code 1.4.14 (1.4.14-R7309.1)", manifests.muse.minimum_version)).toEqual(
    { state: "supported", version: "1.4.14-R7309.1" },
  );
  expect(versionState("Muse Code 1.4.14 (1.4.13-R1.1)", manifests.muse.minimum_version).state).toBe(
    "unknown",
  );
  expect(versionState("1.4.13", manifests.muse.minimum_version).state).toBe("too_old");
});

test("real executable probes distinguish supported, old, missing, unknown and failed without returning diagnostics", async () => {
  setup();
  for (const [version, state] of [
    ["0.165.0", "supported"],
    ["0.164.9", "too_old"],
    ["secret-example", "unknown"],
  ] as const) {
    const file = join(f.dir, `codex-${state}`);
    writeFileSync(file, `#!/bin/sh\nprintf '%s\\n' '${version}'\n`, { mode: 0o700 });
    const result = await detectHarness("codex", file);
    expect(result.state).toBe(state);
    expect(JSON.stringify(result)).not.toContain("secret-example");
  }
  const failed = join(f.dir, "failed");
  writeFileSync(failed, "#!/bin/sh\necho secret-example >&2\nexit 1\n", { mode: 0o700 });
  expect((await detectHarness("muse", failed)).state).toBe("probe_failed");
  expect((await detectHarness("muse", join(f.dir, "missing"))).state).toBe("missing");
});

test("connection API persists secret references and independent evidence states across restart", async () => {
  setup();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64));
  const key = crypto.randomUUID();
  const reference = crypto.randomUUID();
  const request = () =>
    app.handle(
      new Request("http://localhost/v1/connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"x".repeat(64)}`,
          "Idempotency-Key": key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          harness: "codex",
          authentication: {
            method: "api_key",
            billing_source: "api_key",
            credential_ref: reference,
          },
        }),
      }),
    );
  const response = await request();
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(await (await request()).json()).toEqual(result);
  expect(result).toMatchObject({
    login: "unknown",
    discovery: "not_attempted",
    inference: "not_attempted",
    account_id: null,
    capabilities: unknownCapabilities,
  });
  f.restart();
  expect(f.store.get("connection", result.id)).toEqual(result);
});

test("API rejects billing mismatches, secret values and caller-supplied owner identity", async () => {
  setup();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64));
  for (const extra of [
    { authentication: { method: "native_login", billing_source: "api_key" } },
    { secret: "private-key" },
    { owner_id: crypto.randomUUID() },
  ]) {
    const response = await app.handle(
      new Request("http://localhost/v1/connections", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${"x".repeat(64)}`,
          "Idempotency-Key": crypto.randomUUID(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          harness: "codex",
          authentication: { method: "native_login", billing_source: "subscription" },
          ...extra,
        }),
      }),
    );
    expect(response.status).toBe(422);
    expect(await response.text()).not.toContain("private-key");
  }
});

test("isolated native-login environment strips inherited billing keys; selected keys are connection-specific", () => {
  const connections = setup();
  let reads = 0;
  const contexts = new CredentialContexts(f.dir, (ref) => {
    reads++;
    return ref === "a" ? "key-a" : "key-b";
  });
  const plan = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const savedOpenAI = process.env.OPENAI_API_KEY;
  const savedMeta = process.env.META_API_KEY;
  process.env.OPENAI_API_KEY = "ambient-key";
  process.env.META_API_KEY = "ambient-meta";
  try {
    const a = contexts.create(plan);
    const b = contexts.create(
      connections.create({
        harness: "muse",
        authentication: { method: "native_login", billing_source: "subscription" },
      }),
    );
    expect(a.env.OPENAI_API_KEY).toBeUndefined();
    expect(b.env.META_API_KEY).toBeUndefined();
    expect(reads).toBe(0);
    expect(a.env.HOME).not.toBe(b.env.HOME);
    expect(a.env.CODEX_HOME).not.toBe(b.env.CODEX_HOME);
    const selected = contexts.create(
      connections.create({
        harness: "muse",
        authentication: {
          method: "api_key",
          billing_source: "api_key",
          credential_ref: crypto.randomUUID(),
        },
      }),
    );
    expect(selected.env.META_API_KEY).toBe("key-b");
    expect(selected.env.OPENAI_API_KEY).toBeUndefined();
    expect(reads).toBe(1);
  } finally {
    if (savedOpenAI === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = savedOpenAI;
    if (savedMeta === undefined) delete process.env.META_API_KEY;
    else process.env.META_API_KEY = savedMeta;
  }
});

test("credential files fail closed on missing or public permissions", () => {
  const connections = setup();
  const reference = crypto.randomUUID();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "api_key", billing_source: "api_key", credential_ref: reference },
  });
  const contexts = new CredentialContexts(f.dir);
  expect(() => contexts.create(connection)).toThrow("CREDENTIAL_MISSING");
  mkdirSync(join(f.dir, "credentials"));
  const file = join(f.dir, "credentials", reference);
  writeFileSync(file, "selected-key", { mode: 0o644 });
  expect(() => contexts.create(connection)).toThrow("CREDENTIAL_MISSING");
  chmodSync(file, 0o600);
  expect(contexts.create(connection).env.OPENAI_API_KEY).toBe("selected-key");
});

test("diagnostic redaction buffers split UTF-8/secret records and discards oversized fragments", () => {
  const redactor = new Redactor();
  redactor.add("private-💡-key");
  const lines: string[] = [];
  const diagnostics = new Diagnostics(redactor, (line) => lines.push(line));
  const bytes = new TextEncoder().encode("error private-💡-key\nBearer abc\n");
  for (const byte of bytes) diagnostics.push(new Uint8Array([byte]));
  diagnostics.push(new TextEncoder().encode("x".repeat(20_000)));
  diagnostics.push(new TextEncoder().encode("secret\nclean"));
  diagnostics.flush();
  expect(lines).toEqual(["error [REDACTED]", "Bearer [REDACTED]", "clean"]);
});

test("owned native processes run concurrently with separate environment and redact fragmented stderr", async () => {
  const connections = setup();
  const a = new CredentialContexts(f.dir, () => "selected-key").create(
    connections.create({
      harness: "codex",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    }),
  );
  const b = new CredentialContexts(f.dir).create(
    connections.create({
      harness: "muse",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  const lines: string[] = [];
  const first = new OwnedProcess(
    "/bin/sh",
    ["-c", 'printf "%s" "$CODEX_HOME"; printf "selected-" >&2; printf "key\\n" >&2; read value'],
    a,
    (line) => lines.push(line),
  );
  const second = new OwnedProcess("/bin/sh", ["-c", 'printf "%s" "$CODEX_HOME"; read value'], b);
  expect(first.child.pid).not.toBe(second.child.pid);
  try {
    first.child.stdin.end();
    second.child.stdin.end();
    expect(await new Response(first.child.stdout).text()).toBe(a.env.CODEX_HOME);
    expect(await new Response(second.child.stdout).text()).toBe(b.env.CODEX_HOME);
  } finally {
    await Promise.all([first.close(), second.close()]);
  }
  expect(lines).toEqual(["[REDACTED]"]);
});

test("two harnesses, accounts, models and agents execute concurrently through scoped product tools", async () => {
  const connections = setup();
  const observed: string[][] = [];
  const make = (harness: HarnessId, account: string) =>
    adapter(harness, async (context) => {
      observed.push([harness, context.connection_id, context.agent_id, context.env.HOME]);
      return client({
        async inspect() {
          return {
            login: "authenticated",
            account_id: account,
            auth_method: "native_login",
            billing_source: "subscription",
            capabilities: { ...caps },
          };
        },
        async settings(_identity, selected) {
          expect(selected.model_id).toBe(harness === "codex" ? "model-a" : "model-b");
        },
        async prompt(request) {
          request.onEvent({
            type: "accepted",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          });
          const result = await tools.call(
            request.tools.token,
            request.tools.scope,
            "ngertiin.read_run_context",
            {},
          );
          expect(result).toMatchObject({ agent_id: context.agent_id, run_id: request.run_id });
          return {
            status: "succeeded",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          };
        },
      });
    });
  const native = makeBroker({ codex: make("codex", "account-a"), muse: make("muse", "account-b") });
  const lanes = (["codex", "muse"] as const).map((harness) =>
    assign(
      connections.create({
        harness,
        authentication: { method: "native_login", billing_source: "subscription" },
      }),
      harness,
      harness === "codex" ? "model-a" : "model-b",
    ),
  );
  await Promise.all(lanes.map((lane) => native.openSession(lane.thread.id, lane.agent.id)));
  for (const lane of lanes)
    f.lifecycle.admit({
      agent_id: lane.agent.id,
      thread_id: lane.thread.id,
      text: "Please inspect this project.",
    });
  const bg = new Background(f.lifecycle, native.executors());
  bg.tick();
  expect(bg.activeCount).toBeLessThanOrEqual(2);
  await bg.idle();
  expect(f.store.list("run").map((run) => run.status)).toEqual(["succeeded", "succeeded"]);
  expect(new Set(observed.map((row) => row[3])).size).toBe(2);
  expect(
    f.store
      .list("connection")
      .filter((item) => item.id !== f.store.get("agent", f.agent.id).connection_id)
      .map((item) => [item.account_id, item.login, item.discovery, item.inference]),
  ).toEqual([
    ["account-a", "authenticated", "succeeded", "succeeded"],
    ["account-b", "authenticated", "succeeded", "succeeded"],
  ]);
});

test("login, catalog failure and completed inference remain separate observations", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async discoverModels() {
          throw new Error("secret-example");
        },
      }),
    ),
  });
  await expect(native.openSession(lane.thread.id, lane.agent.id)).rejects.toThrow("PROTOCOL_ERROR");
  expect(connections.get(connection.id)).toMatchObject({
    login: "authenticated",
    discovery: "failed",
    inference: "not_attempted",
  });
});

test("native account cannot silently switch selected authentication or billing", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  let prompts = 0;
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async inspect() {
          return {
            login: "authenticated",
            account_id: "key-account",
            auth_method: "api_key",
            billing_source: "api_key",
            capabilities: { ...caps },
          };
        },
        async prompt() {
          prompts++;
        },
      }),
    ),
  });
  await expect(native.openSession(lane.thread.id, lane.agent.id)).rejects.toThrow(
    "BILLING_MISMATCH",
  );
  expect(prompts).toBe(0);
  expect(connections.get(connection.id)).toMatchObject({
    login: "rejected",
    effective_billing_source: "unknown",
  });
});

test("unknown resume never starts a replacement session", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  f.lifecycle.bind(lane.thread.id, lane.agent.id, "native-existing");
  let starts = 0;
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async inspect() {
          return {
            login: "authenticated",
            account_id: "account",
            auth_method: "native_login",
            billing_source: "subscription",
            capabilities: { ...caps, resume: "unknown" },
          };
        },
        async start() {
          starts++;
          return { native_session_id: "replacement" };
        },
      }),
    ),
  });
  await expect(native.openSession(lane.thread.id, lane.agent.id)).rejects.toThrow(
    "CAPABILITY_UNKNOWN",
  );
  expect(starts).toBe(0);
});

test("concurrent opens share one lane and separate sessions for two agents on one connection", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const a = assign(connection);
  const b = assign(connection, "Writer", "model-b");
  let clients = 0;
  const native = makeBroker({
    codex: adapter("codex", async () => {
      clients++;
      return client();
    }),
  });
  const [first, repeated, other] = await Promise.all([
    native.openSession(a.thread.id, a.agent.id),
    native.openSession(a.thread.id, a.agent.id),
    native.openSession(b.thread.id, b.agent.id),
  ]);
  expect(first.id).toBe(repeated.id);
  expect(first.native_session_id).not.toBe(other.native_session_id);
  expect(clients).toBe(2);
});

test("grant revocation while native initialization waits prevents session binding", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  let release: () => void = () => {};
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async start() {
          started();
          await waiting;
          return { native_session_id: "late-session" };
        },
      }),
    ),
  });
  const pending = native.openSession(lane.thread.id, lane.agent.id);
  await entered;
  connections.revoke(connection.id);
  release();
  await expect(pending).rejects.toThrow("SCOPE_DENIED");
  expect(f.store.list("binding")).toHaveLength(0);
});

test("scope, private resources, current grants and terminal runs are rechecked on each tool call", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  const native = makeBroker({ codex: adapter("codex") });
  await native.openSession(lane.thread.id, lane.agent.id);
  const { run: admitted } = f.lifecycle.admit({
    agent_id: lane.agent.id,
    thread_id: lane.thread.id,
    text: "Please inspect this project.",
  });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run) throw new Error("Missing run.");
  const lease = tools.issue(run);
  await expect(
    tools.call(
      lease.token,
      { ...lease.scope, agent_id: f.agent.id },
      "ngertiin.read_run_context",
      {},
    ),
  ).rejects.toThrow("SCOPE_DENIED");
  const foreign = f.lifecycle.create("artifact", {
    agent_id: f.agent.id,
    thread_id: f.thread.id,
    media_type: "text/plain",
    sha256: "a".repeat(64),
    storage_key: "private",
  });
  tools.register("ngertiin.read_artifact_fixture", {
    schema: z.strictObject({ id: z.uuid() }),
    resources: (input) => [{ kind: "artifact", id: (input as { id: string }).id }],
    execute: () => "must-not-run",
  });
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_artifact_fixture", { id: foreign.id }),
  ).rejects.toThrow("SCOPE_DENIED");
  connections.revoke(connection.id);
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_run_context", {}),
  ).rejects.toThrow("SCOPE_DENIED");
  f.lifecycle.settle(admitted.id, run.dispatch_token as string, "failed");
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_run_context", {}),
  ).rejects.toThrow("STALE_DISPATCH");
  lease.revoke();
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_run_context", {}),
  ).rejects.toThrow("UNAUTHORIZED");
});

test("MCP HTTP round trip uses scoped leases and refuses the installation token", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  const native = makeBroker({ codex: adapter("codex") });
  await native.openSession(lane.thread.id, lane.agent.id);
  f.lifecycle.admit({
    agent_id: lane.agent.id,
    thread_id: lane.thread.id,
    text: "Private DM context",
  });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run) throw new Error("Missing run.");
  const lease = tools.issue(run);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64), {
    connections,
    tools,
  });
  async function rpc(token: string, method: string, params?: unknown) {
    return app.handle(
      new Request("http://localhost/v1/harness/tools", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      }),
    );
  }
  expect((await rpc("x".repeat(64), "tools/list")).status).toBe(401);
  expect(
    await (
      await rpc(lease.token, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "fixture", version: "1" },
      })
    ).json(),
  ).toMatchObject({ result: { capabilities: { tools: {} } } });
  await tools.rpc(lease.token, { jsonrpc: "2.0", method: "notifications/initialized" });
  expect(await (await rpc(lease.token, "tools/list")).json()).toMatchObject({
    result: {
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "ngertiin.read_run_context" }),
      ]),
    },
  });
  expect(
    await (
      await rpc(lease.token, "tools/call", { name: "ngertiin.read_run_context", arguments: {} })
    ).json(),
  ).toMatchObject({
    result: {
      isError: false,
      structuredContent: { result: { input: "Private DM context", agent_id: lane.agent.id } },
    },
  });
  lease.revoke();
  expect((await rpc(lease.token, "tools/list")).status).toBe(401);
});

test("grant change between settings and prompt blocks final dispatch", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  let prompts = 0;
  makeBroker({
    codex: adapter("codex", async () =>
      client({
        async settings() {
          connections.revoke(connection.id);
        },
        async prompt() {
          prompts++;
        },
      }),
    ),
  });
  const { run } = await dispatch(lane);
  expect(run.status).toBe("failed");
  expect(prompts).toBe(0);
  expect(connections.get(connection.id).inference).toBe("not_attempted");
});

test("native acceptance followed by failure becomes unknown and blocks retry", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let prompts = 0;
  makeBroker({
    codex: adapter("codex", async () =>
      client({
        async prompt(request) {
          prompts++;
          request.onEvent({
            type: "accepted",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          });
          throw new Error("secret-example");
        },
      }),
    ),
  });
  const { run, bg } = await dispatch(lane);
  bg.tick();
  await bg.idle();
  expect(run.status).toBe("unknown");
  expect(prompts).toBe(1);
  expect(JSON.stringify(f.store.events(0))).not.toContain("secret-example");
});

test("native rejection is failed; malformed terminal identity remains unknown", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  makeBroker({
    codex: adapter("codex", async () =>
      client({
        async prompt() {
          throw new HarnessError("NATIVE_REJECTED");
        },
      }),
    ),
  });
  expect((await dispatch(lane)).run.status).toBe("failed");
  await broker?.close();
  makeBroker({
    codex: adapter("codex", async () =>
      client({
        async prompt() {
          return { status: "succeeded", native_session_id: "foreign", native_run_id: null };
        },
      }),
    ),
  });
  expect((await dispatch(lane)).run.status).toBe("unknown");
});

test("native stop receipt confirms cancellation", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let entered: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async prompt(request) {
          request.onEvent({
            type: "accepted",
            native_session_id: request.identity.native_session_id,
            native_run_id: request.run_id,
          });
          entered();
          return new Promise(() => {});
        },
        async stop() {
          return { confirmed: true };
        },
      }),
    ),
  });
  await native.openSession(lane.thread.id, lane.agent.id);
  const receipt = f.lifecycle.admit({
    agent_id: lane.agent.id,
    thread_id: lane.thread.id,
    text: "Please inspect this project.",
  });
  const bg = new Background(f.lifecycle, native.executors());
  bg.tick();
  await ready;
  await bg.stop();
  expect(f.store.get("run", receipt.run.id)).toMatchObject({
    status: "cancelled",
    cancellation: "confirmed",
  });
});

test("native text redaction covers secrets split across events", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    }),
  );
  const published: NativeEvent[] = [];
  makeBroker(
    {
      codex: adapter("codex", async () =>
        client({
          async inspect() {
            return {
              login: "authenticated",
              account_id: "key-account",
              auth_method: "api_key",
              billing_source: "api_key",
              capabilities: { ...caps },
            };
          },
          async prompt(request) {
            request.onEvent({
              type: "accepted",
              native_session_id: request.identity.native_session_id,
              native_run_id: request.run_id,
            });
            request.onEvent({ type: "text", text: "selected-" });
            request.onEvent({ type: "text", text: "key" });
            return {
              status: "succeeded",
              native_session_id: request.identity.native_session_id,
              native_run_id: request.run_id,
            };
          },
        }),
      ),
    },
    (_run, event) => published.push(event),
    () => "selected-key",
  );
  expect((await dispatch(lane)).run.status).toBe("succeeded");
  expect(published.at(-1)).toEqual({ type: "text", text: "[REDACTED]" });
});

test("API exposes host detection states for both manifests and authenticated revocation", async () => {
  const connections = setup();
  const leaseTools = new ProductTools(f.lifecycle);
  for (const state of ["supported", "too_old", "missing", "unknown", "probe_failed"] as const) {
    const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64), {
      connections,
      tools: leaseTools,
      detect: async (harness) => ({
        harness,
        manifest: manifests[harness],
        state,
        version: null,
        executable: null,
      }),
    });
    const response = await app.handle(
      new Request("http://localhost/v1/harnesses", {
        headers: { Authorization: `Bearer ${"x".repeat(64)}` },
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).map((item: { state: string }) => item.state)).toEqual([
      state,
      state,
    ]);
  }
});

test("tool capability revocation during an asynchronous handler blocks its final effect", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  const native = makeBroker({ codex: adapter("codex") });
  await native.openSession(lane.thread.id, lane.agent.id);
  f.lifecycle.admit({ agent_id: lane.agent.id, thread_id: lane.thread.id, text: "Inspect" });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run) throw new Error("Missing run.");
  const lease = tools.issue(run);
  let effects = 0;
  tools.register("ngertiin.revoke_fixture", {
    schema: z.strictObject({}),
    resources: () => [],
    async execute(_input, access) {
      const current = connections.get(connection.id);
      connections.update(current, {
        capabilities: { ...current.capabilities, product_tools: "unsupported" },
      });
      await Promise.resolve();
      access.authorize();
      effects++;
      return {};
    },
  });
  await expect(tools.call(lease.token, lease.scope, "ngertiin.revoke_fixture", {})).rejects.toThrow(
    "SCOPE_DENIED",
  );
  expect(effects).toBe(0);
});

test("broker shutdown fences late completion and text after an unconfirmed native stop", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let finish: () => void = () => {};
  let entered: () => void = () => {};
  const ready = new Promise<void>((resolve) => {
    entered = resolve;
  });
  const events: NativeEvent[] = [];
  const native = makeBroker(
    {
      codex: adapter("codex", async () =>
        client({
          async prompt(request) {
            request.onEvent({
              type: "accepted",
              native_session_id: request.identity.native_session_id,
              native_run_id: request.run_id,
            });
            entered();
            await new Promise<void>((resolve) => {
              finish = resolve;
            });
            request.onEvent({ type: "text", text: "late" });
            return {
              status: "succeeded",
              native_session_id: request.identity.native_session_id,
              native_run_id: request.run_id,
            };
          },
        }),
      ),
    },
    (_run, event) => events.push(event),
  );
  await native.openSession(lane.thread.id, lane.agent.id);
  const receipt = f.lifecycle.admit({
    agent_id: lane.agent.id,
    thread_id: lane.thread.id,
    text: "Inspect",
  });
  const bg = new Background(f.lifecycle, native.executors());
  bg.tick();
  await ready;
  await bg.stop(1);
  await native.close();
  const cursor = f.store.events(0).at(-1)?.cursor;
  finish();
  await bg.idle();
  expect(f.store.get("run", receipt.run.id)).toMatchObject({
    status: "unknown",
    native_run_id: receipt.run.id,
  });
  expect(f.store.events(0).at(-1)?.cursor).toBe(cursor);
  expect(events.some((event) => event.type === "text")).toBe(false);
});

test("MCP transport validates origin/protocol, initialization and notification responses", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  const native = makeBroker({ codex: adapter("codex") });
  await native.openSession(lane.thread.id, lane.agent.id);
  f.lifecycle.admit({ agent_id: lane.agent.id, thread_id: lane.thread.id, text: "Inspect" });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run) throw new Error("Missing run.");
  const lease = tools.issue(run);
  const app = createApi(f.lifecycle, new Background(f.lifecycle), "x".repeat(64), {
    connections,
    tools,
  });
  const request = (body: unknown, headers = {}, method = "POST") =>
    app.handle(
      new Request("http://localhost/v1/harness/tools", {
        method,
        headers: {
          Authorization: `Bearer ${lease.token}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: method === "GET" ? undefined : JSON.stringify(body),
      }),
    );
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  expect((await request(list)).status).toBe(409);
  expect((await request(list, { Origin: "https://foreign.example" })).status).toBe(403);
  expect((await request(list, { "MCP-Protocol-Version": "unknown" })).status).toBe(400);
  expect((await request(null, {}, "GET")).status).toBe(405);
  expect(
    (
      await request({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "fixture", version: "1" },
        },
      })
    ).status,
  ).toBe(200);
  const notified = await request({ jsonrpc: "2.0", method: "notifications/initialized" });
  expect(notified.status).toBe(202);
  expect(await notified.text()).toBe("");
  expect((await request(list)).status).toBe(200);
});

test("native account change after session initialization cannot dispatch under the old connection", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let inspectCount = 0;
  let prompts = 0;
  makeBroker({
    codex: adapter("codex", async () =>
      client({
        async inspect() {
          return {
            login: "authenticated",
            account_id: ++inspectCount === 1 ? "account-a" : "account-b",
            auth_method: "native_login",
            billing_source: "subscription",
            capabilities: { ...caps },
          };
        },
        async prompt() {
          prompts++;
        },
      }),
    ),
  });
  expect((await dispatch(lane)).run.status).toBe("failed");
  expect(prompts).toBe(0);
});

test("a connection change starts a separate native session and retains the previous mapping", async () => {
  const connections = setup();
  const first = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(first);
  f.lifecycle.bind(lane.thread.id, lane.agent.id, "private-native-session");
  const second = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  f.store.put(
    { ...lane.agent, connection_id: second.id, revision: lane.agent.revision + 1 },
    lane.agent.revision,
  );
  let resumes = 0;
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async resume(identity) {
          resumes++;
          return identity;
        },
      }),
    ),
  });
  const binding = await native.openSession(lane.thread.id, lane.agent.id);
  expect(binding.connection_id).toBe(second.id);
  expect(f.store.list("binding").filter((item) => !item.active)).toHaveLength(1);
  expect(resumes).toBe(0);
});

test("version and executable failures cannot reach the adapter connect boundary", async () => {
  const connections = setup();
  let connects = 0;
  tools = new ProductTools(f.lifecycle);
  const cases = {
    missing: "EXECUTABLE_MISSING",
    too_old: "VERSION_TOO_OLD",
    unknown: "VERSION_UNKNOWN",
    probe_failed: "PROBE_FAILED",
  } as const;
  for (const harness of ["codex", "muse"] as const) {
    const lane = assign(
      connections.create({
        harness,
        authentication: { method: "native_login", billing_source: "subscription" },
      }),
    );
    for (const [state, code] of Object.entries(cases)) {
      const native = new HarnessBroker(
        f.lifecycle,
        new CredentialContexts(f.dir),
        tools,
        {
          [harness]: adapter(harness, async () => {
            connects++;
            return client();
          }),
        },
        async () => ({
          harness,
          state: state as keyof typeof cases,
          executable: null,
          version: null,
          manifest: manifests[harness],
        }),
      );
      await expect(native.openSession(lane.thread.id, lane.agent.id)).rejects.toThrow(code);
      await native.close();
    }
  }
  expect(connects).toBe(0);
});

test("protocol request and close deadlines bound an unresponsive client without fabricating login", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  tools = new ProductTools(f.lifecycle);
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir),
    tools,
    {
      codex: adapter("codex", async () =>
        client({
          async inspect() {
            return new Promise(() => {});
          },
          async close() {
            return new Promise(() => {});
          },
        }),
      ),
    },
    async () => ({
      harness: "codex",
      state: "supported",
      executable: "/fixture/codex",
      version: "0.165.0",
      manifest: manifests.codex,
    }),
    undefined,
    { request_ms: 5, close_ms: 5 },
  );
  await expect(broker.openSession(lane.thread.id, lane.agent.id)).rejects.toThrow(
    "SERVICE_UNAVAILABLE",
  );
  expect(connections.get(connection.id).login).toBe("unknown");
  expect(f.store.list("binding")).toHaveLength(0);
});

test("two simultaneous key connections on the same harness retain their selected accounts and models", async () => {
  const connections = setup();
  const references = [crypto.randomUUID(), crypto.randomUUID()];
  const lanes = references.map((credential_ref, index) =>
    assign(
      connections.create({
        harness: "codex",
        authentication: { method: "api_key", billing_source: "api_key", credential_ref },
      }),
      `Agent ${index}`,
      index === 0 ? "model-a" : "model-b",
    ),
  );
  const seen: string[] = [];
  const native = makeBroker(
    {
      codex: adapter("codex", async (context) => {
        const index = context.env.OPENAI_API_KEY === "secret-a" ? 0 : 1;
        seen.push(context.env.OPENAI_API_KEY);
        expect(context.connection_id).toBe(lanes[index].agent.connection_id as string);
        return client({
          async inspect() {
            return {
              login: "authenticated",
              account_id: `account-${index}`,
              auth_method: "api_key",
              billing_source: "api_key",
              capabilities: { ...caps },
            };
          },
          async settings(_identity, selected) {
            expect(selected.model_id).toBe(index === 0 ? "model-a" : "model-b");
          },
        });
      }),
    },
    undefined,
    (ref) => (ref === references[0] ? "secret-a" : "secret-b"),
  );
  await Promise.all(lanes.map((lane) => native.openSession(lane.thread.id, lane.agent.id)));
  for (const lane of lanes)
    f.lifecycle.admit({
      agent_id: lane.agent.id,
      thread_id: lane.thread.id,
      text: "Please inspect this project.",
    });
  const bg = new Background(f.lifecycle, native.executors());
  bg.tick();
  await bg.idle();
  expect(new Set(seen).size).toBe(2);
  expect(f.store.list("run").map((run) => run.status)).toEqual(["succeeded", "succeeded"]);
  expect(JSON.stringify(f.store.events(0))).not.toContain("secret-a");
  expect(JSON.stringify(f.store.events(0))).not.toContain("secret-b");
});

test("concurrent steering receipts send once and a lost acknowledgement never resends", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let calls = 0;
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async inspect() {
          return {
            login: "authenticated",
            account_id: "account-a",
            auth_method: "native_login",
            billing_source: "subscription",
            capabilities: { ...caps, steer: "supported" },
          };
        },
        async steer() {
          calls++;
          await Bun.sleep(5);
          throw new HarnessError("NATIVE_UNKNOWN", "unknown");
        },
      }),
    ),
  });
  await native.openSession(lane.thread.id, lane.agent.id);
  const active = f.lifecycle.admit({
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Inspect",
  });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing run.");
  f.lifecycle.started(run.id, run.dispatch_token, "native-turn");
  const queued = f.lifecycle.admit({
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Correction",
  });
  const controls = new RunControls(f.lifecycle);
  const control = controls.requestSteer(active.run.id, { queued_run_id: queued.run.id });
  const results = await Promise.all(
    Array.from({ length: 16 }, () => native.dispatchSteer(control.id)),
  );
  expect(results.every((item) => item.state === "unknown")).toBe(true);
  expect(calls).toBe(1);
  expect((await native.dispatchSteer(control.id)).state).toBe("unknown");
  expect(calls).toBe(1);
  expect(f.store.get("run", queued.run.id).delivery).toBe("unknown");
});

test("native receipt reads recheck revocation before committing recovered output", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  let ready: () => void = () => {};
  let release: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const native = makeBroker({
    codex: adapter("codex", async () =>
      client({
        async reconcile(identity, nativeRunId) {
          ready();
          await held;
          return {
            ...identity,
            native_run_id: nativeRunId,
            status: "succeeded",
            text: "Recovered output",
          };
        },
      }),
    ),
  });
  await native.openSession(lane.thread.id, lane.agent.id);
  f.lifecycle.admit({ thread_id: lane.thread.id, agent_id: lane.agent.id, text: "Inspect" });
  const run = f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing run.");
  f.lifecycle.started(run.id, run.dispatch_token, "native-turn");
  f.lifecycle.settle(run.id, run.dispatch_token, "unknown");
  const recovering = native.reconcile(run.id);
  await entered;
  connections.revoke(connection.id);
  release();
  await expect(recovering).rejects.toThrow("STALE_DISPATCH");
  expect(f.store.get("run", run.id).status).toBe("unknown");
  expect(f.store.answer(run.id)).toBeNull();
});

test("owner receipt inspection releases revoked group work without restoring its workspace or publishing its output", async () => {
  const connections = setup();
  const connection = connections.create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const lane = assign(connection);
  const remaining = f.lifecycle.createAgent({
    name: "Remaining member",
    harness: "codex",
    connection_id: connection.id,
    model_id: "model-a",
    reasoning: "high",
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [lane.agent.id, remaining.id],
  });
  let recoveredWithoutWorkspace = false;
  let prompts = 0;
  const native = makeBroker({
    codex: adapter("codex", async (context) =>
      client({
        async prompt() {
          prompts++;
          throw new Error("Receipt inspection must never prompt.");
        },
        async reconcile(identity, nativeRunId) {
          recoveredWithoutWorkspace = !context.workspace && context.purpose === "routing";
          return {
            ...identity,
            native_run_id: nativeRunId,
            status: "cancelled",
            text: "Revoked member output must not publish.",
          };
        },
      }),
    ),
  });
  await native.openSession(group.id, lane.agent.id);
  f.lifecycle.admit({
    thread_id: group.id,
    agent_id: lane.agent.id,
    text: "Inspect the shared source.",
  });
  const run = f.lifecycle.claimNext(group.id, lane.agent.id);
  if (!run?.dispatch_token) throw new Error("Missing group run.");
  f.lifecycle.started(run.id, run.dispatch_token, "revoked-native-turn");
  f.lifecycle.settle(run.id, run.dispatch_token, "unknown");
  new Groups(f.lifecycle).membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [remaining.id],
  });
  expect((await native.reconcile(run.id)).status).toBe("cancelled");
  expect(recoveredWithoutWorkspace).toBe(true);
  expect(prompts).toBe(0);
  expect(f.store.answer(run.id)).toBeNull();
  f.lifecycle.admit({ thread_id: group.id, agent_id: remaining.id, text: "Continue group work." });
  await native.openSession(group.id, remaining.id);
  expect(f.lifecycle.claimNext(group.id, remaining.id)?.status).toBe("dispatching");
});

test("an unconfirmed native stop reaches a bounded unknown outcome and fences late events", async () => {
  const connections = setup();
  const lane = assign(
    connections.create({
      harness: "codex",
      authentication: { method: "native_login", billing_source: "subscription" },
    }),
  );
  let ready: () => void = () => {};
  const entered = new Promise<void>((resolve) => {
    ready = resolve;
  });
  let closes = 0;
  tools = new ProductTools(f.lifecycle);
  broker = new HarnessBroker(
    f.lifecycle,
    new CredentialContexts(f.dir),
    tools,
    {
      codex: adapter("codex", async () =>
        client({
          async prompt(request) {
            request.onEvent({
              type: "accepted",
              native_session_id: request.identity.native_session_id,
              native_run_id: "native-turn",
            });
            ready();
            return new Promise(() => {});
          },
          async close() {
            closes++;
          },
        }),
      ),
    },
    async () => ({
      harness: "codex",
      state: "supported",
      executable: process.execPath,
      version: "0.165.0",
      manifest: manifests.codex,
    }),
    undefined,
    { request_ms: 20, close_ms: 20 },
  );
  await broker.openSession(lane.thread.id, lane.agent.id);
  const admitted = f.lifecycle.admit({
    thread_id: lane.thread.id,
    agent_id: lane.agent.id,
    text: "Inspect",
  });
  const background = new Background(f.lifecycle, broker.executors());
  background.tick();
  await entered;
  f.lifecycle.cancel(admitted.run.id);
  background.notifyControls();
  expect(f.store.get("run", admitted.run.id).status).toBe("cancel_requested");
  await background.idle();
  expect(f.store.get("run", admitted.run.id)).toMatchObject({
    status: "unknown",
    cancellation: "requested",
    diagnostic: { code: "NATIVE_UNKNOWN" },
  });
  expect(closes).toBeGreaterThan(0);
  background.tick();
  expect(background.activeCount).toBe(0);
  await background.stop();
});
