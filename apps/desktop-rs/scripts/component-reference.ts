/** Current Tauri/WKWebView, original avatar engine, isolated local performance fixtures. */
import { chmod, copyFile, mkdir, symlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createApi } from "../../server/src/api";
import { Background } from "../../server/src/background";
import { fixture } from "../../server/tests/helpers";
import { directory, repository } from "./cargo";

const home = resolve(repository, ".dev/desktop-rs-component-reference");
await mkdir(home, { recursive: true, mode: 0o700 });
await chmod(home, 0o700);
const project = join(home, "project");
const web = join(project, "apps/web-client/dist");
await mkdir(web, { recursive: true });
await mkdir(join(project, "apps"), { recursive: true });
try {
  await symlink(resolve(repository, "apps/server"), join(project, "apps/server"), "dir");
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
}
const bundle = await Bun.build({
  entrypoints: [resolve(directory, "verification/nma-067/avatar-workload.ts")],
  outdir: web,
  target: "browser",
  minify: true,
  plugins: [
    {
      name: "web-alias",
      setup(build) {
        build.onResolve({ filter: /^@\// }, ({ path }) => ({
          path: resolve(repository, "apps/web-client/src", `${path.slice(2)}.ts`),
        }));
      },
    },
  ],
});
if (!bundle.success) throw new Error(bundle.logs.join("\n"));
await copyFile(resolve(directory, "assets/fonts/Geist.ttf"), join(web, "Geist.ttf"));
await copyFile(
  resolve(repository, "apps/web-client/src/features/avatar/components/avatar.css"),
  join(web, "avatar.css"),
);
await writeFile(
  join(web, "index.html"),
  `<!doctype html><html lang="en"><meta charset="utf-8"><title>Ngertiin Tauri Component Reference</title><link rel="stylesheet" href="/avatar.css"><style>@font-face{font-family:Geist;src:url('/Geist.ttf')}body{font:14px Geist,system-ui;margin:24px;background:#fcfcfc;color:#1c1c1c}#avatars{display:flex;flex-wrap:wrap;gap:12px;align-items:center;min-height:128px}button,select{font:inherit;padding:8px 12px;border:0;border-radius:8px;background:#f4f4f4}</style><h1>Original avatar engine · Tauri reference</h1><p>1 / 10 / 30 identities · idle / thinking / working · 120 visible seconds each</p><div id="avatars"></div><label>Start workload <select id="from">${[
    1, 10, 30,
  ]
    .flatMap((count) => ["idle", "thinking", "working"].map((state) => `${count} ${state}`))
    .map((label, index) => `<option value="${index}">${label}</option>`)
    .join(
      "",
    )}</select></label> <button id="start">Run benchmark matrix</button><p id="status">Ready. No inference, application state, provider or credentials in this fixture.</p><script type="module" src="/avatar-workload.js"></script></html>`,
);
const f = fixture(),
  token = crypto.randomUUID();
const api = createApi(f.lifecycle, new Background(f.lifecycle), token);
const records = resolve(repository, "docs/verification/nma-067/components/tauri");
await mkdir(records, { recursive: true });
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  maxRequestBodySize: 2 * 1024 * 1024,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/v1/component-benchmark" && request.method === "POST") {
      const data = await request.json();
      if (
        ![1, 10, 30].includes(data.avatars) ||
        !["idle", "thinking", "working"].includes(data.state) ||
        !Array.isArray(data.frames_ms) ||
        data.frames_ms.length > 10000 ||
        !Array.isArray(data.image_deliveries_ms) ||
        data.image_deliveries_ms.length > 10000 ||
        data.version !== 3 ||
        data.layout_verified !== true ||
        data.visibility_policy !== "native-and-document"
      )
        return new Response("Invalid benchmark record", { status: 400 });
      await writeFile(
        join(records, `${data.avatars}-${data.state}.json`),
        `${JSON.stringify(data, null, 2)}\n`,
      );
      return new Response("Recorded");
    }
    if (request.method !== "GET") return new Response(null, { status: 405 });
    return api.handle(request);
  },
});
const privateJson = (path: string, value: unknown) =>
  writeFile(path, JSON.stringify(value), { mode: 0o600 });
await privateJson(join(f.dir, "installation.json"), { owner_id: f.owner, token });
await privateJson(join(f.dir, "runtime.json"), {
  pid: process.pid,
  instance_id: crypto.randomUUID(),
  owner_id: f.owner,
  url: `http://127.0.0.1:${server.port}`,
  contract_version: "1.31.0",
  manager_id: null,
});
await writeFile(join(home, "backend.env"), "NGERTIIN_API_URL=disabled\n", { mode: 0o600 });
await privateJson(join(home, "profile.json"), {
  version: 1,
  managerId: crypto.randomUUID(),
  stateDirectory: f.dir,
  projectRoot: project,
  configFile: join(home, "backend.env"),
  bunExecutable: "/usr/bin/false",
  uiPort: 41169,
});
// GPUI's observed content viewport is 1280×901. The current Tauri host's
// restored window height includes 32 points of chrome; request 933 to obtain
// the same measured 901-point document viewport and verify it in the record.
await privateJson(join(home, "window.json"), {
  width: 1280,
  height: 933,
  x: null,
  y: null,
  maximized: false,
});
const app = resolve(directory, "dist/Ngertiin Tauri Component Reference.app");
await mkdir(join(app, "Contents/MacOS"), { recursive: true });
const quote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
await writeFile(
  join(app, "Contents/MacOS/reference"),
  `#!/bin/sh\nexport NGERTIIN_DESKTOP_HOME=${quote(home)}\nexec ${quote(resolve(repository, "apps/desktop/src-tauri/target/debug/ngertiin-desktop"))}\n`,
);
await chmod(join(app, "Contents/MacOS/reference"), 0o755);
await writeFile(
  join(app, "Contents/Info.plist"),
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>reference</string><key>CFBundleIdentifier</key><string>in.ngertiin.desktop.tauri.component-reference</string><key>CFBundleName</key><string>Ngertiin Tauri Component Reference</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
console.log(
  JSON.stringify({ app, initial_cursor: f.store.cursor, executors: 0, scheduler: false }),
);
const cursor = f.store.cursor;
function stop() {
  server.stop(true);
  console.log(JSON.stringify({ initial_cursor: cursor, final_cursor: f.store.cursor }));
  f.close();
  process.exit();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
