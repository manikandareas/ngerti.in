import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Connections } from "../../../apps/server/src/harness/connections";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { manifests } from "../../../apps/server/src/harness/availability";
import type { AppHost } from "../../../apps/server/src/integrations/host";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";
import { fixtureAdapter } from "./fixture-harness";

/** Deterministic external app-provider boundary; all HTTP/domain/storage/browser services are real. */
class FixtureApps implements AppHost {
  accountsCreated: { id: string; toolkit: string; active: boolean }[] = [];
  async catalog() {
    return { items: [{ slug: "calendar", name: "Calendar fixture", connected: false }] };
  }
  async connect(_owner: string, toolkit: string) {
    const account_id = crypto.randomUUID();
    this.accountsCreated.push({ id: account_id, toolkit, active: true });
    return { account_id, connect_url: "https://example.invalid/fixture-connect" };
  }
  async accounts() {
    return this.accountsCreated;
  }
  async session() {
    return "fixture-app-session";
  }
  async search() {
    return [
      {
        slug: "CALENDAR_LIST_EVENTS",
        toolkit: "calendar",
        description: "Read upcoming calendar events",
      },
    ];
  }
  async execute(
    _session: string,
    _account: string,
    _tool: string,
    _arguments: Record<string, unknown>,
    authorize: () => void,
  ) {
    authorize();
    return {
      data: { events: [] },
      state: "succeeded" as const,
      log_id: "fixture-provider-receipt",
    };
  }
}
const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store);
const tools = new ProductTools(lifecycle, undefined, undefined, new FixtureApps());
const broker = new HarnessBroker(
  lifecycle,
  new CredentialContexts(config.stateDir),
  tools,
  { codex: fixtureAdapter(tools) },
  async (harness) => ({
    harness,
    state: "supported",
    executable: "fixture",
    version: "0.166.0",
    manifest: manifests[harness],
  }),
);
const background = new Background(lifecycle, broker.executors());
const app = createApi(lifecycle, background, config.token, {
  connections: new Connections(lifecycle),
  tools,
  broker,
}).listen({ hostname: "127.0.0.1", port: config.port });
background.start();
async function stop() {
  await app.stop(true);
  await background.stop();
  await broker.close();
  await tools.browsers.shutdown();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
