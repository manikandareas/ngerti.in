import assert from "node:assert/strict";

const base = "http://127.0.0.1:49959", phase = process.argv[2];
const { token } = await Bun.file(".dev/nma049-native/installation.json").json();
const proof = await Bun.file(".dev/nma059/proof.json").json();
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  assert.equal(response.status, 200, path); return response.json();
}
const report: any = { phase, checks: [], captured_at: new Date().toISOString() };
const all = async (kind: string) => api(`/v1/entities/${kind}`);
try {
  const snapshot = await api(`/v1/threads/${proof.thread.id}/snapshot`);
  const runs = snapshot.runs.filter((r: any) => Object.values(proof.runs).some((x: any) => x.run_id === r.id));
  assert.equal(runs.length, Object.keys(proof.runs).length);
  assert(runs.every((r: any) => ["succeeded", "failed"].includes(r.status)));
  const effects = (await all("app_effect")).filter((e: any) => e.agent_id === proof.agent.id);
  assert.equal(effects.length, 3); assert.equal(effects.filter((e: any) => e.state === "succeeded").length, 1); assert.equal(effects.filter((e: any) => e.state === "unknown").length, 2);
  report.effects = effects.map(({result,...e}: any) => ({...e,result_keys: result ? Object.keys(result) : []}));
  report.sessions = (await all("app_session")).filter((s: any) => s.agent_id === proof.agent.id);
  report.runs = runs.map((r: any) => ({id:r.id,status:r.status,native_run_id:r.native_run_id,product_tools:r.product_tools,sources:r.sources,visual_inputs:r.visual_inputs}));
  report.checks.push("one_known_app_success_and_two_retained_unknown_effects");
  for (const input of Object.values(proof.runs) as any[]) {
    const replay = await api("/v1/runs", { thread_id: proof.thread.id, agent_id: proof.agent.id, text: input.text, artifact_ids: input.artifact_ids }, input.command_id);
    assert.equal(replay.run.id, input.run_id);
  }
  assert.equal((await api(`/v1/threads/${proof.thread.id}/snapshot`)).runs.length, snapshot.runs.length);
  assert.equal((await all("app_effect")).filter((e: any) => e.agent_id === proof.agent.id).length, 3);
  report.checks.push("original_admission_receipts_replay_without_new_runs_or_app_effects");
  if (phase === "after") {
    const before = await Bun.file(".dev/verification/nma-059/receipts-before.json").json();
    assert.deepEqual(report.effects, before.effects); assert.deepEqual(report.sessions, before.sessions); assert.deepEqual(report.runs, before.runs);
    report.checks.push("application_sessions_effects_and_run_observations_persist_after_backend_restart");
  }
  if (phase === "cleanup") {
    const connections = await api("/v1/apps/connections");
    for (const connection of connections) {
      const grants = connection.grants.filter((g: any) => g.agent_id !== proof.agent.id);
      if (grants.length !== connection.grants.length) await api(`/v1/apps/connections/${connection.id}/assign`, { expected_revision: connection.revision, grants });
    }
    assert.equal((await all("goal")).filter((g: any) => g.agent_id === proof.agent.id).length, 0);
    assert.equal((await all("routine")).filter((r: any) => r.agent_id === proof.agent.id).length, 0);
    report.connection_states = (await api("/v1/apps/connections")).map((c: any) => ({id:c.id,toolkit:c.toolkit,state:c.state,grants:c.grants.length}));
    report.checks.push("proof_grants_removed_user_connections_and_unknown_receipts_retained_zero_proof_goals_or_routines");
  }
} catch (error) { report.error = String(error); process.exitCode = 1; }
await Bun.write(`.dev/verification/nma-059/receipts-${phase}.json`, JSON.stringify(report,null,2));
