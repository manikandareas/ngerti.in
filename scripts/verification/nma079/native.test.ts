import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { DomainRuntime } from "../../../apps/server/src/machines/domain-runtime";
import { ExecutionDomains } from "../../../apps/server/src/machines/domains";
import { Machines } from "../../../apps/server/src/machines/service";
import { ScopedData } from "../../../apps/server/src/organizations/data";
import { organizationFixture } from "../../../apps/server/tests/organizations/helpers";
import { captureSource } from "./source";

test.skipIf(process.env.NGERTIIN_NMA079_NATIVE !== "1")("real account-mode admission executes both native harnesses through private Cua domains", async () => {
  const root = resolve(import.meta.dir, "../../..");
  const directory = join(root, "docs/verification/nma-079/native");
  mkdirSync(directory, { recursive: true });
  const report: Record<string, unknown> = { planned_lanes: process.env.NGERTIIN_NMA079_HARNESS ? 2 : 4, lanes: [], completed: false,
    source: captureSource(),
    scope: "real HTTP account principals, normal admission/claim/dispatch, real native inference and product tools",
    credential_handling: "read-only existing short-lived Codex access token; no refresh token copying or authority mutation; explicit Muse API key",
    synthetic_dispatch: false };
  const save = () => Bun.write(join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const configuration = developmentConfig();
  const environment = parseEnv(readFileSync(join(root, ".env"), "utf8"));
  const key = environment.MUSE_API_KEY ?? environment.META_API_KEY;
  if (!key) throw new Error("The selected Muse API key is unavailable.");
  const { Client } = createRequire(join(root, "apps/server/package.json"))("pg");
  const source = new Client({ connectionString: configuration.databaseUrl });
  await source.connect();
  let tokens: { accessToken: string; chatgptAccountId: string; chatgptPlanType?: string };
  let model: string;
  try {
    const rows = (await source.query(`SELECT id,body FROM "${configuration.databaseSchema}".entities WHERE kind='connection' AND body->>'harness'='codex' AND body->>'login'='authenticated' AND body->'authentication'->>'method'='native_login'`)).rows;
    if (rows.length !== 1) throw new Error("Exactly one explicit retained Codex authority is required.");
    const authority = join(configuration.stateDir, "connections", rows[0].id, "codex/auth.json");
    if (!existsSync(authority)) throw new Error("The retained Codex authority is unavailable.");
    const stored = JSON.parse(readFileSync(authority, "utf8")).tokens;
    const expiry = JSON.parse(Buffer.from(stored.access_token.split(".")[1], "base64url").toString()).exp * 1000;
    if (expiry < Date.now() + 240_000) throw new Error("The retained short-lived token needs renewal by its existing authority.");
    tokens = { accessToken: stored.access_token, chatgptAccountId: stored.account_id, chatgptPlanType: rows[0].body.account_plan ?? undefined };
    const configured = (await source.query(`SELECT body->>'model_id' AS model FROM "${configuration.databaseSchema}".entities WHERE kind='agent' AND body->>'connection_id'=$1 AND body->>'model_id' IS NOT NULL LIMIT 1`, [rows[0].id])).rows[0]?.model;
    model = configured ?? rows[0].body.models.find((entry: { id: string }) => entry.id === "gpt-6.1-sol")?.id;
    if (!model) throw new Error("The retained Codex model selection is unavailable.");
    report.codex_plan = rows[0].body.account_plan;
  } finally { await source.end(); }
  const f = await organizationFixture();
  const { lifecycle, store } = f.domain;
  const runtime = new DomainRuntime(f.domain.dir, f.domain.owner, { version: 1, max_domains: 2, memory_mib: 768, cpus: 1, pids: 512 });
  const legacy = await Machines.open(lifecycle, null);
  const domains = new ExecutionDomains(lifecycle, runtime);
  const tools = await ProductTools.open(lifecycle);
  const credentials = new CredentialContexts(f.domain.dir, () => key);
  credentials.codexTokens = async () => tokens;
  const harnesses = new HarnessRuntime(configuration.harnessExecutables, configuration.nativeCodexExecutable);
  let api: Awaited<ReturnType<typeof createApi>>;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: request => api.handle(request) });
  const endpoint = () => `http://127.0.0.1:${server.port}/v1/harness/tools`;
  const broker = new HarnessBroker(lifecycle, credentials, tools, { codex: new AcpAdapter("codex", endpoint), muse: new MuseAdapter(endpoint) }, harnesses.detect);
  const background = new Background(lifecycle, broker.executors());
  const ids = new Set<string>();
  const previousStorage = process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE;
  process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE = "encrypted-volume";
  const request = (cookie: string, path: string, body?: unknown, command = crypto.randomUUID()) => api.handle(new Request(`${f.origin}${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Cookie: cookie, Origin: f.origin, "Content-Type": "application/json", "X-Ngertiin-Organization": f.initial.organization.id, "Idempotency-Key": command }, body: body === undefined ? undefined : JSON.stringify(body),
  }));
  try {
    await f.success(f.write(f.owner.cookie, "/v1/data/legacy-binding", { organization_id: f.initial.organization.id, legacy_owner_id: f.domain.owner }));
    const member = await f.account("native-member@example.test");
    await f.join(member);
    api = await createApi(lifecycle, background, { authentication: f.auth, tools, connections: broker.connections, broker });
    const audience = (await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))).audience;
    for (const harness of ["codex", "muse"] as const) {
      if (process.env.NGERTIIN_NMA079_HARNESS && process.env.NGERTIIN_NMA079_HARNESS !== harness) continue;
      const available = await harnesses.detect(harness);
      expect(available.state).toBe("supported");
      const team = await f.success(request(f.owner.cookie, "/v1/data/team-agents", { name: `Native ${harness}`, harness, audience_id: audience.id }));
      const markers: string[] = [];
      for (const [index, cookie] of [member.cookie, f.owner.cookie].entries()) {
        const req = new Request(`${f.origin}/v1/entities/agent`, { headers: { Cookie: cookie, "X-Ngertiin-Organization": f.initial.organization.id } });
        await f.auth.authenticate(req);
        const context = await new ScopedData(lifecycle, f.auth).context(req);
        const scoped = <T>(action: () => T) => store.withDataContext(context, action);
        const connection = await scoped(() => new Connections(lifecycle).create({ harness, authentication: harness === "codex"
          ? { method: "native_login", billing_source: "subscription" }
          : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() } }));
        const thread = await f.success(request(cookie, `/v1/agents/${team.id}/dm`, {}));
        await f.success(request(cookie, "/v1/ai/selections", { scope: "conversation", thread_id: thread.id, agent_id: team.id, harness,
          selection: { connection_id: connection.id, model_id: harness === "codex" ? model : "muse-spark-1.3", reasoning: harness === "codex" ? null : "medium" } }));
        const machine = await scoped(() => domains.resolve());
        ids.add((await machine.snapshot()).id);
        await scoped(() => machine.ready());
        await f.success(request(cookie, `/v1/threads/${thread.id}/sessions`, { agent_id: team.id }));
        const marker = crypto.randomUUID(); markers.push(marker);
        const key = crypto.randomUUID();
        const body = { thread_id: thread.id, agent_id: team.id, text: `Call ngertiin.read_run_context with empty arguments. Reply with its thread_id and this marker: ${marker}. Do not create a Goal or Routine. Do not use host tools.` };
        const admission = await f.success(request(cookie, "/v1/runs", body, key));
        await background.tick();
        await background.idle();
        const current = await f.success(request(cookie, `/v1/entities/run/${admission.run.id}`));
        report.last_run = { harness, status: current.status, diagnostic: current.diagnostic, product_tools: current.product_tools, tool_errors: current.tool_errors?.map((error: { code: string }) => error.code), processing_observed: current.delivery === "accepted" || current.delivery === "delivered", native_turn_observed: Boolean(current.native_run_id ?? current.native_dispatch_id) };
        expect(current.status, JSON.stringify(current.diagnostic)).toBe("succeeded");
        expect(current.product_tools).toContain("ngertiin.read_run_context");
        const snapshot = await f.success(request(cookie, `/v1/threads/${thread.id}/snapshot`));
        const answer = snapshot.messages.filter((message: { author: string }) => message.author === "agent").map((message: { text: string }) => message.text).join("\n");
        expect(answer).toContain(marker); expect(answer).toContain(thread.id);
        for (const foreign of markers.slice(0, -1)) expect(answer).not.toContain(foreign);
        const otherCookie = index ? member.cookie : f.owner.cookie;
        expect((await request(otherCookie, `/v1/threads/${thread.id}/snapshot`)).status).toBe(404);
        const replay = await f.success(request(cookie, "/v1/runs", body, key));
        expect(replay.run.id).toBe(admission.run.id);
        (report.lanes as unknown[]).push({ harness, actor: index, version: available.version, model: harness === "codex" ? model : "muse-spark-1.3", billing: current.provider_selection.billing_source,
          completed_inference: true, useful_product_tool: true, private_marker_and_thread: true, cross_user_read: 404, replay_same_run: true,
          account_fingerprint: createHash("sha256").update(current.provider_selection.account_id).digest("hex").slice(0, 12) });
        await save();
      }
    }
    report.completed = true;
  } catch (error) {
    report.failure = error instanceof Error ? error.name : "Unknown failure";
    throw error;
  } finally {
    await background.stop(); await broker.close(); tools.revokeAll();
    await api?.stop(true); await server.stop(true); await domains.close(); await legacy.close();
    for (const id of ids) {
      await runtime.retire(id).catch(() => {});
      for (const args of [["network", "rm", `ngertiin-domain-${id}-network`], ["volume", "rm", `ngertiin-domain-${id}-home`]]) {
        const process = Bun.spawn(["docker", ...args], { stdout: "ignore", stderr: "ignore" }); await process.exited;
      }
    }
    await f.close();
    if (previousStorage === undefined) delete process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE; else process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE = previousStorage;
    await save();
  }
}, 600_000);
