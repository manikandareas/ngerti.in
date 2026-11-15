import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

// This probe is restricted to the named disposable fixture, never an installed profile.
const root = resolve(import.meta.dir, "../../..");
const finalProfile = process.argv.includes("--final-profile");
const profile = JSON.parse(await readFile(resolve(root, `.dev/nma081/${finalProfile ? "client-final" : "client-a"}/profile.json`), "utf8"));
if (profile.mode !== "remote" || profile.serverOrigin !== "https://127.0.0.1:44431") throw new Error("Select the disposable NMA-081 profile.");
const base = `http://127.0.0.1:${profile.uiPort}`;
const metadata = await (await fetch("http://127.0.0.1:8441/state")).json();
const session = await (await fetch(`${base}/v1/auth/session`)).json();
if (!metadata.ready || metadata.origin !== profile.serverOrigin || session.user?.email !== "alice@example.test") throw new Error("The expected fixture actor is unavailable.");
const headers = { "X-Ngertiin-Organization": metadata.organization, Origin: base };
const agents = await (await fetch(`${base}/v1/entities/agent`, { headers })).json();
const threads = await (await fetch(`${base}/v1/entities/thread`, { headers })).json();
const agent = agents.find((agent: { system_role: string }) => agent.system_role === "tobi");
const thread = threads.find((thread: { type: string; member_agent_ids: string[] }) => thread.type === "dm" && thread.member_agent_ids.includes(agent.id));
const key = crypto.randomUUID();
const body = JSON.stringify({ thread_id: thread.id, agent_id: agent.id, text: `NMA-081 same-command proof ${key}` });
async function admit() {
  const reply = await fetch(`${base}/v1/runs`, { method: "POST", headers: { ...headers, "Content-Type": "application/json", "Idempotency-Key": key }, body });
  if (!reply.ok) throw new Error(`Fixture admission failed: ${reply.status}`);
  return reply.json();
}
const first = await admit();
const second = await admit();
if (!first.message?.id || first.message.id !== second.message?.id || first.run?.id !== second.run?.id) throw new Error("Native gateway duplicated a command.");
const snapshot = await fetch(`${base}/v1/threads/${thread.id}/snapshot`, { headers });
const context = snapshot.headers.get("X-Ngertiin-Event-Context");
const stream = await fetch(`${base}/v1/events/stream?after=0`, { headers: { ...headers, ...(context ? { "X-Ngertiin-Event-Context": context } : {}) }, signal: AbortSignal.timeout(10000) });
const reader = stream.body?.getReader();
const frame = await reader?.read();
await reader?.cancel();
const filename = resolve(root, ".dev/nma081/nma-081-transport-proof.txt");
const downloaded = resolve(process.env.HOME ?? "", "Downloads/nma-081-transport-proof.txt");
const source = await readFile(filename);
const result = {
  origin: profile.serverOrigin, native_authentication: session.authentication === "native",
  local_runtime_configuration_absent: !profile.configFile && !profile.bunExecutable && !profile.stateDirectory,
  same_command_ids: first.message.id === second.message.id && first.run.id === second.run.id,
  signed_snapshot_context: !!context, scoped_sse: stream.ok && !!frame?.value?.length,
  browser_session_independent: metadata.browserSessionAlive,
  download_bytes_match: source.equals(await readFile(downloaded)),
  attachment_sha256: createHash("sha256").update(source).digest("hex"),
};
await Bun.write(resolve(root, `docs/verification/nma-081/gateway-probe${finalProfile ? "-final" : ""}.json`), `${JSON.stringify(result, null, 2)}\n`);
if (Object.values(result).some(value => value === false)) throw new Error("A native gateway assertion failed.");
console.log(JSON.stringify(result));
