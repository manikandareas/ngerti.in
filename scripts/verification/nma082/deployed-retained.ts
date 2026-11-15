import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const owner = JSON.parse(readFileSync(".dev/nma082-live/workspace.json", "utf8"));
const before = JSON.parse(readFileSync(".dev/nma082-live/native-before.json", "utf8"));
const state = JSON.parse(readFileSync(".dev/nma082-live/native-state.json", "utf8"));
const report: any = { checks: [], completed: false };
function check(name: string, pass: boolean) {
  report.checks.push({ name, pass });
  writeFileSync(".dev/nma082-live/retained-after.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  if (!pass) throw new Error(`Restored native state check failed: ${name}.`);
}
async function request(path: string, body?: unknown, key?: string) {
  return fetch(`${owner.gateway_origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: owner.gateway_origin, "X-Ngertiin-Organization": owner.organization_id,
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": key! }),
    }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(120000),
  });
}
async function json(path: string, body?: unknown, key?: string) {
  const response = await request(path, body, key);
  if (!response.ok) throw new Error(`Restored native state request failed: ${path} (${response.status}).`);
  return response.json();
}
for (const lane of before.lanes) {
  const run = await json(`/v1/entities/run/${lane.run_id}`);
  check(`${lane.harness}: original completed run retained`, run.status === "succeeded" && !!run.native_run_id);
  const message = await json(`/v1/entities/message/${run.input_message_id}`);
  const context = state[lane.harness];
  const replay = await json("/v1/runs", { thread_id: context.thread_id, agent_id: context.agent_id, text: message.text }, lane.command_id);
  // Admission receipts retain their original queued projection, not the later terminal revision.
  const unchanged = await json(`/v1/entities/run/${lane.run_id}`);
  check(`${lane.harness}: original receipt replays without inference`, replay.run.id === run.id && unchanged.native_run_id === run.native_run_id && unchanged.revision === run.revision);
  const working = await request(`/v1/workspaces/${lane.workspace_id}/file?path=${encodeURIComponent(lane.path)}`);
  check(`${lane.harness}: private working bytes restored`, working.ok && await working.text() === lane.marker + "\n");
  const artifact = await request(`/v1/artifacts/${lane.artifact_id}/content?workspace_id=${lane.workspace_id}`);
  const bytes = Buffer.from(await artifact.arrayBuffer());
  check(`${lane.harness}: artifact bytes restored`, artifact.ok && createHash("sha256").update(bytes).digest("hex") === lane.artifact_sha256);
}
report.completed = true;
writeFileSync(".dev/nma082-live/retained-after.json", JSON.stringify(report, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ pass: report.checks.length, fail: 0, original_receipts_replayed: 2, new_inference: false }));
