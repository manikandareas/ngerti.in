import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const release = "/opt/ngertiin/current";
const { loadOperations } = await import(`${release}/apps/server/src/operations/files.ts`);
const { developmentConfig } = await import(`${release}/apps/server/src/config.ts`);
const { Authentication } = await import(`${release}/apps/server/src/auth/service.ts`);
const { Organizations } = await import(`${release}/apps/server/src/organizations/service.ts`);
const { env } = loadOperations("/etc/ngertiin/operations.json");
Object.assign(process.env, env);
const app = developmentConfig();
if (app.authentication.origin !== "https://demo.ngerti.in") throw new Error("Unexpected deployment origin.");
const require = createRequire(`${release}/apps/server/package.json`);
const { Client } = require("pg");
const { hashPassword } = require("better-auth/crypto");
const path = "/srv/ngertiin/operator-secrets/isolation.json";
mkdirSync("/srv/ngertiin/operator-secrets", { recursive: true, mode: 0o700 });
const state: any = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {
  id: randomUUID(), email: "nma082-isolation@verification.invalid",
  password: randomBytes(32).toString("base64url"),
  marker: `NMA082-private-isolation-${randomUUID()}`,
};
// The fixture is a declared synthetic actor. It never replaces or bypasses Owner verification.
if (!existsSync(path)) writeFileSync(path, JSON.stringify(state), { mode: 0o600, flag: "wx" });
if (state.email !== "nma082-isolation@verification.invalid" || state.organization_id)
  throw new Error("Inspect the existing fixture before repeating setup.");
const db = new Client({ connectionString: env.NGERTIIN_DATABASE_URL });
await db.connect();
try {
  const owner = (await db.query('SELECT b.user_id FROM ngertiin_auth.ngertiin_owner_binding b JOIN ngertiin_auth."user" u ON u.id=b.user_id WHERE b.id=1 AND u.email=$1 AND u."emailVerified"=true', ["vitoandareas15@gmail.com"])).rows[0];
  if (!owner) throw new Error("Bind and verify the actual intended Owner before creating synthetic actors.");
  await db.query("BEGIN");
  await db.query('INSERT INTO ngertiin_auth."user"(id,name,email,"emailVerified","createdAt","updatedAt") VALUES($1,$2,$3,true,now(),now())', [state.id, "NMA082 isolated fixture", state.email]);
  await db.query('INSERT INTO ngertiin_auth.account(id,"accountId","providerId","userId",password,"createdAt","updatedAt") VALUES($1,$2,\'credential\',$3,$4,now(),now())', [randomUUID(), state.id, state.id, await hashPassword(state.password)]);
  await db.query("COMMIT");
} finally { await db.end(); }
const auth = await Authentication.open(app.authentication, env.NGERTIIN_DATABASE_URL, app.owner_id);
try { await new Organizations(auth).grantCreation(state.email, 1); }
finally { await auth.close(); }
let cookie = "";
async function request(path: string, body?: unknown, organization?: string) {
  const response = await fetch(`${app.authentication.origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: app.authentication.origin, Cookie: cookie,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Isolated fixture request failed: ${path} (${response.status}).`);
  if (path === "/api/auth/sign-in/email") cookie = response.headers.getSetCookie().map((v: string) => v.split(";")[0]).join("; ");
  return response.json();
}
await request("/api/auth/sign-in/email", { email: state.email, password: state.password });
const org = (await request("/v1/organizations", { name: "NMA082 Isolation Fixture", slug: "nma082-isolation-fixture" })).organization;
state.organization_id = org.id;
const defaults = await request("/v1/data/provision", {}, org.id);
state.agent_id = defaults.agent_id; state.thread_id = defaults.thread_id;
writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
const workspace = await request(`/v1/threads/${state.thread_id}/workspace?agent_id=${state.agent_id}`, undefined, org.id) ?? await request("/v1/workspaces", { thread_id: state.thread_id, agent_id: state.agent_id, name: "NMA082 isolated working files" }, org.id);
state.workspace_id = workspace.id;
const upload = await request(`/v1/workspaces/${workspace.id}/uploads`, { name: "nma082-isolation.txt", media_type: "text/plain", content_base64: Buffer.from(state.marker + "\n").toString("base64") }, org.id);
state.artifact_id = upload.id;
const synthetic = await request("/v1/connections/api-key", { harness: "muse", api_key: "nma082-synthetic-revocation-key-never-sent-to-a-provider" }, org.id);
state.synthetic_connection_id = synthetic.id;
state.synthetic_credential_ref = synthetic.authentication.credential_ref;
writeFileSync(path, JSON.stringify(state, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ actor: "synthetic-isolation-fixture", separate_organization: true, private_upload_created: true, synthetic_revocation_connection: true, provider_inference: false }));
