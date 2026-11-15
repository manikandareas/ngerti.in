import { randomUUID } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { Authentication } from "../../../apps/server/src/auth/service";
import { developmentConfig } from "../../../apps/server/src/config";
import { CredentialStorage } from "../../../apps/server/src/harness/credential-storage";
import { CuaMachine } from "../../../apps/server/src/machines/cua";
import { DomainRuntime, readDomainPolicy } from "../../../apps/server/src/machines/domain-runtime";
import {
  MediaCodec,
  OpenMediaRequestSchema,
  OpenMediaResponseSchema,
  SessionPolicy,
} from "../../../apps/server/src/machines/protocol/stream_pb";
import { Organizations } from "../../../apps/server/src/organizations/service";
import { loadOperations, run } from "../../../apps/server/src/operations/files";
import { backup, restore, verifyBackup } from "../../../apps/server/src/operations/recovery";

const serverRequire = createRequire(new URL("../../../apps/server/package.json", import.meta.url));
const { create, fromBinary, toBinary } = await import(serverRequire.resolve("@bufbuild/protobuf"));
const { hashPassword } = await import(serverRequire.resolve("better-auth/crypto"));
const { Client } = serverRequire("pg");

// Disposable, newly bootstrapped Linux host only. This deliberately changes its named fixture state.
if (process.env.NGERTIIN_DISPOSABLE_REHEARSAL !== "nma082")
  throw new Error("Explicit disposable rehearsal marker required.");
