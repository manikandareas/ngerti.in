import { developmentConfig } from "./config";
import { Store } from "./store";

const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
store.close();
console.log(
  JSON.stringify({
    event: "foundation.initialized",
    database: config.database,
    credentials_file: config.installationFile,
  }),
);
