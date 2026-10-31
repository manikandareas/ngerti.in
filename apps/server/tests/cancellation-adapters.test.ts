import { expect, test } from "bun:test";
import { join } from "node:path";
import { createApi } from "../src/api";
import { Background } from "../src/background";
import { manifests } from "../src/harness/availability";
import { HarnessBroker } from "../src/harness/broker";
import { CodexAdapter } from "../src/harness/codex/adapter";
import { Connections } from "../src/harness/connections";
import { CredentialContexts } from "../src/harness/context";
import { MuseAdapter } from "../src/harness/muse/adapter";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

for (const harness of ["codex", "muse"] as const) {
  test(`${harness} protocol fixture returns a self-cancel receipt and waits for native confirmation`, async () => {
    const f = fixture();
    const connection = new Connections(f.lifecycle).create({
      harness,
      authentication: { method: "native_login", billing_source: "subscription" },
    });
    const agent = f.lifecycle.createAgent({
      name: "Control fixture",
      harness,
      connection_id: connection.id,
      model_id: "model-a",
      reasoning: "high",
    });
    const thread = f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const goal = f.lifecycle.create("goal", {
      agent_id: agent.id,
      thread_id: thread.id,
      title: "Keep this responsibility active",
    });
    const calls: { name: string; status: string; cancellation: string }[] = [];
    const tools = new ProductTools(f.lifecycle, (scope, name) => {
      const run = f.store.get("run", scope.run_id);
      calls.push({ name, status: run.status, cancellation: run.cancellation });
    });
    let app: ReturnType<typeof createApi>;
    const base = () => `http://127.0.0.1:${app.server?.port}`;
    const broker = new HarnessBroker(
      f.lifecycle,
      new CredentialContexts(f.dir),
      tools,
      {
        codex: new CodexAdapter(
          () => `${base()}/v1/harness/tools`,
          [join(import.meta.dir, "fixtures/codex-app-server.ts")],
        ),
        muse: new MuseAdapter(
          () => `${base()}/v1/harness/tools`,
          [join(import.meta.dir, "fixtures/muse-serve.ts")],
        ),
      },
      async (family) => ({
        harness: family,
        executable: process.execPath,
        version: manifests[family].minimum_version,
        state: "supported",
        manifest: manifests[family],
      }),
    );
    const background = new Background(f.lifecycle, broker.executors());
    const token = "cancel-fixture-".repeat(5);
    app = createApi(f.lifecycle, background, token, {
      tools,
      broker,
      connections: broker.connections,
    }).listen({ hostname: "127.0.0.1", port: 0 });
    async function api(path: string, body: unknown) {
      const response = await fetch(base() + path, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(200);
      return response.json();
    }
    try {
      const input = `product-tool:${JSON.stringify({ name: "ngertiin.cancel_run", arguments: { command_id: crypto.randomUUID() } })}`;
      const admitted = await api("/v1/runs", {
        agent_id: agent.id,
        thread_id: thread.id,
        goal_id: goal.id,
        text: harness === "codex" ? "stream-wait" : input,
      });
      background.start(100);
      if (harness === "codex") {
        const deadline = Date.now() + 3000;
        while (f.store.get("run", admitted.run.id).status !== "running" && Date.now() < deadline)
          await Bun.sleep(5);
        expect(f.store.get("run", admitted.run.id).status).toBe("running");
        const steered = await api(`/v1/runs/${admitted.run.id}/steer`, { text: input });
        expect(steered.state).toBe("accepted");
      }
      const deadline = Date.now() + 3000;
      while (f.store.get("run", admitted.run.id).status !== "cancelled" && Date.now() < deadline)
        await Bun.sleep(5);
      expect(calls).toEqual([
        { name: "ngertiin.cancel_run", status: "cancel_requested", cancellation: "requested" },
      ]);
      expect(f.store.get("run", admitted.run.id)).toMatchObject({
        status: "cancelled",
        cancellation: "confirmed",
        product_tools: ["ngertiin.cancel_run"],
      });
      expect(f.store.get("goal", goal.id).state).toBe("active");
      await background.idle();
    } finally {
      await background.stop(100);
      await broker.close();
      await app.stop();
      f.close();
    }
  });
}
