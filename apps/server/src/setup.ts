import { Authentication } from "./auth/service";
import { developmentConfig } from "./config";
import { Store } from "./store";

const config = developmentConfig();
const store = await Store.open(config.database, config.owner_id, {
  connectionString: config.databaseUrl,
  schema: config.databaseSchema,
});
try {
  const authentication = await Authentication.open(
    config.authentication,
    config.databaseUrl as string,
    config.owner_id,
  );
  await authentication.close();
  console.log(
    JSON.stringify({
      event: "application.initialized",
      state_directory: config.stateDir,
      authentication: "accounts",
      email_delivery: config.authentication.email.delivery,
    }),
  );
} finally {
  await store.close();
}
