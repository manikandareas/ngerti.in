/** Isolated current Tauri reference. No harness executors, scheduler or production state. */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createApi } from "../../server/src/api";
import { Background } from "../../server/src/background";
import { fixture } from "../../server/tests/helpers";
import { directory, repository } from "./cargo";

const f = fixture();
const token = crypto.randomUUID();
const api = createApi(f.lifecycle, new Background(f.lifecycle), token);
const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "Idempotency-Key": crypto.randomUUID(),
};
const setup = await (
  await api.handle(
    new Request("http://localhost/v1/setup", { method: "POST", headers, body: "{}" }),
  )
).json();
// Authored fixture messages use normal entity persistence, without run admission.
for (const [author, text] of [
  ["user", "Please review the native desktop foundation."],
  [
    "agent",
    "The foundation keeps the conversation, shared files and responsibilities in one workspace.",
  ],
] as const) {
  f.lifecycle.create("message", {
    thread_id: setup.thread_id,
    author,
    author_agent_id: author === "agent" ? setup.agent_id : null,
    text,
    state: "complete",
  });
}
const cursor = f.store.cursor;
const calls: string[] = [];
const backend = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    calls.push(`${request.method} ${path}`);
    if (request.method !== "GET" && !(request.method === "POST" && path === "/v1/setup"))
      return new Response(null, { status: 405 });
    return api.handle(request);
  },
});
const home = resolve(repository, ".dev/desktop-rs-reference-tauri");
await mkdir(home, { recursive: true, mode: 0o700 });
const privateJson = async (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value), { mode: 0o600 });
await privateJson(join(f.dir, "installation.json"), { owner_id: f.owner, token });
await privateJson(join(f.dir, "runtime.json"), {
  pid: process.pid,
  instance_id: crypto.randomUUID(),
  owner_id: f.owner,
  url: `http://127.0.0.1:${backend.port}`,
  contract_version: "1.31.0",
  manager_id: null,
});
await writeFile(join(home, "backend.env"), "NGERTIIN_API_URL=disabled\n", { mode: 0o600 });
const reserve = createServer();
await new Promise<void>((done) => reserve.listen(0, "127.0.0.1", done));
const port = (reserve.address() as { port: number }).port;
await new Promise<void>((done) => reserve.close(() => done()));
await privateJson(join(home, "profile.json"), {
  version: 1,
  managerId: crypto.randomUUID(),
  stateDirectory: f.dir,
  projectRoot: repository,
  configFile: join(home, "backend.env"),
  bunExecutable: "/usr/bin/false",
  uiPort: port,
});
const bundle = resolve(directory, "dist/Ngertiin Tauri Reference.app");
await mkdir(join(bundle, "Contents/MacOS"), { recursive: true });
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(
  join(bundle, "Contents/MacOS/reference"),
  `#!/bin/sh\nexport NGERTIIN_DESKTOP_HOME=${quote(home)}\nexec ${quote(resolve(repository, "apps/desktop/src-tauri/target/debug/ngertiin-desktop"))}\n`,
);
await chmod(join(bundle, "Contents/MacOS/reference"), 0o755);
await writeFile(
  join(bundle, "Contents/Info.plist"),
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>reference</string><key>CFBundleIdentifier</key><string>in.ngertiin.desktop.tauri.reference</string><key>CFBundleName</key><string>Ngertiin Tauri Reference</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
console.log(
  JSON.stringify({ bundle, port, initial_cursor: cursor, executors: 0, scheduler: false }),
);
async function stop() {
  await writeFile(
    resolve(repository, "docs/verification/nma-066/tauri-reference-server.json"),
    JSON.stringify(
      {
        calls,
        initial_cursor: cursor,
        final_cursor: f.store.cursor,
        inference: 0,
        executors: 0,
        scheduler: false,
      },
      null,
      2,
    ),
  );
  backend.stop(true);
  f.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
