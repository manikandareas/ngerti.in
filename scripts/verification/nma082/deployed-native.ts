import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (process.env.NGERTIIN_NMA082_DEPLOYED !== "demo.ngerti.in")
  throw new Error("Select the explicitly authorized NMA-082 deployment.");
process.umask(0o077);
const cohort = process.argv[2];
if (!["before", "after"].includes(cohort)) throw new Error("Choose before or after the recovery drill.");
const workspace = JSON.parse(readFileSync(".dev/nma082-live/workspace.json", "utf8"));
const providers = JSON.parse(readFileSync(".dev/nma082-live/provider-target.json", "utf8"));
const statePath = ".dev/nma082-live/native-state.json";
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : {};
const report: any = { cohort, started_at: new Date().toISOString(), lanes: [], completed: false };
const save = () => {
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
  writeFileSync(`.dev/nma082-live/native-${cohort}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
};
async function request(path: string, body?: unknown, key?: string) {
  return fetch(`${workspace.gateway_origin}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: workspace.gateway_origin,
      "X-Ngertiin-Organization": workspace.organization_id,
      ...(body === undefined ? {} : { "Content-Type": "application/json", "Idempotency-Key": key ?? randomUUID() }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
}
async function json(path: string, body?: unknown, key?: string) {
  const response = await request(path, body, key);
  if (!response.ok) throw new Error(`Native verification request failed: ${path} (${response.status}).`);
  return response.json();
}
try {
  const session = await json("/v1/auth/session");
  if (session.authentication !== "native" || session.user.id !== workspace.actor_id)
    throw new Error("The intended actual Tauri session is required.");
  if (!state.codex) state.codex = { agent_id: workspace.agent_id, thread_id: workspace.thread_id };
  if (!state.muse) {
    if (cohort !== "before") throw new Error("Recover the retained verification identities first.");
    const agent = await json("/v1/agents", {
      name: "NMA-082 Muse", harness: "muse", connection_id: providers.muse.id,
      billing_source: "api_key", model_id: providers.muse.model_id, reasoning: providers.muse.reasoning,
      instructions: "Complete one-time verification requests without creating Goals or Routine.",
    });
    const thread = await json(`/v1/agents/${agent.id}/dm`, {});
    state.muse = { agent_id: agent.id, thread_id: thread.id };
    save();
  }
  for (const harness of ["codex", "muse"] as const) {
    const lane = state[harness];
    const provider = providers[harness];
    await json("/v1/ai/selections", {
      scope: "conversation", thread_id: lane.thread_id, agent_id: lane.agent_id, harness,
      selection: { connection_id: provider.id, model_id: provider.model_id, reasoning: provider.reasoning },
    });
    const marker = `NMA082-${cohort}-${harness}-${randomUUID()}`;
    const path = `.ngertiin-verification/nma082-${cohort}-${harness}.txt`;
    const text = `Perform this one-time deployment verification using application product tools only. Write exactly ${JSON.stringify(marker + "\n")} to the workspace-relative file ${JSON.stringify(path)}. Read the saved file back, publish it as an artifact, and obtain the current desktop state once through the Computer product tools. ${cohort === "after" ? `Use the new artifact identity ${randomUUID()} for this publication. ` : ""}Report the verified marker and saved file. Do not use native host shell or host file tools. Do not create a Goal or Routine.`;
    const command = randomUUID();
    const body = { thread_id: lane.thread_id, agent_id: lane.agent_id, text };
    const admission = await json("/v1/runs", body, command);
    if (!admission.run?.id) throw new Error("The normal verification admission did not return a run.");
    const observation: any = { harness, run_id: admission.run.id, marker, path, command_id: command, model: provider.model_id, billing: provider.billing_source, status: "pending" };
    report.lanes.push(observation); save();
    console.log(JSON.stringify({ event: "deployed.native.admitted", harness, cohort, run_id: admission.run.id }));
    const deadline = Date.now() + 600000;
    let current: any;
    do {
      current = await json(`/v1/entities/run/${admission.run.id}`);
      if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) break;
      if (Date.now() >= deadline) throw new Error("Inspect the retained run before any retry; the verification deadline elapsed.");
      await Bun.sleep(1000);
    } while (true);
    observation.status = current.status;
    observation.product_tools = current.product_tools;
    observation.tool_errors = current.tool_errors?.map((entry: any) => entry.code);
    observation.native_accepted = !!current.native_run_id;
    observation.diagnostic = current.diagnostic;
    observation.provider_identity_unchanged = current.provider_selection?.connection_id === provider.id && current.provider_selection?.billing_source === provider.billing_source;
    save();
    if (current.status !== "succeeded") throw new Error(`The actual ${harness} run did not succeed; inspect its retained report.`);
    const binding = await json(`/v1/threads/${lane.thread_id}/workspace?agent_id=${lane.agent_id}`);
    const bytes = await request(`/v1/workspaces/${binding.id}/file?path=${encodeURIComponent(path)}`);
    if (!bytes.ok || await bytes.text() !== marker + "\n") throw new Error("Native working-file bytes did not match the admitted marker.");
    const artifacts = await json("/v1/entities/artifact");
    const artifact = artifacts.find((entry: any) => entry.run_id === current.id && entry.source_path === path);
    if (!artifact) throw new Error("The useful native run did not publish its file as an artifact.");
    const downloaded = await request(`/v1/artifacts/${artifact.id}/content?workspace_id=${binding.id}`);
    const downloadedBytes = Buffer.from(await downloaded.arrayBuffer());
    if (!downloaded.ok || downloadedBytes.toString() !== marker + "\n") throw new Error("Native artifact download bytes differ from the file.");
    const replay = await json("/v1/runs", body, command);
    if (replay.run?.id !== current.id) throw new Error("The normal command receipt did not replay its original run.");
    observation.working_bytes_verified = true;
    observation.artifact_id = artifact.id;
    observation.workspace_id = binding.id;
    observation.artifact_sha256 = createHash("sha256").update(downloadedBytes).digest("hex");
    observation.same_command_replayed = true;
    save();
    console.log(JSON.stringify({ event: "deployed.native.verified", harness, cohort, status: current.status, product_tools: current.product_tools }));
  }
  report.completed = true; report.completed_at = new Date().toISOString(); save();
} catch (error) {
  report.failure = error instanceof Error ? error.message : "Native verification failed.";
  save(); throw error;
}