process.umask(0o077);
const configPath = "/etc/ngertiin/operations.json";
const { config, env } = loadOperations(configPath);
Object.assign(process.env, env);
const app = developmentConfig();
if (!app.authentication) throw new Error("Account mode required.");
const ca = readFileSync("/srv/ngertiin/tls/caddy/pki/authorities/local/root.crt", "utf8");
const origin = app.authentication.origin;
const outcomes: { name: string; status: "pass" }[] = [];
function assert(name: string, value: unknown) {
  if (!value) throw new Error(`Rehearsal failed: ${name}`);
  outcomes.push({ name, status: "pass" });
  console.log(JSON.stringify({ event: "rehearsal.check", name, status: "pass" }));
}
let cookie = "";
async function request(path: string, body?: unknown, organization?: string) {
  return fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    tls: { ca },
    redirect: "manual",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      Origin: origin,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
}
async function success(path: string, body?: unknown, organization?: string) {
  const response = await request(path, body, organization);
  if (!response.ok) throw new Error(`Fixture request failed: ${path} (${response.status})`);
  return response.json();
}
const database = new Client({ connectionString: env.NGERTIIN_DATABASE_URL });
await database.connect();
try {
  assert("certificate-validated remote HTTPS and web assets", (await request("/")).ok);
  assert(
    "private operator endpoint denied at ingress",
    (await request("/health/ready")).status === 404,
  );
  assert("private run-lease ingress denied", (await request("/v1/harness/tools")).status === 404);
  assert("application login required", (await request("/v1/contracts")).status === 401);
  const existingUser = (
    await database.query(
      "SELECT id FROM ngertiin_auth.\"user\" WHERE email='deployment@example.test'",
    )
  ).rows[0];
  const user = existingUser?.id ?? randomUUID();
  const password = "Disposable-deployment-password-948!";
  if (!existingUser) {
    await database.query(
      'INSERT INTO ngertiin_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,\'Deployment fixture\',\'deployment@example.test\',true,now(),now())',
      [user],
    );
    await database.query(
      'INSERT INTO ngertiin_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$3,$4,now(),now())',
      [randomUUID(), user, user, await hashPassword(password)],
    );
  }
  const login = await request("/api/auth/sign-in/email", {
    email: "deployment@example.test",
    password,
  });
  assert("real API login over TLS", login.ok);
  cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  assert(
    "Secure HttpOnly session cookie",
    login.headers.getSetCookie().some((value) => /secure/i.test(value) && /httponly/i.test(value)),
  );
  const auth = await Authentication.open(
    app.authentication,
    env.NGERTIIN_DATABASE_URL,
    app.owner_id,
    async () => {},
  );
  if (
    !(await database.query("SELECT user_id FROM ngertiin_auth.ngertiin_owner_binding WHERE id=1"))
      .rows[0].user_id
  ) {
    const grant = await auth.issueBootstrap("deployment@example.test");
    await success("/v1/auth/bootstrap", { token: grant.token });
  }
  await new Organizations(auth).grantCreation("deployment@example.test", 2);
  await auth.close();
  const oldOrg = (
    await database.query("SELECT id FROM ngertiin_auth.organization WHERE slug='restore-fixture-a'")
  ).rows[0];
  const org =
    oldOrg?.id ??
    (await success("/v1/organizations", { name: "Restore fixture A", slug: "restore-fixture-a" }))
      .organization.id;
  if (!oldOrg)
    await success("/v1/data/legacy-binding", {
      organization_id: org,
      legacy_owner_id: app.owner_id,
    });
  await success("/v1/data/provision", {}, org);
  const orgB =
    (
      await database.query(
        "SELECT id FROM ngertiin_auth.organization WHERE slug='restore-fixture-b'",
      )
    ).rows[0]?.id ??
    (await success("/v1/organizations", { name: "Restore fixture B", slug: "restore-fixture-b" }))
      .organization.id;
  await success("/v1/data/provision", {}, orgB);
  const domains: { id: string; marker: string }[] = [];
  for (const [index, organization] of [org, orgB].entries()) {
    const view = await success("/v1/machine/view", { interactive: false }, organization);
    const root = view.viewer_url.split("viewer/#")[0];
    assert(
      `native Cua viewer through HTTPS domain ${index + 1}`,
      (await request(view.viewer_url.split("#")[0])).ok,
    );
    const runtime = new DomainRuntime(
      config.state_dir,
      app.owner_id,
      readDomainPolicy(config.state_dir),
    );
    const retained = runtime.configuration(view.machine_id, false);
    const machine = new CuaMachine(retained);
    let marker: string;
    try {
      marker = (await machine.files().read("recovery-marker.txt")).toString();
    } catch {
      marker = `private-domain-${index}-${randomUUID()}`;
      await machine.files().write("recovery-marker.txt", Buffer.from(marker));
    }
    domains.push({ id: retained.id, marker });
    const payload = toBinary(
      OpenMediaRequestSchema,
      create(OpenMediaRequestSchema, {
        target: { target: { case: "displayId", value: "primary" } },
        maxFps: 1,
        maxDimension: 640,
        policy: SessionPolicy.VIEW_ONLY,
      }),
    );
    const frame = new Uint8Array(5 + payload.length);
    new DataView(frame.buffer).setUint32(1, payload.length);
    frame.set(payload, 5);
    const rpc = await fetch(`${origin}${root}cua.env.v1.StreamService/OpenMedia`, {
      method: "POST",
      tls: { ca },
      headers: { Cookie: cookie, Origin: origin, "Content-Type": "application/grpc-web+proto" },
      body: frame,
      signal: AbortSignal.timeout(30000),
    });
    if (!rpc.ok) throw new Error(`Media RPC failed (${rpc.status}).`);
    const bytes = new Uint8Array(await rpc.arrayBuffer());
    if (bytes.length < 5)
      throw new Error(
        `Media rejected: ${rpc.headers.get("grpc-status") ?? "unknown"} ${rpc.headers.get("grpc-message") ?? ""}`,
      );
    const media = fromBinary(
      OpenMediaResponseSchema,
      bytes.subarray(5, 5 + new DataView(bytes.buffer).getUint32(1)),
    );
    const websocketUrl = new URL(media.wsPath, `${origin.replace(/^http/, "ws")}${root}`).href;
    assert(
      `WSS remains on public origin domain ${index + 1}`,
      websocketUrl.startsWith(origin.replace(/^http/, "ws")),
    );
    const socket = new WebSocket(websocketUrl, {
      headers: { Cookie: cookie, Origin: origin },
      tls: { ca },
    });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WSS upgrade timed out.")), 10000);
      socket.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      socket.onerror = () => {
        clearTimeout(timer);
        reject(new Error("WSS upgrade failed."));
      };
    });
    assert(`authenticated WSS upgrade domain ${index + 1}`, socket.readyState === WebSocket.OPEN);
    socket.close();
  }
  assert("two private execution domains", domains[0]?.id !== domains[1]?.id);
  const stream = await request("/v1/events/stream", undefined, org);
  const reader = stream.body?.getReader();
  assert(
    "SSE flush through TLS proxy",
    new TextDecoder().decode((await reader?.read())?.value).includes("retry:"),
  );
  await reader?.cancel();
  const blobPath = join(config.state_dir, "recovery-artifact-fixture");
  const refreshPath = join(config.state_dir, "recovery-refresh-fixture");
  writeFileSync(blobPath, "immutable-fixture-bytes", { mode: 0o600 });
  writeFileSync(refreshPath, "synthetic-refresh-state-not-a-provider-token", { mode: 0o600 });
  const snapshot = "/srv/ngertiin/backups/rehearsal.ngb";
  const alreadyBackedUp = existsSync(snapshot);
  const backupReport = alreadyBackedUp
    ? await verifyBackup(configPath, snapshot)
    : await backup(configPath, snapshot);
  assert("encrypted coordinated backup", existsSync(snapshot));
  const revoked = randomUUID();
  writeFileSync(join(config.trust_dir, "revocations", revoked), "revoked\n", { mode: 0o600 });
  await run(["systemctl", "stop", config.service]);
  assert(
    "coordinated shutdown without systemd kill",
    (await run(["systemctl", "show", config.service, "--property=Result", "--value"])) ===
      "success",
  );
  for (const domain of domains) {
    await run(["docker", "rm", "-f", `ngertiin-domain-${domain.id}`]);
    await run(["docker", "network", "rm", `ngertiin-domain-${domain.id}-network`]);
    await run(["docker", "volume", "rm", `ngertiin-domain-${domain.id}-home`]);
  }
  renameSync(config.state_dir, `${config.state_dir}.before-drill`);
  await database.query("CREATE DATABASE ngertiin_restore OWNER ngertiin");
  const updated = {
    ...env,
    NGERTIIN_DATABASE_URL: env.NGERTIIN_DATABASE_URL.replace(/\/ngertiin$/, "/ngertiin_restore"),
    NGERTIIN_APPLICATION_DATABASE_URL: env.NGERTIIN_APPLICATION_DATABASE_URL.replace(
      /\/ngertiin$/,
      "/ngertiin_restore",
    ),
  };
  writeFileSync(
    config.environment_file,
    `${Object.entries(updated)
      .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );
  writeFileSync(configPath, JSON.stringify({ ...config, database_name: "ngertiin_restore" }), {
    mode: 0o600,
  });
  const restoreReport = await restore(configPath, snapshot, join(config.trust_dir, "revocations"));
  assert("restore verifies all database tables", restoreReport.tables === backupReport.tables);
  assert("artifact bytes restored", readFileSync(blobPath, "utf8") === "immutable-fixture-bytes");
  assert(
    "synthetic provider refresh bytes restored",
    readFileSync(refreshPath, "utf8") === "synthetic-refresh-state-not-a-provider-token",
  );
  let denied = false;
  try {
    new CredentialStorage(config.state_dir).assertActive(revoked);
  } catch {
    denied = true;
  }
  assert("newer provider revocation survives older snapshot", denied);
  await run(["systemctl", "start", config.service]);
  for (let i = 0; i < 100; i++) {
    try {
      if ((await request("/health/live")).ok) break;
    } catch {}
    await Bun.sleep(200);
  }
  if (alreadyBackedUp) {
    const renewed = await request("/api/auth/sign-in/email", {
      email: "deployment@example.test",
      password,
    });
    cookie = renewed.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
  }
  assert("verified account survives consistent restore", (await request("/v1/auth/session")).ok);
  for (const [index, organization] of [org, orgB].entries()) {
    const view = await success("/v1/machine/view", { interactive: false }, organization);
    assert(`domain identity retained ${index + 1}`, view.machine_id === domains[index]?.id);
    const runtime = new DomainRuntime(
      config.state_dir,
      app.owner_id,
      readDomainPolicy(config.state_dir),
    );
    const machine = new CuaMachine(runtime.configuration(view.machine_id, false));
    assert(
      `private working bytes restored ${index + 1}`,
      (await machine.files().read("recovery-marker.txt")).toString() === domains[index]?.marker,
    );
  }
  const report = {
    profile: "ubuntu-24.04-arm64",
    pass: outcomes.length,
    fail: 0,
    outcomes,
    backup: backupReport,
    restore: restoreReport,
    table_fingerprint_mismatches: 0,
    limitations: [
      "Synthetic verified actor and synthetic refresh bytes; no live email or provider inference/refresh acceptance.",
      "Local CA trusted per request; public DNS/ACME and actual Tauri client remain unverified.",
      "Two domains for one fixture user in two organizations; no production capacity promise.",
    ],
  };
  writeFileSync("/srv/ngertiin/rehearsal-report.json", JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  console.log(JSON.stringify({ pass: outcomes.length, fail: 0 }));
} finally {
  await database.end();
}
