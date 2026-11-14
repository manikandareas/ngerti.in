import { expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import type { Entity } from "../../../apps/server/src/contracts";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { CredentialStorage } from "../../../apps/server/src/harness/credential-storage";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { MuseClient } from "../../../apps/server/src/harness/muse/client";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { fixture } from "../../../apps/server/tests/helpers";

test.skipIf(process.env.NGERTIIN_NMA077_MUSE_PROBE !== "1")("selected Muse API key remains encrypted at rest and works in a private native home", async () => {
  const project = resolve(import.meta.dir, "../../..");
  const environment = parseEnv(readFileSync(join(project, ".env"), "utf8"));
  const key = environment.MUSE_API_KEY ?? environment.META_API_KEY;
  if (!key) throw new Error("The explicitly selected Muse API key is unavailable.");
  const f = await fixture();
  const keyFile = join(f.dir, "operator-key");
  writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
  const storage = new CredentialStorage(f.dir, keyFile);
  const reference = storage.write(key, true);
  const credentials = new CredentialContexts(f.dir, (reference) => storage.read(reference, true));
  const connections = new Connections(f.lifecycle);
  const tools = await ProductTools.open(f.lifecycle);
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const result = await tools.rpc((request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""), await request.json());
    return result === null ? new Response(null, { status: 202 }) : Response.json(result);
  } });
  let client: MuseClient | undefined;
  try {
    const runtime = new HarnessRuntime({ muse: join(project, ".dev/nma050/muse") });
    const available = await runtime.detect("muse");
    expect(available.state).toBe("supported");
    const connection = await connections.create({ harness: "muse", authentication: { method: "api_key", billing_source: "api_key", credential_ref: reference } });
    const agent = await f.lifecycle.createAgent({ name: "Private Muse", harness: "muse", connection_id: connection.id, model_id: "muse-spark-1.3", billing_source: "api_key" });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] }) as Entity<"thread">;
    const launch = credentials.create(connection, { organization_id: crypto.randomUUID(), actor_id: crypto.randomUUID(), agent_id: agent.id, thread_id: thread.id, generation: 1 });
    client = await new MuseAdapter(() => `http://127.0.0.1:${server.port}`).connect({ ...launch, executable: available.executable as string, connection_id: connection.id, agent_id: agent.id, thread_id: thread.id, model_id: "muse-spark-1.3", instructions: "Use the scoped ngertiin.read_run_context tool when requested." });
    const observed = await client.inspect();
    expect(observed.billing_source).toBe("api_key");
    expect(observed.login).toBe("authenticated");
    await connections.update(connection, { login: observed.login, account_id: observed.account_id, effective_billing_source: observed.billing_source, capabilities: observed.capabilities });
    const models = await client.discoverModels();
    expect(models.some((model) => model.id === "muse-spark-1.3")).toBe(true);
    const selected = { model_id: "muse-spark-1.3", reasoning: "medium" };
    const identity = await client.start(selected);
    await f.lifecycle.bind(thread.id, agent.id, identity.native_session_id);
    const marker = crypto.randomUUID();
    const admitted = await f.lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text: `Call ngertiin.read_run_context with empty arguments. Reply with its thread_id and this private marker: ${marker}. Do not create a Goal or Routine.` });
    const run = await f.lifecycle.claimNext(thread.id, agent.id);
    if (!run?.dispatch_token) throw new Error("The verification run was not claimed.");
    let accepted = Promise.resolve();
    const lease = await tools.issue(run, () => accepted);
    let answer = "";
    const command = client.transport.connection.command.bind(client.transport.connection);
    client.transport.connection.command = async (...args) => {
      try { return await command(...args); } catch (error) {
        console.log(JSON.stringify({ event: "native_probe_rejection", method: args[0], message: launch.redactor.text(error instanceof Error ? error.message : "Unknown native rejection") }));
        throw error;
      }
    };
    const terminal = await client.prompt({ identity, run_id: run.id, text: admitted.message.text, settings: selected, tools: lease, signal: AbortSignal.timeout(180_000), onEvent(event) {
      if (event.type === "accepted") accepted = f.lifecycle.started(run.id, run.dispatch_token as string, event.native_run_id).then(() => {});
      if (event.type === "text_snapshot") answer = event.text;
      if (event.type === "text") answer += event.text;
    } });
    await accepted;
    lease.revoke();
    expect(terminal).toMatchObject({ status: "succeeded" });
    expect(answer).toContain(marker);
    expect(answer).toContain(thread.id);
    expect((await f.store.get("run", run.id)).product_tools).toContain("ngertiin.read_run_context");
    await client.close();
    const files = (directory: string): string[] => readdirSync(directory).flatMap((name) => { const path = join(directory, name); return statSync(path).isDirectory() ? files(path) : [path]; });
    expect(files(join(f.dir, "connections")).filter((file) => readFileSync(file).includes(Buffer.from(key))).length).toBe(0);
    const report = { scope: "native API-key adapter proof with a controlled fixture principal", version: available.version, login: true, catalog: true, inference: true, scoped_tool: true, key_present_in_native_files: false, billing: "api_key", subscription: "unverified" };
    if (process.env.NGERTIIN_NMA077_MUSE_REPORT) writeFileSync(process.env.NGERTIIN_NMA077_MUSE_REPORT, `${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await client?.close();
    await server.stop(true);
    await f.close();
  }
}, 240_000);
