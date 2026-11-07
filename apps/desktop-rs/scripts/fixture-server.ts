/** Disposable real API for read-only client proofs. No executor, scheduler or machine. */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createApi } from "../../server/src/api";
import { Background } from "../../server/src/background";
import { fixture } from "../../server/tests/helpers";

const f = fixture();
const token = crypto.randomUUID();
const api = createApi(f.lifecycle, new Background(f.lifecycle), token);
const directory = resolve(import.meta.dir, "../../..", ".dev/desktop-rs-fixture");
await mkdir(directory, { recursive: true, mode: 0o700 });
const tokenFile = join(directory, "token");
await writeFile(tokenFile, token, { mode: 0o600 });
const headers = { Authorization: `Bearer ${token}` };
const contract = await (
  await api.handle(new Request("http://localhost/v1/contracts", { headers }))
).json();
const snapshot = await (
  await api.handle(new Request(`http://localhost/v1/threads/${f.thread.id}/snapshot`, { headers }))
).json();
const fixtureRoot = resolve(import.meta.dir, "../verification");
await writeFile(join(fixtureRoot, "snapshot.json"), `${JSON.stringify(snapshot, null, 2)}\n`);
const cursor = f.store.cursor;
const reads: string[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    reads.push(`${request.method} ${url.pathname}`);
    if (request.method !== "GET") return new Response(null, { status: 405 });
    return api.handle(request);
  },
});
const connection = {
  origin: `http://127.0.0.1:${server.port}`,
  token_file: tokenFile,
  thread_id: f.thread.id,
};
await writeFile(join(directory, "connection.json"), JSON.stringify(connection), { mode: 0o600 });
console.log(
  JSON.stringify({
    ...connection,
    token_file: "[private local file]",
    contract: contract.version,
    cursor,
  }),
);
async function stop() {
  const result = {
    reads,
    initial_cursor: cursor,
    final_cursor: f.store.cursor,
    inference: 0,
    executors: 0,
    scheduler_started: false,
  };
  await writeFile(
    resolve(import.meta.dir, "../../..", "docs/verification/nma-066/read-only-server.json"),
    `${JSON.stringify(result, null, 2)}\n`,
  );
  server.stop(true);
  f.close();
  process.exit(result.final_cursor === cursor ? 0 : 1);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
