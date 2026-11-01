import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
const state = ".dev/nma049-native";
const { token } = await Bun.file(`${state}/installation.json`).json();
const privateFile = ".dev/nma060-final-proof.json";
const proof: any = await Bun.file(privateFile).exists() ? await Bun.file(privateFile).json() : { lanes: {} };
async function save() { await Bun.write(privateFile, JSON.stringify(proof, null, 2)); }
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
 const response = await fetch(`http://127.0.0.1:49959${path}`, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, body: body === undefined ? undefined : JSON.stringify(body) });
 const value = await response.json(); assert.equal(response.status, 200, `${path}: ${value.error?.code}`); return value;
}
const phase = process.argv[2];
if (phase === "provision") {
 assert(!proof.connection, "Already provisioned");
 assert(process.env.MUSE_API_KEY, "Muse key unavailable");
 proof.credential_ref = crypto.randomUUID(); await save();
 mkdirSync(`${state}/credentials`, { recursive: true, mode: 0o700 });
 writeFileSync(`${state}/credentials/${proof.credential_ref}`, process.env.MUSE_API_KEY!, { mode: 0o600, flag: "wx" });
 proof.connection = await api("/v1/connections", { harness: "muse", authentication: { method: "api_key", billing_source: "api_key", credential_ref: proof.credential_ref } }); await save();
 const connections = await api("/v1/entities/connection");
 const codex = connections.find((c: any) => c.harness === "codex" && c.state === "active" && c.authentication.billing_source === "subscription" && c.login === "authenticated"); assert(codex);
 for (const [family, c, model] of [["codex", codex, "gpt-6.1-sol"], ["muse", proof.connection, "muse-spark-1.3"]] as const) {
  const inspected = await api(`/v1/connections/${c.id}/inspect`, {});
  assert.equal(inspected.effective_billing_source, family === "codex" ? "subscription" : "api_key");
  proof.lanes[family] = { key: crypto.randomUUID(), input: { connection_id: c.id, model_id: model, reasoning: "medium", billing_source: inspected.effective_billing_source, opener: `Please use your scoped configuration tool to set your name to Gate proof ${family} and your instructions to Keep answers concise. Read your profile to obtain its current revision first. Then calculate 137 times 23 and reply briefly. This is a one-time task, not a goal or Routine. Do not change files, memory, skills or external apps.` } }; await save();
 }
} else if (phase === "codex" || phase === "muse") {
 const lane = proof.lanes[phase]; assert(lane);
 lane.receipt = await api("/v1/creation/agents", lane.input, lane.key); await save();
 console.log(JSON.stringify({ phase, agent_id: lane.receipt.agent.id, run_id: lane.receipt.run.id }));
} else if (phase === "group-codex" || phase === "group-muse") {
 const family = phase.slice(6); const lane = proof.lanes[family];
 lane.group_key ??= crypto.randomUUID(); await save();
 lane.group = await api("/v1/creation/groups", { name: `Proof group ${family}`, member_agent_ids: [proof.lanes.codex.receipt.agent.id, proof.lanes.muse.receipt.agent.id], opener: `Gate proof ${family}, please answer this request. Update this group shared_instructions to Use primary sources and its name to Research circle using the scoped group tool and current group revision from your context. Do not change your global profile. Then calculate 19 times 17. This is one-time work, not a goal or Routine. Do not modify memory, files or apps.` }, lane.group_key); await save();
 console.log(JSON.stringify({ phase, thread_id: lane.group.thread.id }));
} else if (phase === "verify") {
 const checks = [];
 for (const [family, lane] of Object.entries(proof.lanes) as any) {
  const before = await api(`/v1/threads/${lane.receipt.thread.id}/snapshot`);
  assert.deepEqual(await api("/v1/creation/agents", lane.input, lane.key), lane.receipt);
  const after = await api(`/v1/threads/${lane.receipt.thread.id}/snapshot`);
  assert.equal(before.cursor, after.cursor);
  assert.equal(after.runs.length, 1); assert.equal(after.runs[0].status, "succeeded");
  assert.equal(after.agents[0].name, `Gate proof ${family}`);
  assert(after.runs[0].product_tools.includes("ngertiin.update_agent"));
  assert(after.messages.some((m: any) => m.author === "agent" && m.text.includes("3151")));
  const group = await api(`/v1/threads/${lane.group.thread.id}/snapshot`);
  assert.equal(group.runs.length, 1); assert.equal(group.runs[0].status, "succeeded");
  assert.equal(group.thread.name, "Research circle");
  assert.equal(group.thread.shared_instructions, "Use primary sources");
  assert(group.runs[0].product_tools.includes("ngertiin.update_group"));
  assert.equal(group.agents.find((a: any) => a.id === lane.receipt.agent.id).revision, after.agents[0].revision);
  assert.equal(group.messages.filter((m: any) => m.author === "agent").length, 1);
  assert.equal(group.goals.length + group.routines.length + after.goals.length + after.routines.length, 0);
  const router = await api(`/v1/entities/run/${group.routes[0].router_run_id}`);
  assert.equal(router.status, "succeeded");
  checks.push({ family, dm_run: after.runs[0], group_run: group.runs[0], router_run: router, profile: after.agents[0], group: group.thread, replay_cursor: after.cursor });
 }
 await Bun.write("docs/verification/nma-060/completion/native-verified.json", JSON.stringify({ checks, native_runs: 6, pass: 6, fail: 0, skip: 0, unknown: 0 }, null, 2));
 console.log("Verified six native runs, both scoped mutations, restart persistence and admission replay.");
} else if (phase === "cleanup") {
 await api(`/v1/connections/${proof.connection.id}/revoke`, {});
 const { unlinkSync } = await import("node:fs"); unlinkSync(`${state}/credentials/${proof.credential_ref}`);
 console.log("Revoked proof Muse connection and removed only its credential copy.");
} else if (phase === "observe") {
 const results = [];
 for (const [family, lane] of Object.entries(proof.lanes) as any) {
  if (!lane.receipt) continue;
  const snapshot = await api(`/v1/threads/${lane.receipt.thread.id}/snapshot`);
  results.push({ family, snapshot });
  if (lane.group) results.push({ family: `${family}-group`, snapshot: await api(`/v1/threads/${lane.group.thread.id}/snapshot`) });
 }
 await Bun.write("docs/verification/nma-060/completion/native.json", JSON.stringify(results, null, 2));
 console.log(JSON.stringify(results.map((r:any) => ({family:r.family, runs:r.snapshot.runs.map((v:any)=>({status:v.status,diagnostic:v.diagnostic,tools:v.product_tools})), agents:r.snapshot.agents.map((a:any)=>({name:a.name,revision:a.revision})), messages:r.snapshot.messages.map((m:any)=>m.text)}))));
}
