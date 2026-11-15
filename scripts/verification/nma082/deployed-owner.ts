import { mkdirSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const gateway = "http://127.0.0.1:54985";
async function request(path: string, body?: unknown, organization?: string) {
  const response = await fetch(`${gateway}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: gateway,
      ...(organization ? { "X-Ngertiin-Organization": organization } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error(`Owner setup request failed: ${path} (${response.status}).`);
  return response.json();
}
async function ssh(command: string) {
  const child = Bun.spawn(["/usr/bin/ssh", "-o", "BatchMode=yes", "mamvps", command], {
    stdout: "pipe", stderr: "ignore", stdin: "ignore",
  });
  const output = await new Response(child.stdout).text();
  if (await child.exited !== 0) throw new Error("Private owner bootstrap preparation failed.");
  return output;
}
const session = await request("/v1/auth/session");
if (session.authentication !== "native" || session.user.email !== "vitoandareas15@gmail.com" || !session.user.email_verified)
  throw new Error("The verified intended Owner must sign in through the actual native client first.");
// Root issues a grant; the real native principal must still consume it through normal HTTP.
const grant = JSON.parse(await ssh(`set -e
cd /opt/ngertiin/current
ip netns exec ngertiin /opt/ngertiin/bin/bun --env-file=/etc/ngertiin/server.env apps/server/src/auth/operator.ts issue-owner vitoandareas15@gmail.com > /srv/ngertiin/operator-secrets/owner-grant.json
python3 - <<'PY'
import json
from pathlib import Path
v=json.loads(Path('/srv/ngertiin/operator-secrets/owner-grant.json').read_text())
v['installation_owner_id']=json.loads(Path('/srv/ngertiin/state/installation.json').read_text())['owner_id']
print(json.dumps(v))
PY`));
const bound = await request("/v1/auth/bootstrap", { token: grant.token });
if (!bound.owner_bound) throw new Error("The intended Owner was not bound.");
const list = await request("/v1/organizations");
const organization = list.organizations[0] ?? (await request("/v1/organizations", { name: "Ngertiin Demo", slug: "ngertiin-demo" })).organization;
await request("/v1/data/legacy-binding", { organization_id: organization.id, legacy_owner_id: grant.installation_owner_id });
const provisioned = await request("/v1/data/provision", {}, organization.id);
const agents = await request("/v1/entities/agent", undefined, organization.id);
const threads = await request("/v1/entities/thread", undefined, organization.id);
const agent = agents.find((entry: any) => entry.system_role === "tobi");
const thread = threads.find((entry: any) => entry.type === "dm" && entry.member_agent_ids.includes(agent?.id));
if (!agent || !thread || provisioned.agent_id !== agent.id || provisioned.thread_id !== thread.id)
  throw new Error("Private default provisioning did not preserve its identities.");
const state = {
  server_origin: "https://demo.ngerti.in", gateway_origin: gateway,
  actor_id: session.user.id, native_session_id: session.session_id,
  installation_owner_id: grant.installation_owner_id,
  organization_id: organization.id, organization_name: organization.name,
  agent_id: agent.id, thread_id: thread.id,
};
mkdirSync(".dev/nma082-live", { recursive: true, mode: 0o700 });
writeFileSync(".dev/nma082-live/workspace.json", JSON.stringify(state, null, 2), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify({ native_owner_verified: true, bootstrap_consumed: true, organization_created: !list.organizations.length, private_defaults_preserved: true }));
