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
  async catalog(_user: string, search: string) {
    const query = search.trim().toLowerCase();
    return {
      items: [
        { slug: "calendar", name: "Calendar fixture" },
        { slug: "mail", name: "Mail fixture" },
      ]
        .filter((item) => `${item.slug} ${item.name}`.toLowerCase().includes(query))
        .map((item) => ({
          ...item,
          connected: this.accountsCreated.some(
            (account) => account.toolkit === item.slug && account.active,
          ),
        })),
    };
  }
  async connect(_owner: string, toolkit: string) {
    const account_id = crypto.randomUUID();
    // Each Mail fixture pair requires an explicit reconnect; Calendar keeps its existing behavior.
    const active =
      toolkit !== "mail" ||
      this.accountsCreated.filter((account) => account.toolkit === toolkit).length % 2 === 1;
    this.accountsCreated.push({ id: account_id, toolkit, active });
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
if (!process.env.NGERTIIN_TEST_DATABASE_URL)
  throw new Error("Select a disposable PostgreSQL database with NGERTIIN_TEST_DATABASE_URL.");
const config = developmentConfig();
const store = await Store.open(config.database, config.owner_id, {
  connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
  schema: `test_web_${config.owner_id.replaceAll("-", "")}`,
});
const lifecycle = await Lifecycle.open(store);
const tools = await ProductTools.open(lifecycle, undefined, undefined, new FixtureApps());
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
const app = (
  await createApi(lifecycle, background, config.token, {
    connections: new Connections(lifecycle),
    tools,
    broker,
  })
).listen({ hostname: "127.0.0.1", port: config.port });
await background.start();
async function stop() {
  await app.stop(true);
  await background.stop();
  await broker.close();
  await tools.browsers.shutdown();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
