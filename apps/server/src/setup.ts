import { developmentConfig } from "./config";
import { Conversations } from "./conversations";
import { Lifecycle } from "./lifecycle";
import { Store } from "./store";

const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const setup = new Conversations(new Lifecycle(store)).setup();
store.close();
console.log(
  JSON.stringify({
    event: "foundation.initialized",
    database: config.database,
    credentials_file: config.installationFile,
    ...setup,
  }),
);
