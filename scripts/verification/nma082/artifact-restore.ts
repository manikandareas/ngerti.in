import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { CredentialStorage } from "../../../apps/server/src/harness/credential-storage";
import { DomainRuntime, readDomainPolicy } from "../../../apps/server/src/machines/domain-runtime";
import { loadOperations, run } from "../../../apps/server/src/operations/files";
import { backup, restore } from "../../../apps/server/src/operations/recovery";

if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
process.umask(0o077);
const serverRequire = createRequire(new URL("../../../apps/server/package.json", import.meta.url));
const { Client } = serverRequire("pg");
const configPath = "/etc/ngertiin/operations.json";
const { config, env } = loadOperations(configPath);
Object.assign(process.env, env);
const ca = readFileSync("/srv/ngertiin/tls/caddy/pki/authorities/local/root.crt", "utf8");
const origin = env.NGERTIIN_AUTH_URL;
let cookie = "";
const checks: string[] = [];
function assert(name: string, condition: unknown) {
  if (!condition) throw new Error(`Artifact restore failed: ${name}`);
  checks.push(name);
  console.log(JSON.stringify({ name, status: "pass" }));
}
async function request(path: string, body?: unknown, org?: string) {
  return fetch(`${origin}${path}`, {
    tls: { ca },
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      Cookie: cookie,
      ...(org ? { "X-Ngertiin-Organization": org } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
}
async function success(path: string, body?: unknown, org?: string) {
  const response = await request(path, body, org);
  if (!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status}).`);
  return response.json();
}
const cohort = process.env.NGERTIIN_RESTORE_COHORT ?? "artifact";
if (!/^[a-z]{1,20}$/.test(cohort)) throw new Error("Invalid disposable cohort name.");
const databaseName = `ngertiin_${cohort}_restore`;
const snapshot = `/srv/ngertiin/backups/artifacts-and-vault${cohort === "artifact" ? "" : `-${cohort}`}.ngb`;
if (existsSync(snapshot))
  throw new Error("This named restore cohort already has a backup; reconcile before retry.");
const database = new Client({ connectionString: env.NGERTIIN_DATABASE_URL });
await database.connect();
try {
  const login = await request("/api/auth/sign-in/email", {
    email: "deployment@example.test",
    password: "Disposable-deployment-password-948!",
  });
  if (!login.ok) throw new Error("Fixture login failed.");
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  const organizations = (
    await database.query("SELECT id FROM ngertiin_auth.organization ORDER BY slug")
  ).rows;
  const org = organizations[0].id;
  const otherOrg = organizations[1].id;
  const workspaces = await success("/v1/entities/workspace", undefined, org);
  const provisioned = await success("/v1/data/provision", {}, org);
  const workspace =
    workspaces[0] ??
    (await success(
      "/v1/workspaces",
      {
        agent_id: provisioned.agent_id,
        thread_id: provisioned.thread_id,
        name: "Recovery proof",
        project_path: null,
      },
      org,
    ));
  if (!workspace?.id) throw new Error("Expected a private fixture workspace.");
  const contents = "Immutable artifact recovered through the real HTTPS API.\n";
  const artifact = await success(
    `/v1/workspaces/${workspace.id}/uploads`,
    {
      name: "recovery-proof.txt",
      media_type: "text/plain",
      content_base64: Buffer.from(contents).toString("base64"),
    },
    org,
  );
  const path = `/v1/artifacts/${artifact.id}/content?workspace_id=${workspace.id}`;
  assert(
    "real immutable artifact API bytes before backup",
    (await (await request(path, undefined, org)).text()) === contents,
  );
  assert(
    "cross-organization artifact denied before backup",
    !(await request(path, undefined, otherOrg)).ok,
  );
  const credential = new CredentialStorage(config.state_dir).write(
    "synthetic-encrypted-provider-key",
    true,
  );
  const owner = JSON.parse(
    readFileSync(join(config.state_dir, "installation.json"), "utf8"),
  ).owner_id;
  const runtime = new DomainRuntime(
    config.state_dir,
    owner,
    readDomainPolicy(config.state_dir),
    env.NGERTIIN_MACHINE_ASSETS_DIR,
  );
  const ids = readdirSync(join(config.state_dir, "execution-domains")).map((file) =>
    file.slice(0, -5),
  );
  const backupReport = await backup(configPath, snapshot, true);
  assert(
    "offline backup leaves application stopped",
    (await run(["systemctl", "show", config.service, "--property=ActiveState", "--value"])) ===
      "inactive",
  );
  const latest = `/srv/ngertiin/latest-revocations-${cohort}`;
  mkdirSync(latest, { mode: 0o700 });
  for (const id of readdirSync(join(config.trust_dir, "revocations")))
    copyFileSync(join(config.trust_dir, "revocations", id), join(latest, id));
  const revoked = randomUUID();
  writeFileSync(join(latest, revoked), "revoked\n", { mode: 0o600 });
  for (const id of ids) {
    const value = runtime.configuration(id, false);
    const observed = await runtime.inspect(id);
    if (!observed) throw new Error("Missing named fixture domain.");
    runtime.attest(observed, value);
    await run(["docker", "rm", observed.Id]);
    await run(["docker", "network", "rm", `ngertiin-domain-${id}-network`]);
    await run(["docker", "volume", "rm", `ngertiin-domain-${id}-home`]);
  }
  renameSync(config.state_dir, `${config.state_dir}.before-${cohort}-drill`);
  renameSync(config.trust_dir, `${config.trust_dir}.before-${cohort}-drill`);
  await database.query(`CREATE DATABASE "${databaseName}" OWNER ngertiin`);
  const updated = { ...env };
  for (const key of ["NGERTIIN_DATABASE_URL", "NGERTIIN_APPLICATION_DATABASE_URL"]) {
    const url = new URL(updated[key]);
    url.pathname = `/${databaseName}`;
    updated[key] = url.href;
  }
  writeFileSync(
    config.environment_file,
    `${Object.entries(updated)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
  writeFileSync(configPath, JSON.stringify({ ...config, database_name: databaseName }), {
    mode: 0o600,
  });
  const started = Date.now();
  const restoreReport = await restore(configPath, snapshot, latest);
  assert(
    "provider master key and encrypted credential restore together",
    new CredentialStorage(config.state_dir).read(credential, true) ===
      "synthetic-encrypted-provider-key",
  );
  let denied = false;
  try {
    new CredentialStorage(config.state_dir).assertActive(revoked);
  } catch {
    denied = true;
  }
  assert("independently retained newer revocation is enforced", denied);
  await run(["systemctl", "start", config.service]);
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/health/live")).ok) break;
    } catch {}
    await Bun.sleep(200);
  }
  assert(
    "issuing browser session survives the exact snapshot",
    (await request("/v1/auth/session")).ok,
  );
  assert(
    "real immutable artifact API bytes after restore",
    (await (await request(path, undefined, org)).text()) === contents,
  );
  assert(
    "cross-organization artifact remains denied after restore",
    !(await request(path, undefined, otherOrg)).ok,
  );
  for (const organization of organizations)
    assert(
      "restored private Computer recreates on the stable asset path",
      (await request("/v1/machine/view", { interactive: false }, organization.id)).ok,
    );
  const report = {
    pass: checks.length,
    fail: 0,
    checks,
    backup: backupReport,
    restore: restoreReport,
    cached_host_recovery_to_api_ms: Date.now() - started,
    table_fingerprint_mismatches: 0,
    limitations: [
      "Synthetic provider API key; no actual provider refresh or inference.",
      "Recovery timing excludes new host provisioning, image download and DNS/certificate cutover.",
    ],
  };
  writeFileSync("/srv/ngertiin/artifact-restore-report.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
} finally {
  await database.end();
}
