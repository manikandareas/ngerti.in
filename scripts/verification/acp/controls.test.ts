import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { Background } from "../../../apps/server/src/background";
import { AcpAdapter } from "../../../apps/server/src/harness/acp/adapter";
import { manifests } from "../../../apps/server/src/harness/availability";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { HarnessError } from "../../../apps/server/src/harness/contracts";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { fixture } from "../../../apps/server/tests/helpers";
import { fixtureApi } from "../../../apps/server/tests/http-fixture";
import { retainedCodex, selectedPiSumopod } from "./native-credentials";

async function deadline<T>(promise: Promise<T>, milliseconds = 90_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Native control observation timed out.")),
          milliseconds,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

test.skipIf(process.env.NGERTIIN_ACP_NATIVE_CONTROLS !== "1")(
  "native ACP preserves negotiated steering or FIFO, confirms cancellation and returns its self-stop tool receipt",
  async () => {
    const root = resolve(import.meta.dir, "../../..");
    const harness = process.env.NGERTIIN_ACP_NATIVE_CONTROL_PROFILE === "pi" ? "pi" : "codex";
    const configuration = harness === "pi" ? selectedPiSumopod() : undefined;
    const reference = crypto.randomUUID();
    const output = join(root, ".dev/acp-native");
    mkdirSync(output, { recursive: true, mode: 0o700 });
    const report: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      harness,
      adapter: configuration ? "0.0.34" : "2.6.0",
      runtime: configuration ? "1.5.2" : "0.169.0",
      sdk: "2.7.0",
      scope:
        "disposable owner-mode PostgreSQL; owner-selected harness credential; real HTTP ProductTools and ACP controls; an HTTP barrier holds read_run_context only for deterministic control timing",
      completed: false,
    };
    const save = () =>
      Bun.write(join(output, `${harness}-controls.json`), `${JSON.stringify(report, null, 2)}\n`);
    const tokens = configuration ? undefined : await retainedCodex();
    const f = await fixture();
    let app: Awaited<ReturnType<typeof fixtureApi>> | undefined;
    let gate: { reached(): void; wait: Promise<void>; release(): void } | undefined;
    const relay = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (gate && request.method === "POST") {
          const frame = (await request.clone().json()) as {
            method?: string;
            params?: { name?: string };
          };
          if (frame.method === "tools/call" && frame.params?.name === "ngertiin.read_run_context") {
            const held = gate;
            held.reached();
            await held.wait;
          }
        }
        return app ? app.handle(request) : new Response(null, { status: 503 });
      },
    });
    const calls: { name: string; status: string; cancellation: string }[] = [];
    const tools = await ProductTools.open(f.lifecycle, async (scope, name) => {
      const current = await f.store.get("run", scope.run_id);
      calls.push({ name, status: current.status, cancellation: current.cancellation });
    });
    const credentials = new CredentialContexts(f.dir, id => {
      if (!configuration || id !== reference) throw new HarnessError("CREDENTIAL_MISSING");
      return JSON.stringify(configuration);
    });
    credentials.codexTokens = async (_id, refresh) => {
      if (refresh || !tokens) throw new HarnessError("AUTH_REJECTED");
      return tokens;
    };
    const binaries = join(import.meta.dir, "runtime/node_modules/.bin");
    const available = configuration ? await new HarnessRuntime().detect("pi") : {
      harness: "codex" as const,
      executable: join(binaries, "codex-acp"),
      state: "supported" as const,
      version: "2.6.0",
      manifest: manifests.codex,
    };
    expect(available.state).toBe("supported");
    const adapter = new AcpAdapter(
      harness,
      () => `http://127.0.0.1:${relay.port}/v1/harness/tools`,
      configuration ? { native_pi: join(dirname(available.executable!), "pi") } : { native_codex: join(binaries, "codex") },
    );
    const broker = new HarnessBroker(
      f.lifecycle,
      credentials,
      tools,
      { [harness]: adapter },
      async () => available,
    );
    const background = new Background(f.lifecycle, broker.executors());
    const connections = new Connections(f.lifecycle);
    const connection = await connections.create({
      harness,
      ...(configuration ? { provider_id: "sumopod" } : {}),
      authentication: configuration
        ? { method: "harness_config", billing_source: "api_key", credential_ref: reference }
        : { method: "native_login", billing_source: "subscription" },
    });
    const agent = await f.lifecycle.createAgent({
      name: "Native controls",
      harness,
      connection_id: connection.id,
      model_id: configuration ? "sumopod/deepseek-v4-flash" : "gpt-6.1-sol",
    });
    const thread = await f.lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const token = "control-verification-".repeat(4);
    const post = async (path: string, body = {}) => {
      if (!app?.server) throw new Error("Verification API unavailable.");
      const response = await fetch(`http://127.0.0.1:${app.server.port}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      expect(response.status, JSON.stringify(result)).toBe(200);
      return result;
    };
    const admit = (text: string) =>
      f.lifecycle.admit({ thread_id: thread.id, agent_id: agent.id, text });
    const heldRun = async () => {
      let arrived: () => void = () => {};
      let release: () => void = () => {};
      const reached = new Promise<void>((resolve) => {
        arrived = resolve;
      });
      const wait = new Promise<void>((resolve) => {
        release = resolve;
      });
      gate = { reached: arrived, wait, release };
      const admitted = await admit(
        "Call ngertiin.read_run_context with empty arguments, then say Done. Do not create a Goal or Routine. Do not use host tools.",
      );
      await background.tick();
      await deadline(reached, 60_000);
      const current = await f.store.get("run", admitted.run.id);
      expect(current.status).toBe("running");
      expect(current.native_run_id).toBeNull();
      return current;
    };
    try {
      app = (
        await fixtureApi(f.lifecycle, background, token, { tools, broker, connections })
      ).listen({ hostname: "127.0.0.1", port: 0 });
      const active = await heldRun();
      const inventories = await f.store.list("harness_inventory", {
        binding_id: active.binding_id,
      });
      if (!configuration) expect(inventories.some((value) => value.native_state === "supported")).toBe(true);
      const marker = `STEER-${crypto.randomUUID()}`;
      const correction = await admit(
        `Change the final answer: reply only with ${marker}. Do not call another tool.`,
      );
      const steering = await deadline(
        post(`/v1/runs/${active.id}/steer`, { queued_run_id: correction.run.id }),
        30_000,
      );
      expect(steering.state).toBe(configuration ? "rejected" : "accepted");
      if (configuration) expect(steering.error_code).toBe("CAPABILITY_UNSUPPORTED");
      gate?.release();
      gate = undefined;
      await deadline(background.idle());
      const steered = await f.store.get("run", active.id);
      expect(steered.status).toBe("succeeded");
      if (configuration) {
        expect((await f.store.get("run", correction.run.id)).status).toBe("queued");
        await background.tick();
        await deadline(background.idle());
        expect((await f.store.get("run", correction.run.id)).status).toBe("succeeded");
        expect((await f.store.answer(correction.run.id))?.text).toContain(marker);
      } else {
        expect((await f.store.get("run", correction.run.id)).status).toBe("steered");
        expect((await f.store.answer(active.id))?.text).toContain(marker);
      }
      report.steering = {
        state: steering.state,
        native_run_id: steered.native_run_id,
        dispatch_receipt: !!steered.native_dispatch_id,
        original_run: steered.status,
        queued_run: configuration ? "succeeded via FIFO" : "steered",
        correction_in_answer: true,
      };
      await save();

      const cancelling = await heldRun();
      await post(`/v1/runs/${cancelling.id}/cancel`);
      const intent = await f.store.get("run", cancelling.id);
      report.cancellation_intent = { status: intent.status, cancellation: intent.cancellation };
      expect(intent.cancellation).toBe("requested");
      gate?.release();
      gate = undefined;
      await background.tick();
      await deadline(background.idle());
      const cancelled = await f.store.get("run", cancelling.id);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancellation).toBe("confirmed");
      report.cancellation = {
        status: cancelled.status,
        cancellation: cancelled.cancellation,
        timings: cancelled.timings,
      };
      await save();

      calls.length = 0;
      const self = await admit(
        `Call ngertiin.cancel_run now with command_id ${crypto.randomUUID()} to stop this current run. Do not create a Goal or Routine. Do not use host tools.`,
      );
      await background.start(100);
      await deadline(
        (async () => {
          while ((await f.store.get("run", self.run.id)).status !== "cancelled")
            await Bun.sleep(50);
        })(),
      );
      await deadline(background.idle());
      const stopped = await f.store.get("run", self.run.id);
      expect(stopped.product_tools).toContain("ngertiin.cancel_run");
      expect(stopped.cancellation).toBe("confirmed");
      expect(calls).toContainEqual({
        name: "ngertiin.cancel_run",
        status: "cancel_requested",
        cancellation: "requested",
      });
      report.self_stop = {
        status: stopped.status,
        cancellation: stopped.cancellation,
        product_tools: stopped.product_tools,
        receipt_observations: calls,
      };
      report.completed = true;
    } catch (error) {
      report.failure = error instanceof Error ? error.name : "Unknown failure";
      report.runs = (await f.store.list("run")).map((run) => ({
        status: run.status,
        diagnostic: run.diagnostic,
        product_tools: run.product_tools,
      }));
      throw error;
    } finally {
      gate?.release();
      await save();
      await background.stop(100);
      await broker.close();
      await relay.stop(true);
      await app?.stop(true);
      await f.close();
    }
  },
  300_000,
);
