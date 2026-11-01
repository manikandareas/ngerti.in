import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

// Real API and SQLite; no native executors. Queue/control UI checks do not claim inference.
const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store);
const background = new Background(lifecycle);
const app = createApi(lifecycle, background, config.token).listen({
  hostname: "127.0.0.1",
  port: config.port,
});
async function stop() {
  await app.stop();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
