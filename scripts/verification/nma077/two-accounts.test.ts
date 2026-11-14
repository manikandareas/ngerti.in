import { expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentInput, agentSnapshot, DomainError, type Entity } from "../../../apps/server/src/contracts";
import { CodexAccounts } from "../../../apps/server/src/harness/codex/accounts";
import { CodexClient } from "../../../apps/server/src/harness/codex/client";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts, type LaunchContext } from "../../../apps/server/src/harness/context";
import { CredentialStorage } from "../../../apps/server/src/harness/credential-storage";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { ScopedData } from "../../../apps/server/src/organizations/data";
import type { DataContext } from "../../../apps/server/src/persistence/access-context";
import { organizationFixture } from "../../../apps/server/tests/organizations/helpers";

test.skipIf(process.env.NGERTIIN_NMA077_TWO_ACCOUNT_PROBE !== "1")("two provider accounts including Free retain private Team-agent sessions", async () => {
  const f = await organizationFixture();
  const { store, lifecycle } = f.domain;
  const credentials = new CredentialContexts(f.domain.dir);
  const connections = new Connections(lifecycle);
  let accounts = new CodexAccounts(connections, credentials);
  const tools = await ProductTools.open(lifecycle);
  const clients: CodexClient[] = [];
  const report: Record<string, unknown> = {
    scope: "real account-mode HTTP/SQL principals and native providers; synthetic accepted-run seam leaves production admission closed",
    accounts: [], lanes: [], billing_lane: "chatgpt_account", provider_api_keys_used: false,
    distinct_accounts: false, cross_account_resume_rejected: false, completed: false,
  };
  const save = () => { if (process.env.NGERTIIN_NMA077_TWO_ACCOUNT_REPORT) writeFileSync(process.env.NGERTIIN_NMA077_TWO_ACCOUNT_REPORT, `${JSON.stringify(report, null, 2)}\n`); };
  const request = (cookie: string, path: string, body?: unknown) => f.http(path, body, cookie, {
    "X-Ngertiin-Organization": f.initial.organization.id, "Idempotency-Key": crypto.randomUUID(),
  });
  const scoped = <T>(scope: DataContext, action: () => T): T => store.withDataContext(scope, action);
  const gateway = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const result = await tools.rpc((request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""), await request.json());
    return result === null ? new Response(null, { status: 202 }) : Response.json(result);
  } });
  try {
    await f.success(f.write(f.owner.cookie, "/v1/data/legacy-binding", { organization_id: f.initial.organization.id, legacy_owner_id: f.domain.owner }));
    const member = await f.account("free-native@example.test");
    await f.join(member);
    const audience = (await f.success(f.write(f.owner.cookie, `${f.path}/audiences`, { mode: "all_members" }))).audience;
    const team = await f.success(request(f.owner.cookie, "/v1/data/team-agents", { name: "Native account isolation", harness: "codex", audience_id: audience.id }));
    const scopes = new ScopedData(lifecycle, f.auth);
    const contexts: DataContext[] = [];
    for (const cookie of [member.cookie, f.owner.cookie]) {
      const req = new Request(`${f.origin}/v1/entities/agent`, { headers: { Cookie: cookie, "X-Ngertiin-Organization": f.initial.organization.id } });
      await f.auth.authenticate(req);
      contexts.push(await scopes.context(req));
    }
    const cookies = [member.cookie, f.owner.cookie];
    const selected: Entity<"connection">[] = [];
    const threads: Entity<"thread">[] = [];
    for (let index = 0; index < 2; index++) {
      const label = index === 0 ? "free" : "comparison";
      let connection = await f.success(request(cookies[index], "/v1/connections", { harness: "codex", authentication: { method: "native_login", billing_source: "subscription" } }));
      const login = await scoped(contexts[index], () => accounts.login(connection.id, "device"));
      console.log(JSON.stringify({ event: "remote_login_required", account: label, ...login }));
      const deadline = Date.now() + 580_000;
      while (Date.now() < deadline) {
        connection = await scoped(contexts[index], () => accounts.inspect(connection.id));
        if (connection.login === "authenticated") break;
        await Bun.sleep(2500);
      }
      expect(connection.login).toBe("authenticated");
      if (index === 0) expect(connection.account_plan?.toLowerCase()).toBe("free");
      expect(connection.models.length).toBeGreaterThan(0);
      (report.accounts as unknown[]).push({ account: label, plan: connection.account_plan ?? "unknown", login: "passed", catalog: "passed", catalog_count: connection.models.length });
      selected.push(connection);
      threads.push(await f.success(request(cookies[index], `/v1/agents/${team.id}/dm`, {})));
      save();
      console.log(JSON.stringify({ event: "account_verified", account: label, plan: connection.account_plan ?? "unknown" }));
    }
    expect(selected[0].account_id).not.toBe(selected[1].account_id);
    report.distinct_accounts = true;
    for (let index = 0; index < 2; index++) {
      await scoped(contexts[index], () => Promise.all([accounts.tokens(selected[index].id, true), accounts.tokens(selected[index].id, true)]));
    }
    await accounts.close();
    accounts = new CodexAccounts(connections, credentials);
    for (let index = 0; index < 2; index++) {
      const restored = await scoped(contexts[index], () => accounts.inspect(selected[index].id));
      expect(restored.account_id).toBe(selected[index].account_id);
      await scoped(contexts[index], () => accounts.tokens(restored.id, true));
      selected[index] = restored;
    }
    report.authority_restart_refresh = "passed_both_accounts";

    // Only this disposable fixture bypasses the deliberately closed native admission seam.
    // ProductTools still validates real membership, actor/organization, connection, binding and grants.
    lifecycle.authorizeDispatch = async (id, token) => {
      await store.dataContext?.validate(true);
      const run = await store.get("run", id);
      if (!token || run.dispatch_token !== token || run.authority_epoch !== lifecycle.epoch || !["dispatching", "running"].includes(run.status)) throw new DomainError("STALE_DISPATCH");
      return run;
    };
    type Lane = { client: CodexClient; identity: { native_session_id: string }; launch: LaunchContext; binding: Entity<"binding">; settings: { model_id: string; reasoning: string | null } };
    const lanes: Lane[] = [];
    for (let index = 0; index < 2; index++) {
      await scoped(contexts[index], async () => {
        const connection = selected[index];
        const launch = credentials.create(connection, { organization_id: contexts[index].organizationId, actor_id: contexts[index].userId, agent_id: team.id, thread_id: threads[index].id, generation: connection.grant_revision });
        const client = new CodexClient(Bun.which("codex") as string, launch, join(launch.state_directory, "control"), () => `http://127.0.0.1:${gateway.port}`, "Use ngertiin_product_tool to call ngertiin.read_run_context with empty arguments. Never use shell or host files.");
        clients.push(client);
        await client.initialize();
        const inspection = await client.inspect();
        expect(inspection.account_id).toBe(connection.account_id);
        expect(inspection.account_plan).toBe(connection.account_plan);
        const raw = await client.rpc.request("model/list", { limit: 100, includeHidden: false }) as { data: { model: string; isDefault: boolean }[] };
        const model = raw.data.find((model) => model.isDefault) ?? raw.data[0];
        if (!model) throw new Error("The account reported no default model.");
        const settings = { model_id: model.model, reasoning: null };
        await f.success(request(cookies[index], "/v1/ai/selections", { scope: "conversation", harness: "codex", thread_id: threads[index].id, agent_id: team.id, selection: { connection_id: connection.id, ...settings } }));
        const identity = await client.start(settings);
        const binding = await lifecycle.bind(threads[index].id, team.id, identity.native_session_id);
        expect(existsSync(join(launch.env.CODEX_HOME, "auth.json"))).toBe(false);
        lanes.push({ client, identity, launch, binding, settings });
      });
    }
    expect(lanes[0].launch.env.CODEX_HOME).not.toBe(lanes[1].launch.env.CODEX_HOME);
    expect(threads[0].id).not.toBe(threads[1].id);
    const markers = [crypto.randomUUID(), crypto.randomUUID()];
    for (let index = 0; index < 2; index++) {
      await scoped(contexts[index], async () => {
        const lane = lanes[index];
        const admitted = await lifecycle.admit({ thread_id: threads[index].id, agent_id: team.id, text: `My private marker is ${markers[index]}. Call ngertiin.read_run_context with empty arguments, then reply with my marker and its thread_id. Do not create Goals or Routine.` });
        if (!admitted.run) throw new Error("The verification input did not admit work.");
        const agent = await lifecycle.executionAgent(threads[index].id, team.id);
        const run = await store.put({ ...admitted.run, status: "dispatching", delivery: "delivered", dispatch_token: crypto.randomUUID(), authority_epoch: lifecycle.epoch, binding_id: lane.binding.id, workspace_id: lane.binding.workspace_id, workspace_revision: lane.binding.workspace_revision, agent_snapshot: agentSnapshot.parse({ ...agentInput.strip().parse(agent), agent_id: agent.id, revision: agent.revision }), revision: admitted.run.revision + 1 }, admitted.run.revision);
        let accepted = Promise.resolve();
        const lease = await tools.issue(run, () => accepted);
        let output = "";
        try {
          const terminal = await lane.client.prompt({ identity: lane.identity, run_id: run.id, text: admitted.message.text, settings: lane.settings, tools: lease, signal: AbortSignal.timeout(120_000), onEvent(event) {
            if (event.type === "accepted") accepted = lifecycle.started(run.id, run.dispatch_token as string, event.native_run_id).then(() => {});
            if (event.type === "text_snapshot") output = event.text;
            if (event.type === "failure") (report.lanes as unknown[]).push({ actor: index + 1, plan: selected[index].account_plan, failure: event.code });
          } });
          await accepted;
          expect(terminal).toMatchObject({ status: "succeeded" });
          expect(output).toContain(markers[index]);
          expect(output).toContain(threads[index].id);
          expect(output).not.toContain(markers[1 - index]);
          expect((await store.get("run", run.id)).product_tools).toContain("ngertiin.read_run_context");
          await lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
          (report.lanes as unknown[]).push({ actor: index + 1, plan: selected[index].account_plan, model: lane.settings.model_id, inference: "passed", scoped_tool: "passed", private_marker: "passed" });
        } finally { lease.revoke(); save(); }
      });
    }
    expect((await request(cookies[0], `/v1/entities/connection/${selected[1].id}`)).status).toBe(404);
    expect((await request(cookies[1], `/v1/entities/binding/${lanes[0].binding.id}`)).status).toBe(404);
    expect((await f.success(request(cookies[0], `/v1/entities/agent/${team.id}`))).connection_id).toBeNull();
    for (const lane of lanes) await lane.client.close();
    await scoped(contexts[0], async () => {
      const client = new CodexClient(Bun.which("codex") as string, lanes[0].launch, join(lanes[0].launch.state_directory, "control"), () => `http://127.0.0.1:${gateway.port}`);
      clients.push(client);
      await client.initialize();
      await expect(client.resume(lanes[1].identity, lanes[0].settings)).rejects.toThrow("NATIVE_REJECTED");
      expect((await client.resume(lanes[0].identity, lanes[0].settings)).native_session_id).toBe(lanes[0].identity.native_session_id);
      await client.close();
      report.cross_account_resume_rejected = true;
      await connections.revoke(selected[0].id);
      await accounts.retire(selected[0].id);
      new CredentialStorage(f.domain.dir).retire(selected[0].id);
      expect(() => credentials.create(selected[0])).toThrow("AUTH_REJECTED");
    });
    await scoped(contexts[1], async () => {
      await accounts.tokens(selected[1].id, true);
      const client = new CodexClient(Bun.which("codex") as string, lanes[1].launch, join(lanes[1].launch.state_directory, "control"), () => `http://127.0.0.1:${gateway.port}`);
      clients.push(client);
      await client.initialize();
      expect((await client.resume(lanes[1].identity, lanes[1].settings)).native_session_id).toBe(lanes[1].identity.native_session_id);
      await client.close();
    });
    report.own_resume_after_restart = "passed_both_accounts";
    report.disconnect_one_keeps_other_account_usable = true;
    report.completed = true;
    save();
  } finally {
    save();
    await Promise.allSettled(clients.map((client) => client.close()));
    await accounts.close();
    await gateway.stop(true);
    await f.close();
  }
}, 1_400_000);
