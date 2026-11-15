import { readFileSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

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
const path = "/srv/ngertiin/operator-secrets/isolation.json";
const fixture = JSON.parse(readFileSync(path, "utf8"));
if (fixture.email !== "nma082-isolation@verification.invalid" || fixture.capacity)
  throw new Error("Inspect the retained capacity fixture before repeating admission.");
const auth = await Authentication.open(app.authentication, env.NGERTIIN_DATABASE_URL, app.owner_id);
try { await new Organizations(auth).grantCreation(fixture.email, 2); }
finally { await auth.close(); }
let cookie = "";
async function request(path: string, body?: unknown, organization?: string) {
  return fetch(`${app.authentication.origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: app.authentication.origin, Cookie: cookie,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
}
async function json(path: string, body?: unknown, organization?: string): Promise<any> {
  const response = await request(path, body, organization);
  if (!response.ok) throw new Error(`Capacity fixture setup failed: ${path} (${response.status}).`);
  return response.json();
}
const login = await request("/api/auth/sign-in/email", { email: fixture.email, password: fixture.password });
if (!login.ok) throw new Error("Synthetic capacity actor sign-in failed.");
cookie = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
const org = (await json("/v1/organizations", { name: "NMA082 Capacity Fixture", slug: "nma082-capacity-fixture" })).organization;
const defaults = await json("/v1/data/provision", {}, org.id);
const workspace = await json("/v1/workspaces", { thread_id: defaults.thread_id, agent_id: defaults.agent_id, name: "NMA082 capacity admission" }, org.id);
fixture.capacity = { organization_id: org.id, workspace_id: workspace.id };
writeFileSync(path, JSON.stringify(fixture, null, 2), { mode: 0o600 });
const denied = await request(`/v1/workspaces/${workspace.id}/uploads`, { name: "capacity.txt", media_type: "text/plain", content_base64: Buffer.from("NMA082 capacity fixture\n").toString("base64") }, org.id);
const error: any = await denied.json();
if (denied.status !== 503 || error.error?.code !== "MACHINE_CAPACITY")
  throw new Error(`Third-domain admission did not return MACHINE_CAPACITY (${denied.status}).`);
console.log(JSON.stringify({ max_domains: 2, active_domains: 2, third_domain_status: denied.status, third_domain_code: error.error.code, provider_inference: false }));
