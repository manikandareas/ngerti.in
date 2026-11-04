import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseEnv } from "node:util";
import { Database } from "bun:sqlite";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { Machines } from "../../../apps/server/src/machines/service";
import { fixture } from "../../../apps/server/tests/helpers";

const f = fixture();
const machines = new Machines(f.lifecycle, readMachineConfiguration(".dev/harness-first"));
const tools = new ProductTools(f.lifecycle);
const runtime = new HarnessRuntime({ muse: resolve(".dev/nma050/muse") });
let app: ReturnType<typeof createApi>;
const endpoint = () => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`;
const broker = new HarnessBroker(f.lifecycle, new CredentialContexts(f.dir), tools, { codex: new CodexAdapter(endpoint), muse: new MuseAdapter(endpoint) }, runtime.detect);
const background = new Background(f.lifecycle, broker.executors());
app = createApi(f.lifecycle, background, "h".repeat(64), { connections: broker.connections, tools, broker, detect: runtime.detect });
const results: unknown[] = [];
try {
  await machines.ready();
  app.listen({ hostname: "127.0.0.1", port: 0 });
  background.start(100);
  for (const family of ["codex", "muse"] as const) {
    const credentialRef = crypto.randomUUID();
    const connection = broker.connections.create({ harness: family, authentication: family === "codex" ? { method: "native_login", billing_source: "subscription" } : { method: "api_key", billing_source: "api_key", credential_ref: credentialRef } });
    if (family === "codex") {
      const db = new Database(".dev/harness-first/ngertiin.sqlite", { readonly: true });
      const source = db.query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'").all().map((row) => JSON.parse(row.body)).find((item) => item.harness === family && item.state === "active" && item.authentication.method === "native_login");
      db.close(); assert(source);
      const destination = join(f.dir, "connections", connection.id, "codex");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyFileSync(join(".dev/harness-first/connections", source.id, "codex/auth.json"), join(destination, "auth.json"));
      chmodSync(join(destination, "auth.json"), 0o600);
    } else {
      const env = parseEnv(readFileSync(".env", "utf8"));
      const secret = env.MUSE_API_KEY ?? env.META_API_KEY; assert(secret, "Explicit Muse API-key verification credential is missing.");
      mkdirSync(join(f.dir, "credentials"), { mode: 0o700 });
      writeFileSync(join(f.dir, "credentials", credentialRef), secret, { mode: 0o600 });
    }
    const availability = await runtime.detect(family); assert.equal(availability.state, "supported");
    const agent = f.lifecycle.create("agent", { name: `Machine proof ${family}`, harness: family, connection_id: connection.id, model_id: family === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3", reasoning: "medium", billing_source: family === "codex" ? "subscription" : "api_key" });
    const thread = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const path = `.ngertiin-verification/harness-${crypto.randomUUID()}.txt`;
    const marker = `MACHINE-${crypto.randomUUID()}`;
    const admitted = f.lifecycle.admit({ agent_id: agent.id, thread_id: thread.id, text: `One-time integration verification. Do not create goals, routines, memories, skills or change profiles. Use ngertiin.machine_exec to run a Linux shell command that writes exactly ${marker} into ${path} relative to /home/cua/workspace. Read that file using ngertiin.read_file to confirm its bytes. Call ngertiin.computer_call with name get_desktop_state and empty arguments to inspect the provided desktop. Then reply with the marker and the OS name from the shell. Do not use host shell or host file tools. If any operation fails report it. Use fresh UUID command_id values.` });
    const runId = admitted.run.id;
    const deadline = Date.now() + 240_000;
    while (Date.now() < deadline && !["succeeded", "failed", "unknown", "cancelled"].includes(f.store.get("run", runId).status)) await Bun.sleep(500);
    const run = f.store.get("run", runId);
    const answer = f.store.list("message").find((item) => item.run_id === runId && item.author === "agent")?.text;
    const finalConnection = broker.connections.get(connection.id);
    const result = { family, version: availability.version, run_status: run.status, diagnostic: run.diagnostic, product_tools: run.product_tools, native_tools: run.native_tools, billing: finalConnection.effective_billing_source, answer, path };
    results.push(result);
    await Bun.write("docs/verification/shared-machine/harnesses.json", JSON.stringify({ results }, null, 2));
    console.log(JSON.stringify(result));
    assert.equal(run.status, "succeeded");
    assert(run.product_tools.includes("ngertiin.machine_exec"));
    assert(run.product_tools.includes("ngertiin.read_file"));
    assert(run.product_tools.includes("ngertiin.computer_call"));
    assert.equal((await machines.files().read(path)).toString().trim(), marker);
    assert(answer?.includes(marker));
    assert.equal(finalConnection.effective_billing_source, family === "codex" ? "subscription" : "api_key");
    assert(!run.native_tools.some((tool) => /shell|exec|write|patch/.test(tool.name)));
  }
} finally {
  await app.stop(true).catch(() => {});
  await background.stop();
  await broker.close();
  await machines.close();
  f.close();
}
