import { chmodSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import type { RoutingDecision } from "../../../apps/server/src/groups/router";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import type { HarnessAdapter, SessionIdentity } from "../../../apps/server/src/harness/client";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { unknownCapabilities } from "../../../apps/server/src/harness/contracts";
import { HarnessRuntime } from "../../../apps/server/src/harness/runtime";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

// Only model/protocol outcomes are fixtures. The API, runtime detection, journal and retry are real.
const config = developmentConfig();
const executable = join(config.stateDir, "fixture-codex");
let uncertain = false;
let decisions = 0;
let mode: "reviewing" | "clarification" | null = null;
let release: (() => void) | null = null;
function version(ready: boolean) {
  writeFileSync(
    `${executable}.next`,
    `#!/bin/sh\necho 'codex-cli ${ready ? "0.166.0" : "0.136.0"}'\n`,
  );
  chmodSync(`${executable}.next`, 0o700);
  renameSync(`${executable}.next`, executable);
}
version(false);
const runtime = new HarnessRuntime({ codex: executable });
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store, {
  async choose(packet, _signal, observe): Promise<RoutingDecision> {
    decisions++;
    if (mode === "reviewing") {
      const request = { private_policy: "PRIVATE_REVIEW_CANARY", state: packet.request };
      observe?.({ phase: "reviewing", request });
      await new Promise<void>((resolve) => {
        release = resolve;
      });
      return {
        agent_id: packet.members[0].agent_id,
        model: "fixture",
        confidence: 1,
        probabilities: { selected: 1 },
        input_tokens: 10,
      };
    }
    return {
      agent_id: null,
      model: "jev-1.14.0",
      confidence: 0.16,
      probabilities: { unresolved: 1 },
      input_tokens: 20,
    };
  },
});
const tools = new ProductTools(lifecycle);
const adapter: HarnessAdapter = {
  harness: "codex",
  async connect(context) {
    let identity: SessionIdentity = { native_session_id: crypto.randomUUID() };
    return {
      async inspect() {
        return {
          login: "authenticated",
          account_id: "fixture-account",
          auth_method: "native_login",
          billing_source: "subscription",
          capabilities: {
            ...unknownCapabilities,
            resume: "supported",
            settings: "supported",
            product_tools: "supported",
          },
        };
      },
      async discoverModels() {
        return [{ id: "fixture", reasoning: [] }];
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
      async prompt(input) {
        const native_run_id = crypto.randomUUID();
        input.onEvent({ type: "accepted", ...identity, native_run_id });
        if (uncertain && context.purpose === "routing")
          return { status: "unknown", ...identity, native_run_id };
        const packet =
          context.purpose === "routing"
            ? JSON.parse(input.text.slice(input.text.indexOf("\n") + 1))
            : null;
        input.onEvent({
          type: "text",
          text: packet
            ? JSON.stringify(
                mode === "clarification"
                  ? {
                      unresolved: true,
                      question: "Anggota mana yang kamu maksud untuk permintaan ini?",
                    }
                  : { agent_id: packet.members[0].agent_id },
              )
            : "Fixture routed answer.",
        });
        return { status: "succeeded", ...identity, native_run_id };
      },
    };
  },
};
const broker = new HarnessBroker(
  lifecycle,
  new CredentialContexts(config.stateDir),
  tools,
  { codex: adapter },
  runtime.detect,
);
const background = new Background(lifecycle, broker.executors());
const app = createApi(lifecycle, background, config.token, {
  broker,
  tools,
  connections: broker.connections,
  detect: runtime.detect,
})
  .post("/v1/verification/runtime", ({ body }) => {
    const input = body as { ready: boolean; unknown?: boolean; mode?: typeof mode };
    mode = input.mode ?? null;
    if (mode !== "reviewing") {
      release?.();
      release = null;
    }
    uncertain = !!input.unknown;
    version(input.ready);
    background.tick();
    return { decisions };
  })
  .get("/v1/verification/runtime", () => ({ decisions }))
  .listen({ hostname: "127.0.0.1", port: config.port });
background.start(100);
async function stop() {
  await app.stop(true);
  await background.stop();
  await broker.close();
  await tools.browsers.shutdown();
  store.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
