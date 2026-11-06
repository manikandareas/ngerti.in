// Real adapters and provider inference; no external app effects or desktop input.

import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseEnv } from "node:util";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
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
const broker = new HarnessBroker(
  f.lifecycle,
  new CredentialContexts(f.dir),
  tools,
  { codex: new CodexAdapter(endpoint), muse: new MuseAdapter(endpoint) },
  runtime.detect,
);
const background = new Background(f.lifecycle, broker.executors());
app = createApi(f.lifecycle, background, "h".repeat(64), {
  connections: broker.connections,
  tools,
  broker,
  detect: runtime.detect,
});
const results: unknown[] = [];
try {
  await machines.ready();
  app.listen({ hostname: "127.0.0.1", port: 0 });
  background.start(100);
  for (const family of ["codex", "muse"] as const) {
    const credentialRef = crypto.randomUUID();
    const connection = broker.connections.create({
      harness: family,
      authentication:
        family === "codex"
          ? { method: "native_login", billing_source: "subscription" }
          : { method: "api_key", billing_source: "api_key", credential_ref: credentialRef },
    });
    if (family === "codex") {
      const db = new Database(".dev/harness-first/ngertiin.sqlite", { readonly: true });
      const source = db
        .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'")
        .all()
        .map((row) => JSON.parse(row.body))
        .find(
          (item) =>
            item.harness === family &&
            item.state === "active" &&
            item.authentication.method === "native_login",
        );
      db.close();
      assert(source);
      const destination = join(f.dir, "connections", connection.id, "codex");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyFileSync(
        join(".dev/harness-first/connections", source.id, "codex/auth.json"),
        join(destination, "auth.json"),
      );
      chmodSync(join(destination, "auth.json"), 0o600);
    } else {
      const env = parseEnv(readFileSync(".env", "utf8"));
      const secret = env.MUSE_API_KEY ?? env.META_API_KEY;
      assert(secret, "Explicit Muse API-key verification credential is missing.");
      mkdirSync(join(f.dir, "credentials"), { mode: 0o700 });
      writeFileSync(join(f.dir, "credentials", credentialRef), secret, { mode: 0o600 });
    }
    const availability = await runtime.detect(family);
    assert.equal(availability.state, "supported");
    const agent = f.lifecycle.create("agent", {
      name: `Machine proof ${family}`,
      harness: family,
      connection_id: connection.id,
      model_id: family === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
      reasoning: "medium",
      billing_source: family === "codex" ? "subscription" : "api_key",
    });
    const thread = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    async function turn(text: string) {
      const admitted = f.lifecycle.admit({ agent_id: agent.id, thread_id: thread.id, text });
      const deadline = Date.now() + 180_000;
      while (
        Date.now() < deadline &&
        !["succeeded", "failed", "unknown", "cancelled"].includes(
          f.store.get("run", admitted.run.id).status,
        )
      )
        await Bun.sleep(500);
      const run = f.store.get("run", admitted.run.id);
      const answer = f.store.answer(run.id)?.text ?? "";
      assert.equal(
        run.status,
        "succeeded",
        `${family} run ended ${run.status}: ${run.diagnostic?.code}`,
      );
      return { id: run.id, status: run.status, product_tools: run.product_tools, answer };
    }
    const first = await turn(
      "One-time interaction integration verification. Do not create goals, routines, memories, skills, files or change profiles. I want a greeting mentioning my city. Ask which city using ngertiin.ask_user with purpose=input, a plain question, no options or action. End this turn immediately after the tool. Do not repeat the question in a final answer.",
    );
    const request = f.store
      .list("human_request")
      .find((request) => request.source_run_id === first.id);
    assert(request, `${family} did not create a product-owned question`);
    const second = await turn(
      "Sebelum menjawab pertanyaan kota tadi, bahas hal lain dahulu: berapa 2 + 2? Cukup jawab hasilnya saja.",
    );
    assert.equal(
      f.store.get("human_request", request.id).state,
      "pending",
      "A new topic must leave the earlier question open",
    );
    const third = await turn("Sekarang lanjutkan sapaan tadi. Kotaku Makassar.");
    const resolved = f.store.get("human_request", request.id);
    assert.equal(resolved.state, "answered");
    assert.equal(resolved.continuation_run_id, third.id);
    assert.equal(f.store.list("run").filter((run) => run.thread_id === thread.id).length, 3);
    const result = {
      family,
      version: availability.version,
      billing: broker.connections.get(connection.id).effective_billing_source,
      request_id: request.id,
      turns: [first, second, third],
    };
    results.push(result);
    await Bun.write(
      "docs/verification/conversation-implementation-2026-11-06/native-interactions.json",
      JSON.stringify({ results }, null, 2),
    );
    console.log(JSON.stringify({ family, passed: true, turns: 3 }));
  }
} finally {
  await app.stop(true).catch(() => {});
  await background.stop();
  await broker.close();
  await machines.close();
  f.close();
}
