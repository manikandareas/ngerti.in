import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CuaMachine } from "../../../apps/server/src/machines/cua";
import { DomainRuntime, readDomainPolicy } from "../../../apps/server/src/machines/domain-runtime";
import { databaseFingerprint } from "../../../apps/server/src/operations/database";
import { loadOperations, run, sha256 } from "../../../apps/server/src/operations/files";
import { backup, verifyBackup } from "../../../apps/server/src/operations/recovery";

if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
process.umask(0o077);
const serverRequire = createRequire(new URL("../../../apps/server/package.json", import.meta.url));
const { Client } = serverRequire("pg");
const configPath = "/etc/ngertiin/operations.json";
const { config, env } = loadOperations(configPath);
const source = realpathSync("/opt/ngertiin/current");
const owner = JSON.parse(
  readFileSync(join(config.state_dir, "installation.json"), "utf8"),
).owner_id;
const runtime = new DomainRuntime(
  config.state_dir,
  owner,
  readDomainPolicy(config.state_dir),
  env.NGERTIIN_MACHINE_ASSETS_DIR ?? join(source, "infra/machine"),
);
const outcomes: string[] = [];
function assert(name: string, condition: unknown) {
  if (!condition) throw new Error(`Upgrade rehearsal failed: ${name}`);
  outcomes.push(name);
  console.log(JSON.stringify({ name, status: "pass" }));
}
const markers = new Map<string, string>();
// The previous verified backup-offline left this named fixture installation stopped.
assert(
  "offline cutover starts without an application process",
  (await run(["systemctl", "show", config.service, "--property=ActiveState", "--value"])) ===
    "inactive",
);
for (const file of readdirSync(join(config.state_dir, "execution-domains"))) {
  const id = file.slice(0, -5);
  const value = runtime.configuration(id, false);
  const observed = await runtime.inspect(id);
  if (!observed) throw new Error("Missing fixture domain.");
  runtime.attest(observed, value);
  if (observed.State.Running) throw new Error("Cutover requires stopped domains.");
  const image = JSON.parse(
    readFileSync(new URL("../../../infra/server/versions.json", import.meta.url), "utf8"),
  ).postgres;
  markers.set(
    id,
    await run([
      "docker",
      "run",
      "--rm",
      "--network",
      "none",
      "--mount",
      `type=volume,src=ngertiin-domain-${id}-home,dst=/volume,readonly`,
      "--entrypoint",
      "cat",
      image,
      "/volume/workspace/recovery-marker.txt",
    ]),
  );
  await run(["docker", "rm", observed.Id]);
  await run(["docker", "network", "rm", `ngertiin-domain-${id}-network`]);
  writeFileSync(
    join(config.state_dir, "execution-domains", file),
    JSON.stringify({ ...value, phase: "new", container_id: null }),
    { mode: 0o600 },
  );
}
await run([
  "bash",
  join(source, "infra/server/bootstrap.sh"),
  source,
  new URL(env.NGERTIIN_AUTH_URL).hostname,
]);
env.NGERTIIN_MACHINE_ASSETS_DIR = "/opt/ngertiin/machine-assets";
writeFileSync(
  config.environment_file,
  `${Object.entries(env)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join("\n")}\n`,
  { mode: 0o600 },
);
Object.assign(process.env, env);
const ca = readFileSync("/srv/ngertiin/tls/caddy/pki/authorities/local/root.crt", "utf8");
const origin = env.NGERTIIN_AUTH_URL;
let cookie = "";
async function request(path: string, body?: unknown, organization?: string) {
  return fetch(`${origin}${path}`, {
    tls: { ca },
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
}
async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/health/live")).ok) return;
    } catch {}
    await Bun.sleep(200);
  }
  throw new Error("Application did not become live.");
}
await run(["systemctl", "start", config.service]);
await waitForServer();
const login = await request("/api/auth/sign-in/email", {
  email: "deployment@example.test",
  password: "Disposable-deployment-password-948!",
});
assert("login after stable-asset cutover", login.ok);
cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const database = new Client({ connectionString: env.NGERTIIN_DATABASE_URL });
await database.connect();
try {
  const organizations = (
    await database.query("SELECT id FROM ngertiin_auth.organization ORDER BY slug")
  ).rows;
  for (const organization of organizations) {
    const response = await request("/v1/machine/view", { interactive: false }, organization.id);
    if (!response.ok) throw new Error(`Stable-asset viewer failed (${response.status}).`);
    const view = await response.json();
    const configuration = runtime.configuration(view.machine_id, false);
    assert(
      "same private bytes after explicit container recreation",
      (await new CuaMachine(configuration).files().read("recovery-marker.txt")).toString() ===
        markers.get(view.machine_id),
    );
  }
  const before = await databaseFingerprint(database, ["ngertiin_app", "ngertiin_auth"]);
  const candidate = `/opt/ngertiin/releases/nma082-rejected-${randomUUID()}`;
  if (existsSync(candidate))
    throw new Error("Candidate already exists; reconcile the prior fixture attempt.");
  await run(["cp", "-al", source, candidate]);
  unlinkSync(join(candidate, "apps/server/src/main.ts"));
  writeFileSync(
    join(candidate, "apps/server/src/main.ts"),
    'throw new Error("Synthetic pre-data upgrade failure");\n',
    { mode: 0o644 },
  );
  await run(["systemctl", "stop", config.service]);
  // Capture after the old authority drained, immediately before testing the known pre-data failure.
  const stopped = await databaseFingerprint(database, ["ngertiin_app", "ngertiin_auth"]);
  symlinkSync(candidate, "/opt/ngertiin/current.next");
  renameSync("/opt/ngertiin/current.next", "/opt/ngertiin/current");
  await run(["systemctl", "start", config.service]);
  for (let i = 0; i < 50; i++) {
    if (
      (await run(["systemctl", "show", config.service, "--property=Result", "--value"])) ===
      "exit-code"
    )
      break;
    await Bun.sleep(100);
  }
  const failedResult = await run([
    "systemctl",
    "show",
    config.service,
    "--property=Result",
    "--value",
  ]);
  await run(["systemctl", "stop", config.service]);
  assert("candidate failure observed", failedResult === "exit-code");
  assert(
    "known pre-data failure preserves every database fingerprint",
    JSON.stringify(await databaseFingerprint(database, ["ngertiin_app", "ngertiin_auth"])) ===
      JSON.stringify(stopped),
  );
  symlinkSync(source, "/opt/ngertiin/current.next");
  renameSync("/opt/ngertiin/current.next", "/opt/ngertiin/current");
  await run(["systemctl", "start", config.service]);
  await waitForServer();
  assert(
    "previous release resumes the same authenticated session",
    (await request("/v1/auth/session")).ok,
  );
  const snapshot = "/srv/ngertiin/backups/final-stable-profile.ngb";
  const backupReport = await backup(configPath, snapshot);
  const verification = await verifyBackup(configPath, snapshot);
  assert(
    "final stable-asset backup and target database match",
    backupReport.backup_sha256 === verification.backup_sha256,
  );
  const report = {
    pass: outcomes.length,
    fail: 0,
    outcomes,
    backup: backupReport,
    limitation:
      "Injected failure occurs before application data/native effects. General schema downgrade and provider recovery remain separate gates.",
  };
  writeFileSync("/srv/ngertiin/upgrade-report.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
} finally {
  await database.end();
}
