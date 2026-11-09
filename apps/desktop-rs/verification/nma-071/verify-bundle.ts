/** Inspect the native bundle and boot its backend closure outside the checkout. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, readlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const bundle = resolve(process.argv[2] ?? "apps/desktop-rs/dist/Ngertiin Rust Development.app");
const report = resolve(process.argv[3] ?? "docs/verification/nma-071/bundle-check.json");
const manifest = await Bun.file(join(bundle, "Contents/Resources/build-manifest.json")).json();
let bytes = 0;
for (const [path, digest] of Object.entries(manifest.resources)) {
  const content = await readFile(join(bundle, path));
  bytes += content.length;
  assert.equal(createHash("sha256").update(content).digest("hex"), digest, path);
  assert(
    !/(?:^|\/)(?:\.env|installation\.json|attachment\.json|runtime\.json|credentials\.json|ngertiin\.sqlite)$/.test(
      path,
    ),
    path,
  );
}
const runtime = join(bundle, "Contents/Resources/runtime");
assert(!(await Bun.file(join(runtime, "apps/web-client/dist/index.html")).exists()));
for (const packageName of ["react", "react-dom", "lexical", "@lexical/react"])
  assert(!(await Bun.file(join(runtime, "node_modules", packageName, "package.json")).exists()));
const links: string[] = [];
async function inspect(directory: string) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink()) {
      const target = await readlink(path);
      assert(!target.startsWith("/"), path);
      assert(resolve(directory, target).startsWith(`${runtime}/`), path);
      links.push(path.slice(runtime.length + 1));
    } else if (entry.isDirectory()) await inspect(path);
  }
}
await inspect(runtime);
const state = await mkdtemp(join(tmpdir(), "ngertiin-nma071-bundle-"));
const config = join(state, "empty.env");
await writeFile(config, "", { mode: 0o600 });
const child = Bun.spawn(
  [join(bundle, "Contents/MacOS/bun"), join(runtime, "apps/server/src/main.ts")],
  {
    cwd: state,
    env: {
      PATH: "/usr/bin:/bin",
      HOME: process.env.HOME,
      NGERTIIN_STATE_DIR: state,
      NGERTIIN_PORT: "0",
      NGERTIIN_CONFIG_FILE: config,
      NGERTIIN_CODEX_EXECUTABLE: "/usr/bin/false",
      NGERTIIN_MUSE_EXECUTABLE: "/usr/bin/false",
    },
    stdout: "pipe",
    stderr: "pipe",
  },
);
let record: { url: string; pid: number } | undefined;
try {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (await Bun.file(join(state, "runtime.json")).exists()) {
      record = await Bun.file(join(state, "runtime.json")).json();
      break;
    }
    if (child.exitCode !== null) throw new Error(await new Response(child.stderr).text());
    await Bun.sleep(100);
  }
  assert(record, "The bundled backend did not publish readiness.");
  const installation = await Bun.file(join(state, "installation.json")).json();
  const response = await fetch(`${record.url}/health/ready`, {
    headers: { Authorization: `Bearer ${installation.token}` },
  });
  const health = await response.json();
  assert.equal(response.status, 200);
  assert.equal(health.api_readiness_gate, "ready");
  assert.equal(health.contract_version, "1.31.0");
  assert.equal(record.pid, child.pid);
  child.kill("SIGTERM");
  const exit = await child.exited;
  assert.equal(exit, 0);
  await writeFile(
    report,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        binary_sha256: manifest.binary_sha256,
        resources_verified: Object.keys(manifest.resources).length,
        resource_bytes: bytes,
        relative_links_verified: links.length,
        checkout_working_directory: false,
        private_state_bundled: false,
        web_client_distribution: false,
        react_application_ui: false,
        backend: {
          ready: true,
          contract: health.contract_version,
          owned_process: true,
          shutdown_exit: exit,
        },
        boundaries:
          "Backend closure and resource integrity only. Native GUI, inference, signing and fresh-device distribution require separate observations.",
      },
      null,
      2,
    ),
  );
  console.log(
    `Verified ${Object.keys(manifest.resources).length} resource hashes and an isolated bundled backend lifecycle.`,
  );
} finally {
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await child.exited;
  }
}
