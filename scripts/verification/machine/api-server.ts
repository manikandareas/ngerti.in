import { resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { developmentConfig } from "../../../apps/server/src/config";
import { Conversations } from "../../../apps/server/src/conversations";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { readMachineConfiguration } from "../../../apps/server/src/machines/config";
import { Machines } from "../../../apps/server/src/machines/service";
import { Store } from "../../../apps/server/src/store";

// Real Cua machine, API, SQLite and UI; no provider inference in this UI cohort.
const config = developmentConfig();
const store = new Store(config.database, config.owner_id);
const lifecycle = new Lifecycle(store);
const machineConfig = readMachineConfiguration(resolve(import.meta.dir, "../../../.dev/harness-first"));
if (!machineConfig) throw new Error("Run setup:machine before the native UI verification.");
const machines = new Machines(lifecycle, machineConfig);
new Conversations(lifecycle).setup();
await machines.recover();
const proofBytes = Buffer.from("Shared desktop working file.\n");
try { await machines.files().create("projects/desktop-check.txt", proofBytes); }
catch (error) { if (!(await machines.files().read("projects/desktop-check.txt")).equals(proofBytes)) throw error; }
const app = createApi(lifecycle, new Background(lifecycle), config.token).listen({ hostname: "127.0.0.1", port: config.port });
async function stop() { await app.stop(true); await machines.close(); store.close(); process.exit(0); }
process.on("SIGINT", stop); process.on("SIGTERM", stop);
