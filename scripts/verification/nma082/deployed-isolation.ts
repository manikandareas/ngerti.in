import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const owner = JSON.parse(readFileSync(".dev/nma082-live/workspace.json", "utf8"));
const fixture = JSON.parse(readFileSync(".dev/nma082-live/isolation.json", "utf8"));
const native = JSON.parse(readFileSync(".dev/nma082-live/native-before.json", "utf8"));
const phase = process.argv[2] ?? "before";
if (!["before", "after"].includes(phase)) throw new Error("Choose before or after restore.");
const report: any = { phase, checks: [], completed: false };
function check(name: string, pass: boolean) {
  report.checks.push({ name, pass });
  writeFileSync(`.dev/nma082-live/isolation-${phase}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  if (!pass) throw new Error(`Deployed isolation check failed: ${name}.`);
}
let cookie = "";
async function request(actor: "owner" | "fixture", path: string, body?: unknown, org?: string) {
  const origin = actor === "owner" ? owner.gateway_origin : owner.server_origin;
  return fetch(`${origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin, ...(actor === "fixture" ? { Cookie: cookie } : {}),
      "X-Ngertiin-Organization": org ?? (actor === "owner" ? owner.organization_id : fixture.organization_id),
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
}
const login = await request("fixture", "/api/auth/sign-in/email", { email: fixture.email, password: fixture.password });
check("synthetic actor signs in through public HTTPS", login.ok);
cookie = login.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ");
const own = native.lanes[0];
const paths = [
  [`/v1/threads/${JSON.parse(readFileSync(".dev/nma082-live/native-state.json", "utf8")).codex.thread_id}/snapshot`, `/v1/threads/${fixture.thread_id}/snapshot`],
  [`/v1/workspaces/${own.workspace_id}`, `/v1/workspaces/${fixture.workspace_id}`],
  [`/v1/artifacts/${own.artifact_id}/content?workspace_id=${own.workspace_id}`, `/v1/artifacts/${fixture.artifact_id}/content?workspace_id=${fixture.workspace_id}`],
];
for (const [index, [ownerPath, fixturePath]] of paths.entries()) {
  check(`fixture cannot read Owner resource ${index + 1}`, (await request("fixture", ownerPath)).status === 404);
  check(`Owner cannot read fixture resource ${index + 1}`, (await request("owner", fixturePath)).status === 404);
}
check("fixture cannot select Owner organization", (await request("fixture", "/v1/entities/agent", undefined, owner.organization_id)).status === 403);
check("Owner cannot select fixture organization", (await request("owner", "/v1/entities/agent", undefined, fixture.organization_id)).status === 403);
const bytes = await request("fixture", `/v1/artifacts/${fixture.artifact_id}/content?workspace_id=${fixture.workspace_id}`);
check("fixture upload bytes remain private and intact", bytes.ok && await bytes.text() === fixture.marker + "\n");
const machines = [];
for (const actor of ["owner", "fixture"] as const) {
  const response = await request(actor, "/v1/machine");
  check(`${actor} machine is healthy`, response.ok);
  machines.push(await response.json());
}
check("execution-domain identities differ", machines[0].id !== machines[1].id);
report.machines = machines.map((v) => ({ id: v.id, state: v.state, generation: v.generation }));
report.completed = true;
writeFileSync(`.dev/nma082-live/isolation-${phase}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ phase, pass: report.checks.length, fail: 0, separate_domains: true }));
