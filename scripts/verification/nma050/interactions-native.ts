import assert from "node:assert/strict";
import { operationSchemas } from "../../../apps/server/src/api-responses";
const { token } = await Bun.file(".dev/nma049-native/installation.json").json();

const file = ".dev/nma050-interactions/proof.json";
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
await save();
if (!proof.connection) {
  assert(process.env.MUSE_API_KEY, "Muse key unavailable");
  const { writeFileSync } = await import("node:fs");
  proof.credential_ref = crypto.randomUUID(); await save();
  writeFileSync(`.dev/nma049-native/credentials/${proof.credential_ref}`, process.env.MUSE_API_KEY!, { mode: 0o600, flag: "wx" });
  proof.connection = await api("/v1/connections", { harness: "muse", authentication: { method: "api_key", billing_source: "api_key", credential_ref: proof.credential_ref } }); await save();
  proof.inspection = await api(`/v1/connections/${proof.connection.id}/inspect`, {});
  assert.equal(proof.inspection.effective_billing_source, "api_key"); await save();
}
proof.receipt ??= await api("/v1/creation/agents", {
  connection_id: proof.connection.id, model_id: "muse-spark-1.3", reasoning: "medium", billing_source: "api_key",
  opener: "Use the native request_user_input tool to ask which arithmetic check to perform: 2+3 or 4+5. Wait for the answer, then calculate only the selected expression. This is a one-time protocol verification, not a goal or Routine. Do not write profiles, files, memory or skills, and do not call external applications. Ask through the actual native tool, not just prose.",
}, proof.key);
await save();
const runId = proof.receipt.run.id;
const deadline = Date.now() + 180000;
try {
  while (Date.now() < deadline) {
    proof.run = await api(`/v1/entities/run/${runId}`);
    if (["succeeded", "failed", "unknown", "cancelled"].includes(proof.run.status)) break;
    if (proof.run.status === "running" && !proof.answer_attempted) {
      const pending = operationSchemas.interactions.parse(await api(`/v1/runs/${runId}/interactions`));
      if (pending.user_inputs.length) {
        proof.pending = pending;
        const request = pending.user_inputs[0];
        proof.answer_attempted = true; await save();
        proof.answer = await api(`/v1/runs/${runId}/interactions`, {
          type: "user_input", request_id: request.userInputId,
          answers: request.questions.map(q => ({ questionId: q.id, selectedLabel: q.options[0].label })),
        });
        operationSchemas.interaction_submitted.parse(proof.answer);
        await save();
      }
    }
    await Bun.sleep(500);
  }
  assert(proof.pending, "No native question was observed; prose does not count.");
  assert.equal(proof.run.status, "succeeded");
  proof.snapshot = await api(`/v1/threads/${proof.receipt.thread.id}/snapshot`);
  assert.equal(proof.snapshot.goals.length + proof.snapshot.routines.length, 0);
  proof.pass = true;
} catch (error) {
  proof.error = error instanceof Error ? error.message : "Native interaction verification failed.";
  process.exitCode = 1;
} finally {
  await save();
  await Bun.write(".dev/verification/nma-050/interactions/question-native.json", JSON.stringify({
    evidence_level: "native_question_answer_not_permission_approval", run: proof.run,
    pending: proof.pending, answer: proof.answer, pass: proof.pass ?? false, error: proof.error ?? null,
    native_requests: 1, permission_approval_verified: false,
  }, null, 2));
  console.log(JSON.stringify({ status: proof.run?.status, pass: proof.pass ?? false, error: proof.error ?? null }));
}
