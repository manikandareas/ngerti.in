import { developmentConfig } from "./config";
import { Conversations } from "./conversations";
import { Lifecycle } from "./lifecycle";
import { Store } from "./store";

const config = developmentConfig();
const store = await Store.open(config.database, config.owner_id, {
  connectionString: config.databaseUrl,
  schema: config.databaseSchema,
});
const setup = await new Conversations(await Lifecycle.open(store)).setup();
await store.close();
console.log(
  JSON.stringify({
    event: "foundation.initialized",
    database: config.database,
    credentials_file: config.installationFile,
    ...setup,
  }),
);
