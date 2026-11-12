import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

// Real API and PostgreSQL; no native executors. Queue/control UI checks do not claim inference.
if (!process.env.NGERTIIN_TEST_DATABASE_URL)
  throw new Error("Select a disposable PostgreSQL database with NGERTIIN_TEST_DATABASE_URL.");
const config = developmentConfig();
const store = await Store.open(config.database, config.owner_id, {
  connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
  schema: `test_web_${config.owner_id.replaceAll("-", "")}`,
});
const lifecycle = await Lifecycle.open(store);
const background = new Background(lifecycle);
const app = (await createApi(lifecycle, background, config.token)).listen({
  hostname: "127.0.0.1",
  port: config.port,
});
async function stop() {
  await app.stop();
  await store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
