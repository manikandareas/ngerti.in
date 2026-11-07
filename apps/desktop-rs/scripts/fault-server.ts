/** Read-only transport fault fixture, independent of domain persistence. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { directory, repository } from "./cargo";

const fixtureRoot = resolve(repository, ".dev/desktop-rs-fixture");
const base = JSON.parse(await readFile(resolve(fixtureRoot, "connection.json"), "utf8"));
const token = (await readFile(base.token_file, "utf8")).trim();
const contract = JSON.parse(
  await readFile(resolve(repository, "docs/contracts/1.31.0.json"), "utf8"),
);
const snapshot = await readFile(resolve(directory, "verification/snapshot.json"), "utf8");
const modeFile = resolve(fixtureRoot, "fault-mode");
const reads: { method: string; path: string; mode: string }[] = [];
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const mode = await Bun.file(modeFile)
      .text()
      .catch(() => "malformed");
    reads.push({ method: request.method, path, mode });
    if (request.method !== "GET") return new Response(null, { status: 405 });
    if (mode === "unauthorized" || request.headers.get("Authorization") !== `Bearer ${token}`)
      return new Response(null, { status: 401 });
    if (path === "/v1/contracts")
      return Response.json(mode === "version" ? { ...contract, version: "9.0.0" } : contract);
    return new Response(mode === "shape" ? "{}" : mode === "malformed" ? "{" : snapshot, {
      headers: { "Content-Type": "application/json" },
    });
  },
});
await writeFile(
  resolve(fixtureRoot, "fault-connection.json"),
  JSON.stringify({ ...base, origin: `http://127.0.0.1:${server.port}` }),
  { mode: 0o600 },
);
console.log(`Read-only fault fixture: 127.0.0.1:${server.port}`);
async function stop() {
  await writeFile(
    resolve(repository, "docs/verification/nma-066/native-fault-requests.json"),
    `${JSON.stringify(reads, null, 2)}\n`,
  );
  server.stop(true);
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
