import assert from "node:assert/strict";
import { operationSchemas } from "../../../apps/server/src/api-responses";
const { token } = await Bun.file(".dev/nma049-native/installation.json").json();

const cohort = await Bun.file(".dev/nma050-interactions/proof.json").json();
const decision = process.argv[2] ?? "abort";
assert(["abort", "approved"].includes(decision));
const file = `.dev/nma050-interactions/approval-${decision}-proof.json`;
const proof = await Bun.file(file).exists() ? await Bun.file(file).json() : { key: crypto.randomUUID() };
const save = () => Bun.write(file, JSON.stringify(proof, null, 2));
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(`http://127.0.0.1:49959${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const value = await response.json();
  assert.equal(response.status, 200, `${path}: ${value.error?.code}`);
  return value;
}
delete proof.error;
await save();
proof.connection = cohort.connection;
proof.receipt ??= await api("/v1/creation/agents", {
  connection_id: proof.connection.id, model_id: "muse-spark-1.3", reasoning: "medium", billing_source: "api_key",
  opener: "Use ngertiin.update_agent to set your own name to Permission proof after reading your profile revision. Call it once only. If permission is denied, do not retry or use another route. This is a one-time verification, not a goal or Routine. Do not modify files, memory or external apps.",
}, proof.key);
await save();
const runId = proof.receipt.run.id;
const deadline = Date.now() + 180000;
try {
  while (Date.now() < deadline) {
    proof.run = await api(`/v1/entities/run/${runId}`);
    if (["succeeded", "failed", "unknown", "cancelled"].includes(proof.run.status)) break;
    if (proof.run.status === "running" ) {
      const pending = operationSchemas.interactions.parse(await api(`/v1/runs/${runId}/interactions`));
      if (pending.approvals.length) {
        proof.pending = pending;
        proof.requests ??= []; proof.requests.push(pending);
        const request = pending.approvals[0];
        const choice = request.availableChoices.find(c => c.decision === decision && c.scope === "once");
        assert(choice, "No matching one-time choice");
        assert(request.toolName, "Native approval must identify its tool");
        assert(request.availableChoices.every(c => c.label), "Native choices need labels");
        assert(["describe_tools", "read_run_context", "read_agent", "list_agents", "update_agent"].some(name => request.toolName!.endsWith(name)), "Unexpected approval tool");
        proof.answer_attempted = true; await save();
        proof.answer = await api(`/v1/runs/${runId}/interactions`, {
          type: "approval", request_id: request.approvalId,
          source_index: request.currentRequirementId.sourceIndex, choice_id: choice.choiceId,
        });
        operationSchemas.interaction_submitted.parse(proof.answer);
        await save();
      }
    }
    await Bun.sleep(500);
  }
  assert(proof.pending, "No native approval was observed; prose does not count.");
  assert.equal(proof.run.status, "succeeded");
  proof.snapshot = await api(`/v1/threads/${proof.receipt.thread.id}/snapshot`);
  assert.equal(proof.snapshot.goals.length + proof.snapshot.routines.length, 0);
  const agent = proof.snapshot.agents.find((a: { id: string }) => a.id === proof.receipt.agent.id);
  if (decision === "approved") assert.equal(agent.name, "Permission proof");
  else assert.equal(agent.name, proof.receipt.agent.name);
  const stale = await fetch(`http://127.0.0.1:49959/v1/runs/${runId}/interactions`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({type: "approval", request_id: proof.pending.approvals[0].approvalId,
      source_index: proof.pending.approvals[0].currentRequirementId.sourceIndex, choice_id: proof.pending.approvals[0].availableChoices[0].choiceId}),
  });
  assert.equal(stale.status, 409); proof.stale_response = {status: stale.status, body: await stale.json()};
  proof.pass = true;
} catch (error) {
  proof.error = error instanceof Error ? error.message : "Native interaction verification failed.";
  process.exitCode = 1;
} finally {
  await save();
  await Bun.write(`.dev/verification/nma-050/interactions/approval-${decision}-native.json`, JSON.stringify({
    evidence_level: `native_permission_${decision}`, run: proof.run,
    requests: proof.requests, stale_response: proof.stale_response, pending: proof.pending, answer: proof.answer, pass: proof.pass ?? false, error: proof.error ?? null,
    native_requests: 1, permission_approval_verified: proof.pass ?? false,
  }, null, 2));
  console.log(JSON.stringify({ status: proof.run?.status, pass: proof.pass ?? false, error: proof.error ?? null }));
}
