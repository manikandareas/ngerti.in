/** Isolated current Tauri reference. No harness executors, scheduler or production state. */

import { createHash } from "node:crypto";
import { chmod, cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { createApi } from "../../server/src/api";
import { Artifacts } from "../../server/src/artifacts";
import { Background } from "../../server/src/background";
import { Conversations } from "../../server/src/conversations";
import { fixture } from "../../server/tests/helpers";
import { directory, repository } from "./cargo";

const f = fixture();
const home = resolve(repository, ".dev/desktop-rs-reference-tauri");
await mkdir(home, { recursive: true, mode: 0o700 });
await chmod(home, 0o700);
const project = join(home, "project");
await mkdir(join(project, "apps"), { recursive: true });
try {
  await symlink(resolve(repository, "apps/server"), join(project, "apps/server"), "dir");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
}
const web = join(project, "apps/web-client/dist");
await cp(resolve(repository, "apps/web-client/dist"), web, { recursive: true, force: true });
const observerBuild = await Bun.build({
  entrypoints: [resolve(directory, "verification/nma-067/content-observer.ts")],
  outdir: web,
  target: "browser",
  minify: true,
});
if (!observerBuild.success) throw new Error(observerBuild.logs.join("\n"));
await writeFile(
  join(web, "reference-observer.js"),
  `
const observe = () => {
  const messages = [...document.querySelectorAll('[data-timeline-part] [data-message-text]')];
  const visible = messages.some(node => {
    const rect = node.getBoundingClientRect();
    return node.textContent?.includes('Reference') && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight;
  });
  if (!visible) return;
  observer.disconnect();
  document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
    fetch('/v1/reference-observation', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      kind:'first-visible-conversation', at_epoch_ms:performance.timeOrigin+performance.now(),
      navigation_ms:performance.now(), viewport:[innerWidth,innerHeight], scale:devicePixelRatio,
      messages:document.querySelectorAll('[data-timeline-part]').length, hidden:document.hidden,
      theme:document.documentElement.className, locale:navigator.language,
    })});
  })));
};
const observer = new MutationObserver(observe);
observer.observe(document.documentElement, {childList:true,subtree:true});
observe();
`,
);
const index = await readFile(join(web, "index.html"), "utf8");
await writeFile(
  join(web, "index.html"),
  index.replace(
    "</head>",
    '<script type="module" src="/reference-observer.js"></script><script type="module" src="/content-observer.js"></script></head>',
  ),
);
const observations: unknown[] = [];
const token = crypto.randomUUID();
const api = createApi(f.lifecycle, new Background(f.lifecycle), token);
// Freeze only synchronous fixture setup; live requests and measurements use the real clock.
const originalDate = globalThis.Date;
const fixtureStart = "2026-11-06T15:29:00Z";
const fixedDate = new Proxy(originalDate, {
  construct(target, args) {
    return Reflect.construct(target, args.length ? args : [fixtureStart]);
  },
  get(target, property, receiver) {
    if (property === "now") return () => originalDate.parse(fixtureStart);
    return Reflect.get(target, property, receiver);
  },
});
let setup: ReturnType<Conversations["setup"]>;
try {
  globalThis.Date = fixedDate;
  setup = new Conversations(f.lifecycle).setup();
} finally {
  globalThis.Date = originalDate;
}
const files = new Artifacts(f.lifecycle);
const workspace = files.workspaces.ensure(setup.thread_id, setup.agent_id);
const attachments = [];
const attachmentSources: { name: string; size_bytes: number; sha256: string }[] = [];
const attachmentContents: [string, string, Buffer][] = await Promise.all(
  [
    ["reference.pdf", "application/pdf", "verification/nma-067/pdf/long.pdf"],
    ["reference.ts", "text/typescript", "crates/desktop/src/models/content.rs"],
    ["avatar.png", "image/png", "../../docs/verification/nma-067/rust-tobi.png"],
  ].map(
    async ([name, type, path]): Promise<[string, string, Buffer]> => [
      name,
      type,
      Buffer.from(await Bun.file(resolve(directory, path)).arrayBuffer()),
    ],
  ),
);
attachmentContents.push([
  "large.ts",
  "text/typescript",
  Buffer.from(
    Array.from({ length: 100000 }, (_, ix) => `// source ${String(ix).padStart(6, "0")}   `)
      .join("\n")
      .padEnd(2097152, " "),
  ),
]);
attachmentContents.push([
  "table.csv",
  "text/csv",
  Buffer.from(
    [
      Array.from({ length: 20 }, (_, col) => `Column ${col + 1}`).join(","),
      ...Array.from({ length: 10000 }, (_, row) =>
        Array.from({ length: 20 }, (_, col) => `Row ${row} · cell ${col}`).join(","),
      ),
    ].join("\r\n"),
  ),
]);
for (const [name, mediaType, bytes] of attachmentContents) {
  const artifact = await files.upload(workspace.id, crypto.randomUUID(), {
    name,
    media_type: mediaType,
    content_base64: bytes.toString("base64"),
  });
  attachmentSources.push({
    name,
    size_bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
  // Authored presentation fixture: deliberately no native run or inference.
  attachments.push(
    f.store.put(
      {
        ...artifact,
        origin: "native_output",
        created_by_agent_id: setup.agent_id,
        revision: artifact.revision + 1,
      },
      artifact.revision,
    ),
  );
}
const fixtureFiles = files.workspaces.files(workspace.id);
fixtureFiles.create("project/src/main.ts", Buffer.from("export const ready = true;\n"));
fixtureFiles.create(
  "project/README.md",
  Buffer.from("# Reference project\n\nA retained native UI fixture.\n"),
);
// Authored fixture messages use normal entity persistence, without run admission.
// Lifecycle.create intentionally supports configuration/responsibility entities,
// not messages. Use the store's validated message path for these fixture rows.
for (let index = 1; index < 100; index++) {
  const author = index % 2 ? "user" : "agent";
  const text =
    author === "user"
      ? `Reference request ${index}: review the native desktop component.`
      : `Reference answer ${index}. **The result is ready.**\n\n- Keep the original file.\n- Preserve the conversation context.\n\n` +
        "```typescript\nexport const ready = true;\n```";
  const day = index < 50 ? "2026-11-06T15:30:00Z" : "2026-11-06T16:00:00Z";
  const now = new Date(Date.parse(day) + (index % 50) * 30000).toISOString();
  f.store.put({
    id: crypto.randomUUID(),
    owner_id: f.owner,
    revision: 1,
    created_at: now,
    updated_at: now,
    kind: "message",
    creation_operation_id: null,
    purpose: author === "user" ? "human_reply" : "conversation",
    source_run_id: null,
    thread_id: setup.thread_id,
    author,
    author_agent_id: author === "agent" ? setup.agent_id : null,
    text,
    state: "complete",
    artifact_ids: index === 98 ? attachments.map((artifact) => artifact.id) : [],
    routine_id: null,
    run_id: null,
  });
}
const snapshot = new Conversations(f.lifecycle).snapshot(setup.thread_id);
const fixtureTimeline = new Conversations(f.lifecycle).timeline(setup.thread_id, { limit: 100 });
if (fixtureTimeline.parts.length !== 100 || f.store.list("run").length !== 0)
  throw new Error("The reference must contain exactly 100 published fixture messages and no run.");
const cursor = f.store.cursor;
const calls: string[] = [];
const backend = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    calls.push(`${request.method} ${path}`);
    if (request.method === "POST" && path === "/v1/content-benchmark") {
      const record = await request.json();
      if (
        record.version !== 1 ||
        ![
          "source-2mib-100000-lines-bounded-preview",
          "table-10000-by-20",
          "pdf-current-fixture",
        ].includes(record.workload) ||
        record.visibility_policy !== "native-and-document" ||
        !Array.isArray(record.frames_ms) ||
        record.frames_ms.length > 10000 ||
        !Array.isArray(record.events) ||
        record.events.length > 10000
      )
        return new Response("Invalid content record", { status: 400 });
      const records = resolve(repository, "docs/verification/nma-067/components/content");
      await mkdir(records, { recursive: true });
      await writeFile(
        join(records, `tauri-${record.workload}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
      );
      return new Response("Recorded");
    }
    if (request.method === "POST" && path === "/v1/reference-observation") {
      const observation = await request.json();
      const launch = JSON.parse(await readFile(join(home, "launch-start.json"), "utf8"));
      const cohort = await readFile(join(home, "launch-cohort.json"), "utf8")
        .then(JSON.parse)
        .catch(() => ({ mode: "capture", index: 0 }));
      observations.push({
        ...observation,
        ...cohort,
        pid: launch.pid,
        exec_to_visible_ms: observation.at_epoch_ms - launch.at_epoch_ms,
      });
      await writeFile(
        resolve(repository, "docs/verification/nma-066/tauri-launch-observations.json"),
        JSON.stringify(
          {
            version: 1,
            boundary:
              "Binary exec to visible authored conversation text, after fonts and two browser frames. Excludes LaunchServices/shell/Python startup. Cold means a fresh WKWebView store, not purged OS file caches.",
            observations,
          },
          null,
          2,
        ),
      );
      return new Response("Recorded");
    }
    if (request.method !== "GET" && !(request.method === "POST" && path === "/v1/setup"))
      return new Response(null, { status: 405 });
    // The reference's Working files surface reads only these disposable local
    // files. It never attaches to, controls or mutates the shared Linux machine.
    if (request.method === "GET" && path === "/v1/machine/files")
      return Response.json(
        fixtureFiles.list(
          url.searchParams.get("path") ?? "",
          url.searchParams.get("after") ?? "",
          100,
        ),
      );
    if (request.method === "GET" && path === "/v1/machine/file") {
      const file = url.searchParams.get("path") ?? "";
      return new Response(fixtureFiles.read(file), {
        headers: { "Content-Type": "application/octet-stream", "Cache-Control": "no-store" },
      });
    }
    return api.handle(request);
  },
});
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
  projectRoot: project,
  configFile: join(home, "backend.env"),
  bunExecutable: "/usr/bin/false",
  uiPort: port,
});
await privateJson(join(home, "window.json"), {
  width: 1280,
  height: 933,
  x: null,
  y: null,
  maximized: false,
});
const fixtureMetadata = {
  version: 1,
  fixture_clock: fixtureStart,
  messages: fixtureTimeline.parts.length,
  initial_page_messages: snapshot.timeline.parts.length,
  initial_cursor: cursor,
  executors: 0,
  scheduler: false,
  machine_files: "Disposable local fixture projection; no shared machine connection",
  attachment_presentation: "Authored native_output projection; no native run or inference",
  artifacts: attachmentSources,
};
await writeFile(
  resolve(repository, "docs/verification/nma-066/tauri-fixture-v2.json"),
  `${JSON.stringify(fixtureMetadata, null, 2)}\n`,
);
const bundle = resolve(directory, "dist/Ngertiin Tauri Reference.app");
await mkdir(join(bundle, "Contents/MacOS"), { recursive: true });
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
await writeFile(
  join(bundle, "Contents/MacOS/reference"),
  `#!/bin/sh\nexport NGERTIIN_DESKTOP_HOME=${quote(home)}\nexec /usr/bin/python3 -c ${quote('import os,sys,time,json,pathlib; pathlib.Path(os.environ["NGERTIIN_DESKTOP_HOME"],"launch-start.json").write_text(json.dumps({"pid":os.getpid(),"at_epoch_ms":time.time_ns()/1e6})); os.execv(sys.argv[1],[sys.argv[1]])')} ${quote(resolve(repository, "apps/desktop/src-tauri/target/debug/ngertiin-desktop"))}\n`,
);
await chmod(join(bundle, "Contents/MacOS/reference"), 0o755);
await writeFile(
  join(bundle, "Contents/Info.plist"),
  `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>reference</string><key>CFBundleIdentifier</key><string>in.ngertiin.desktop.tauri.reference</string><key>CFBundleName</key><string>Ngertiin Tauri Reference</string><key>CFBundlePackageType</key><string>APPL</string><key>NSHighResolutionCapable</key><true/></dict></plist>`,
);
console.log(
  JSON.stringify({
    bundle,
    port,
    initial_cursor: cursor,
    messages: fixtureTimeline.parts.length,
    initial_page_messages: snapshot.timeline.parts.length,
    files: attachments.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      size_bytes: artifact.size_bytes,
    })),
    machine_files: "disposable local fixture projection; no shared machine connection",
    fixture_clock: fixtureStart,
    executors: 0,
    scheduler: false,
  }),
);
async function stop() {
  await writeFile(
    resolve(repository, "docs/verification/nma-066/tauri-reference-server-v2.json"),
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
