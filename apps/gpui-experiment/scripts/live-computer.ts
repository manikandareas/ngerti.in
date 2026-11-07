/** Optional read-only viewer probe. No scheduler, harness executor or machine startup. */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createApi } from "../../server/src/api";
import { Background } from "../../server/src/background";
import { Lifecycle } from "../../server/src/lifecycle";
import { Store } from "../../server/src/store";
import { Machines } from "../../server/src/machines/service";
import { readMachineConfiguration } from "../../server/src/machines/config";

const repository = resolve(import.meta.dir, "../../..");
const config = readMachineConfiguration(
  process.env.NGERTIIN_GPUI_MACHINE_STATE ?? join(repository, ".dev/harness-first"),
);
if (!config) throw new Error("No configured retained machine. This probe never provisions one.");
const scratch = mkdtempSync(join(tmpdir(), "ngertiin-gpui-viewer-"));
const store = new Store(join(scratch, "viewer.sqlite"), crypto.randomUUID());
const lifecycle = new Lifecycle(store);
new Machines(lifecycle, config);
const background = new Background(lifecycle);
const token = crypto.randomUUID() + crypto.randomUUID();
const app = createApi(lifecycle, background, token).listen({ hostname: "127.0.0.1", port: 0 });
const origin = `http://127.0.0.1:${app.server!.port}`;
try {
  const response = await fetch(`${origin}/v1/machine/view`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ interactive: false }),
    signal: AbortSignal.timeout(20_000),
  });
  const result = (await response.json()) as {
    viewer_id?: string;
    viewer_url?: string;
    interactive?: boolean;
    expires_at?: string;
    error?: { code?: string };
  };
  if (!response.ok || !result.viewer_url || result.interactive !== false)
    throw new Error(`Read-only viewer unavailable: ${result.error?.code ?? response.status}`);
  writeFileSync(
    join(repository, ".dev/gpui-experiment-viewer.json"),
    JSON.stringify({
      url: new URL(result.viewer_url, origin).href,
      viewer_id: result.viewer_id,
      origin,
      expires_at: result.expires_at,
    }) + "\n",
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      status: "read_only_viewer_ready",
      viewer_id: result.viewer_id,
      expires_at: result.expires_at,
      registered_executors: background.executorCount,
    }),
  );
} catch (error) {
  await app.stop();
  store.close();
  throw error;
}
async function close() {
  await app.stop();
  store.close();
  process.exit(0);
}
process.on("SIGTERM", close);
process.on("SIGINT", close);
