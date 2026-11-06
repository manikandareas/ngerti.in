import { resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { Conversations } from "../../../apps/server/src/conversations";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { Machines } from "../../../apps/server/src/machines/service";
import { Store } from "../../../apps/server/src/store";
import { fixtureAdapter } from "../nma062/fixture-harness";

// Real Cua machine, API, SQLite and UI; no provider inference in this UI cohort.
const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store);
const machineConfig = readMachineConfiguration(
  resolve(import.meta.dir, "../../../.dev/harness-first"),
);
if (!machineConfig) throw new Error("Run setup:machine before the native UI verification.");
const machines = new Machines(lifecycle, machineConfig);
new Conversations(lifecycle).setup();
await machines.recover();
const proofBytes = Buffer.from("Shared desktop working file.\n");
try {
  await machines.files().create("projects/desktop-check.txt", proofBytes);
} catch (error) {
  if (!(await machines.files().read("projects/desktop-check.txt")).equals(proofBytes)) throw error;
}
const tools = new ProductTools(lifecycle);
const adapter = fixtureAdapter(tools);
const connect = adapter.connect.bind(adapter);
adapter.connect = async (context) => {
  const client = await connect(context);
  const prompt = client.prompt.bind(client);
  client.prompt = async (input) => {
    if (input.text !== "fixture computer live") return prompt(input);
    const nativeRunId = crypto.randomUUID();
    const nativeSessionId = lifecycle.store.get(
      "binding",
      input.tools.scope.binding_id,
    ).native_session_id;
    input.onEvent({
      type: "accepted",
      native_session_id: nativeSessionId,
      native_run_id: nativeRunId,
    });
    // Inference is a fixture; machine authorization, observation, activity and video are real.
    await tools.call(input.tools.token, input.tools.scope, "ngertiin.computer_call", {
      command_id: crypto.randomUUID(),
      name: "get_desktop_state",
      arguments: {},
    });
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 18_000);
      input.signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    });
    input.onEvent({ type: "text", text: "Computer observation finished." });
    return { status: "succeeded", native_session_id: nativeSessionId, native_run_id: nativeRunId };
  };
  return client;
};
const broker = new HarnessBroker(
  lifecycle,
  new CredentialContexts(config.stateDir),
  tools,
  { codex: adapter },
  async (harness) => ({
    harness,
    state: "supported",
    version: "0.166.0",
    executable: "fixture",
    manifest: (await import("../../../apps/server/src/harness/availability")).manifests[harness],
  }),
);
const background = new Background(lifecycle, broker.executors());
const app = createApi(lifecycle, background, config.token, {
  connections: broker.connections,
  tools,
  broker,
}).listen({ hostname: "127.0.0.1", port: config.port });
background.start();
async function stop() {
  await app.stop(true);
  await background.stop();
  await broker.close();
  await machines.close();
  store.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
