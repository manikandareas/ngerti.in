import { Lifecycle } from "../../src/lifecycle";
import { Store } from "../../src/store";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing disposable probe setting: ${name}`);
  return value;
};
const store = await Store.open(required("PROBE_STATE"), required("PROBE_OWNER"), {
  connectionString: required("NGERTIIN_TEST_DATABASE_URL"),
  schema: required("PROBE_SCHEMA"),
});
const lifecycle = await Lifecycle.open(store);
const run = await lifecycle.claimNext(required("PROBE_THREAD"), required("PROBE_AGENT"));
if (!run?.dispatch_token) throw new Error("Probe run was not claimed.");
await lifecycle.started(run.id, run.dispatch_token, "crash-native");
process.stdout.write("ready\n");
setInterval(() => {}, 1000);
