// Loopback-only observation endpoint for the native static-document fixture.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const requests: { method: string; path: string; at: string }[] = [];
const output = resolve(
  import.meta.dir,
  "../../../docs/verification/nma-067/components/html-network.json",
);
const started = new Date().toISOString();
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 41168,
  fetch(request) {
    const url = new URL(request.url);
    requests.push({ method: request.method, path: url.pathname, at: new Date().toISOString() });
    return new Response("BLOCKING TEST FAILED");
  },
});
async function stop() {
  await writeFile(
    output,
    `${JSON.stringify(
      {
        started,
        ended: new Date().toISOString(),
        bind: "127.0.0.1:41168",
        requests,
        denominator: "script, CSS import, image, iframe, external link, form submission",
        passed: requests.length === 0,
      },
      null,
      2,
    )}\n`,
  );
  server.stop(true);
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
console.log("Static HTML isolation probe listening on 127.0.0.1:41168");
