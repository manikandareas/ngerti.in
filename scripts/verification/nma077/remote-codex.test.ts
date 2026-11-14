import { expect, test } from "bun:test";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { CodexAccounts } from "../../../apps/server/src/harness/codex/accounts";
import { CodexClient } from "../../../apps/server/src/harness/codex/client";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { CredentialStorage } from "../../../apps/server/src/harness/credential-storage";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import type { Entity } from "../../../apps/server/src/contracts";
import { fixture } from "../../../apps/server/tests/helpers";

// Explicit opt-in; the ordinary regression suite never starts a real provider login.
test.skipIf(process.env.NGERTIIN_NMA077_REMOTE_PROBE !== "1")("remote device login, coordinated refresh and two private native consumers", async () => {
  const f = await fixture();
  const credentials = new CredentialContexts(f.dir);
  const connections = new Connections(f.lifecycle);
  let accounts = new CodexAccounts(connections, credentials);
  const clients: CodexClient[] = [];
  const tools = await ProductTools.open(f.lifecycle);
  const gateway = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const result = await tools.rpc((request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""), await request.json());
    return result === null ? new Response(null, { status: 202 }) : Response.json(result);
  } });
  const observations: Record<string, unknown> = {
    scope: "native provider proof with controlled fixture principals; production organization admission stays closed pending NMA-078",
    billing: "subscription", login: false, catalog: false, refresh: false, restart: false, lanes: [],
  };
  const save = () => {
    const output = process.env.NGERTIIN_NMA077_REPORT;
    if (output) writeFileSync(output, `${JSON.stringify(observations, null, 2)}\n`);
  };
  try {
    const connection = await connections.create({ harness: "codex", authentication: { method: "native_login", billing_source: "subscription" } });
    const login = await accounts.login(connection.id, "device");
    console.log(JSON.stringify({ event: "remote_login_required", ...login }));
    const deadline = Date.now() + 580_000;
    let current = connection;
    while (Date.now() < deadline) {
      current = await accounts.inspect(connection.id);
      if (current.login === "authenticated") break;
      await Bun.sleep(2500);
    }
    expect(current.login).toBe("authenticated");
    observations.login = true;
    expect(current.effective_billing_source).toBe("subscription");
    expect(current.models.length).toBeGreaterThan(0);
    observations.catalog = true;
    const models = current.models;
    const chosen = models.find((model) => /mini/.test(model.id)) ?? models[0];
    const selected = { model_id: chosen.id, reasoning: null };
    observations.model = chosen.id;
    await Promise.all([accounts.tokens(current.id, true), accounts.tokens(current.id, true)]);
    observations.refresh = true;
    await accounts.close();
    accounts = new CodexAccounts(connections, credentials);
    current = await accounts.inspect(current.id);
    await accounts.tokens(current.id, true);
    observations.restart = current.login === "authenticated";
    const organization = crypto.randomUUID();
    const privateFacts = [crypto.randomUUID(), crypto.randomUUID()];
    const lanes: { client: CodexClient; identity: { native_session_id: string }; agent: Entity<"agent">; thread: Entity<"thread">; home: string }[] = [];
    for (let index = 0; index < 2; index++) {
      const agent = await f.lifecycle.createAgent({ name: `Native ${index}`, harness: "codex", connection_id: current.id, model_id: chosen.id, billing_source: "subscription" });
      const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] }) as Entity<"thread">;
      const launch = credentials.create(current, { organization_id: organization, actor_id: crypto.randomUUID(), agent_id: agent.id, thread_id: thread.id, generation: current.grant_revision });
      const client = new CodexClient(Bun.which("codex") as string, launch, join(launch.state_directory, "control"), () => `http://127.0.0.1:${gateway.port}`, "Use ngertiin_product_tool to call ngertiin.read_run_context with empty arguments when asked. Never use shell or host files.");
      clients.push(client);
      await client.initialize();
      expect((await client.inspect()).account_id).toBe(current.account_id);
      const identity = await client.start(selected);
      await f.lifecycle.bind(thread.id, agent.id, identity.native_session_id);
      lanes.push({ client, identity, agent, thread, home: launch.env.CODEX_HOME });
    }
    expect(lanes[0].home).not.toBe(lanes[1].home);
    expect(lanes[0].identity.native_session_id).not.toBe(lanes[1].identity.native_session_id);
    for (const [index, lane] of lanes.entries()) {
      const admitted = await f.lifecycle.admit({ thread_id: lane.thread.id, agent_id: lane.agent.id, text: `My private marker is ${privateFacts[index]}. Call ngertiin.read_run_context with empty arguments. Then reply with my marker and the thread_id returned by the tool.` });
      const run = await f.lifecycle.claimNext(lane.thread.id, lane.agent.id);
      if (!run?.dispatch_token) throw new Error("Probe run was not claimed.");
      let accepted = Promise.resolve();
      const lease = await tools.issue(run, () => accepted);
      let output = "";
      try {
        const terminal = await lane.client.prompt({ identity: lane.identity, run_id: run.id, text: admitted.message.text, settings: selected, tools: lease, signal: AbortSignal.timeout(120_000), onEvent(event) {
          if (event.type === "accepted") accepted = f.lifecycle.started(run.id, run.dispatch_token as string, event.native_run_id).then(() => {});
          if (event.type === "text_snapshot") output = event.text;
        } });
        await accepted;
        expect(terminal).toMatchObject({ status: "succeeded" });
        expect(output).toContain(privateFacts[index]);
        expect(output).toContain(lane.thread.id);
        expect(output).not.toContain(privateFacts[1 - index]);
        const recorded = await f.store.get("run", run.id);
        expect(recorded.product_tools).toContain("ngertiin.read_run_context");
        await f.lifecycle.settle(run.id, run.dispatch_token, "succeeded");
        (observations.lanes as unknown[]).push({ actor: index + 1, inference: "passed", scoped_tool: "passed", private_marker: "passed", separate_home: true });
      } finally { lease.revoke(); }
    }
    for (const lane of lanes) await lane.client.close();
    await connections.revoke(current.id);
    await accounts.retire(current.id);
    new CredentialStorage(f.dir).retire(current.id);
    expect(() => credentials.create(current)).toThrow("AUTH_REJECTED");
    observations.disconnect = "passed; provider-side revocation is outside this local cleanup";
    save();
  } finally {
    save();
    await Promise.allSettled(clients.map((client) => client.close()));
    await accounts.close();
    await gateway.stop(true);
    await f.close();
  }
}, 650_000);
