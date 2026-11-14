import { createApi } from "../../src/api";
import { Background } from "../../src/background";
import { DomainError, type Entity } from "../../src/contracts";
import { manifests } from "../../src/harness/availability";
import { HarnessBroker } from "../../src/harness/broker";
import type { HarnessAdapter, HarnessClient } from "../../src/harness/client";
import { Connections } from "../../src/harness/connections";
import { CredentialContexts, type LaunchContext } from "../../src/harness/context";
import { unknownCapabilities } from "../../src/harness/contracts";
import { ProductTools } from "../../src/harness/tools";
import type { AppHost } from "../../src/integrations/host";
import { CuaMachine, MachineFiles } from "../../src/machines/cua";
import { DomainRuntime } from "../../src/machines/domain-runtime";
import { ExecutionDomains } from "../../src/machines/domains";
import { Machines } from "../../src/machines/service";
import { ScopedData } from "../../src/organizations/data";
import { organizationFixture } from "./helpers";

export const fixtureCapabilities = {
  ...unknownCapabilities,
  product_tools: "supported",
  settings: "supported",
  resume: "supported",
} as const;
class ReadinessFiles extends MachineFiles {
  override async read(path: string): Promise<Buffer<ArrayBuffer>> {
    this.path(path);
    const bytes = (this.machine as ReadinessHost).bytes.get(path);
    if (!bytes) throw new DomainError("NOT_FOUND", 404);
    return Buffer.from(bytes);
  }
  override async create(path: string, bytes: Uint8Array) {
    await this.write(path, bytes, true);
  }
  override async write(path: string, bytes: Uint8Array, exclusive = false) {
    this.path(path);
    const files = (this.machine as ReadinessHost).bytes;
    if (exclusive && files.has(path)) throw new DomainError("CONFLICT");
    files.set(path, Buffer.from(bytes));
  }
  override async list(path = ".", _after = "", _limit = 200) {
    return {
      entries: [...(this.machine as ReadinessHost).bytes]
        .filter(([name]) => path === "." || name.startsWith(`${path}/`))
        .map(([name, bytes]) => ({
          name,
          path: name,
          type: "file" as const,
          size_bytes: bytes.length,
        })),
      next_after: null,
    };
  }
}
export class ReadinessHost extends CuaMachine {
  readonly bytes = new Map<string, Buffer>();
  override files() {
    return new ReadinessFiles(this);
  }
  override async rpc(name: string) {
    if (name.endsWith("CreateViewerTicket")) return { ticket: `fixture-${crypto.randomUUID()}` };
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
  override async tools() {
    return { contractVersion: "fixture", tools: [] };
  }
}

export async function readinessFixture(
  prompt?: HarnessClient["prompt"],
  appHost?: AppHost,
  timeouts = { request_ms: 30_000, close_ms: 1000 },
) {
  const f = await organizationFixture();
  const { lifecycle, store } = f.domain;
  await f.success(
    f.write(f.owner.cookie, "/v1/data/legacy-binding", {
      organization_id: f.initial.organization.id,
      legacy_owner_id: f.domain.owner,
    }),
  );
  const alice = await f.account("alice@example.test");
  const joined = await f.join(alice);
  const legacy = await Machines.open(lifecycle, null);
  const domains = new ExecutionDomains(
    lifecycle,
    new DomainRuntime(f.domain.dir, f.domain.owner, null),
    (configuration) => new ReadinessHost(configuration),
  );
  const tools = await ProductTools.open(lifecycle, undefined, undefined, appHost);
  const calls: { actor: string | undefined; thread: string; input: string }[] = [];
  const closedConnections: string[] = [];
  const closedActiveConnections: string[] = [];
  const launches: LaunchContext[] = [];
  const adapters = Object.fromEntries(
    (["codex", "muse"] as const).map((harness) => [
      harness,
      {
        harness,
        async connect(launch) {
          launches.push(launch);
          if (launch.codexAuth) await store.outsideDataContext(() => launch.codexAuth?.(true));
          const identity = { native_session_id: crypto.randomUUID() };
          let prompting = false;
          const client = {
            async inspect() {
              return {
                login: "authenticated",
                account_id: `account-${launch.connection_id}`,
                auth_method: harness === "codex" ? "native_login" : "api_key",
                billing_source: harness === "codex" ? "subscription" : "api_key",
                capabilities: fixtureCapabilities,
              };
            },
            async discoverModels() {
              return [{ id: "fixture-model", reasoning: [] }];
            },
            async start() {
              return identity;
            },
            async resume(previous) {
              return previous;
            },
            async settings() {},
            async close() {
              closedConnections.push(launch.connection_id);
              if (prompting) closedActiveConnections.push(launch.connection_id);
            },
            async stop() {
              return { confirmed: false };
            },
            prompt:
              prompt ??
              (async (request) => {
                const nativeRun = crypto.randomUUID();
                await request.onEvent({
                  type: "accepted",
                  native_session_id: request.identity.native_session_id,
                  native_run_id: nativeRun,
                });
                await store.outsideDataContext(() =>
                  request.onEvent({ type: "activity", activity: "generating" }),
                );
                const context = (await tools.call(
                  request.tools.token,
                  request.tools.scope,
                  "ngertiin.read_run_context",
                  {},
                )) as { input: string; thread_id: string };
                calls.push({
                  actor: request.tools.scope.actor_id,
                  thread: context.thread_id,
                  input: context.input,
                });
                await request.onEvent({ type: "text_snapshot", text: context.input });
                return {
                  status: "succeeded",
                  native_session_id: request.identity.native_session_id,
                  native_run_id: nativeRun,
                };
              }),
          } satisfies HarnessClient;
          const execute = client.prompt;
          client.prompt = async (request) => {
            prompting = true;
            try {
              return await execute(request);
            } finally {
              prompting = false;
            }
          };
          return client;
        },
      } satisfies HarnessAdapter,
    ]),
  );
  const previousStorage = process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE;
  process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE = "encrypted-volume";
  const credentials = new CredentialContexts(
    f.domain.dir,
    () => "fixture-key-not-a-provider-credential",
  );
  credentials.codexTokens = async (id) => {
    const connections = new Connections(lifecycle);
    await connections.authorize(await connections.get(id));
    return { accessToken: "fixture-access-token", chatgptAccountId: "fixture-account" };
  };
  const broker = new HarnessBroker(
    lifecycle,
    credentials,
    tools,
    adapters,
    async (harness) => ({
      harness,
      state: "supported",
      version: manifests[harness].minimum_version,
      executable: process.execPath,
      manifest: manifests[harness],
    }),
    undefined,
    timeouts,
  );
  const background = new Background(lifecycle, broker.executors());
  const api = await createApi(lifecycle, background, "r".repeat(64), {
    authentication: f.auth,
    connections: broker.connections,
    tools,
    broker,
    accounts: {
      inspect: (id) => broker.connections.get(id),
      login: async () => ({
        user_code: "fixture-code",
        auth_url: "https://example.test/device",
        expires_in_seconds: 600,
      }),
      cancel: async () => {},
    },
  });
  async function request(
    cookie: string | undefined,
    path: string,
    body?: unknown,
    organization = f.initial.organization.id,
    key = crypto.randomUUID(),
  ) {
    const headers = new Headers({
      "X-Ngertiin-Organization": organization,
      "Idempotency-Key": key,
      Origin: f.origin,
    });
    if (cookie) headers.set("Cookie", cookie);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    return api.handle(
      new Request(`${f.origin}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );
  }
  async function context(cookie: string, organization = f.initial.organization.id) {
    const req = new Request(`${f.origin}/v1/entities/agent`, {
      headers: { Cookie: cookie, "X-Ngertiin-Organization": organization },
    });
    await f.auth.authenticate(req);
    return new ScopedData(lifecycle, f.auth).context(req);
  }
  const audience = (
    await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))
  ).audience;
  async function lane(cookie: string, harness: "codex" | "muse", agent?: Entity<"agent">) {
    const selectedAgent: Entity<"agent"> =
      agent ??
      (await f.success(
        request(f.owner.cookie, "/v1/data/team-agents", {
          name: `Shared ${harness}`,
          harness,
          audience_id: audience.id,
        }),
      ));
    const scope = await context(cookie);
    const connection = await store.withDataContext(scope, async () => {
      const connections = new Connections(lifecycle);
      const created = await connections.create({
        harness,
        authentication:
          harness === "codex"
            ? { method: "native_login", billing_source: "subscription" }
            : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() },
      });
      return connections.update(created, {
        login: "authenticated",
        account_id: `account-${created.id}`,
        effective_billing_source: created.authentication.billing_source,
        capabilities: fixtureCapabilities,
        models: [{ id: "fixture-model", reasoning: [] }],
        discovery: "succeeded",
      });
    });
    await f.success(
      request(cookie, "/v1/ai/selections", {
        scope: "user",
        harness,
        selection: { connection_id: connection.id, model_id: "fixture-model" },
      }),
    );
    const thread = await f.success(request(cookie, `/v1/agents/${selectedAgent.id}/dm`, {}));
    return { cookie, agent: selectedAgent, connection, thread, scope };
  }
  return {
    ...f,
    api,
    alice,
    joined,
    tools,
    broker,
    background,
    domains,
    calls,
    closedConnections,
    closedActiveConnections,
    launches,
    request,
    context,
    lane,
    async close() {
      await background.stop();
      await broker.close();
      tools.revokeAll();
      await api.stop(true);
      await domains.close();
      await legacy.close();
      await f.close();
      if (previousStorage === undefined) delete process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE;
      else process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE = previousStorage;
    },
  };
}
