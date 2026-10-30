import { createApi } from "./api";
import { Background } from "./background";
import { developmentConfig } from "./config";
import { HarnessBroker } from "./harness/broker";
import { CodexAccounts } from "./harness/codex/accounts";
import { CodexAdapter } from "./harness/codex/adapter";
import { CredentialContexts } from "./harness/context";
import { ProductTools } from "./harness/tools";
import { Lifecycle } from "./lifecycle";
import { Store } from "./store";

const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store);
const tools = new ProductTools(lifecycle, (scope, name) => {
  console.log(
    JSON.stringify({
      event: "product_tool.completed",
      run_id: scope.run_id,
      thread_id: scope.thread_id,
      agent_id: scope.agent_id,
      name,
    }),
  );
});
const credentials = new CredentialContexts(config.stateDir);
const broker = new HarnessBroker(
  lifecycle,
  credentials,
  tools,
  {
    codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
  },
  undefined,
  (runId, event, outcome) => {
    if (event.type === "text")
      lifecycle.appendAnswer(runId, event.text, outcome === "succeeded" ? "complete" : "partial");
  },
);
const accounts = new CodexAccounts(broker.connections, credentials);
const background = new Background(lifecycle, broker.executors(), (code) =>
  console.error(JSON.stringify({ event: "background.error", code })),
);
const app = createApi(lifecycle, background, config.token, {
  connections: broker.connections,
  tools,
  broker,
  accounts,
});
try {
  app.listen({ hostname: "127.0.0.1", port: config.port });
  background.start();
} catch (error) {
  store.close();
  throw error;
}
console.log(
  JSON.stringify({
    event: "foundation.started",
    url: `http://127.0.0.1:${app.server?.port}`,
    credentials_file: config.installationFile,
    registered_executors: background.executorCount,
    api_readiness_gate: "pending",
  }),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.stop();
  await background.stop();
  await broker.close();
  await accounts.close();
  store.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
