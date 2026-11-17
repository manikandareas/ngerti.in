import assert from "node:assert/strict";
import { resolve, join } from "node:path";
import sharp from "../../../apps/server/node_modules/sharp";

const base = "http://127.0.0.1:49959";
const directory = resolve(".dev/nma049-native");
const { token } = await Bun.file(join(directory, "installation.json")).json();
const path = resolve(".dev/nma060-modalities-final-proof.json");
const proof: any = await Bun.file(path).exists() ? await Bun.file(path).json() : { runs: {} };
const phase = process.argv[2];
const report: any = { phase, started_at: new Date().toISOString(), checks: [] };
const out = `.dev/verification/nma-060/final-cohort/modality-final-${phase}.json`;
async function save() { await Bun.write(path, JSON.stringify(proof, null, 2)); await Bun.write(out, JSON.stringify(report, null, 2)); }
async function api(path: string, body?: unknown, key = crypto.randomUUID()) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const value = await response.json(); assert.equal(response.status, 200, `${path}: ${value.error?.code}`); return value;
}
async function run(name: string, text: string, artifacts: string[] = [], expected = "succeeded") {
  proof.runs[name] ??= { command_id: crypto.randomUUID(), text, artifact_ids: artifacts };
  await save(); const input = proof.runs[name];
  const receipt = await api("/v1/runs", { thread_id: proof.thread.id, agent_id: proof.agent.id, text: input.text, artifact_ids: input.artifact_ids }, input.command_id);
  input.run_id = receipt.run.id; await save();
  const start = Date.now();
  while (Date.now() - start < 360_000) {
    const snapshot = await api(`/v1/threads/${proof.thread.id}/snapshot`), current = snapshot.runs.find((r: any) => r.id === input.run_id);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(current.status)) {
      report.run = current; report.answer = snapshot.messages.find((m: any) => m.run_id === current.id && m.author === "agent")?.text;
      report.elapsed_ms = Date.now() - start; await save(); assert.equal(current.status, expected); return current;
    }
    await Bun.sleep(1000);
  }
  throw new Error("Native verification deadline exceeded; preserve original run identity.");
}
try {
  if (phase === "provision") {
    assert(!proof.agent);
    const connections = await api("/v1/entities/connection");
    const selected = connections.find((c: any) => c.harness === "codex" && c.state === "active" && c.authentication.method === "native_login"); assert(selected);
    proof.agent = await api("/v1/agents", { name: "Integration proof Codex", handle: `integration_${crypto.randomUUID().slice(0, 8)}`, harness: "codex", connection_id: selected.id, model_id: "gpt-6.1-sol", reasoning: "medium", instructions: "These are isolated one-time verification tasks, not persistent goals or Routines. Use only the explicitly requested native modality or assigned application tool. Do not read unrelated host files, create goals, change memory or create schedules. Do not repeat unknown external effects." });
    proof.thread = await api(`/v1/agents/${proof.agent.id}/dm`, {}); await save();
    await api(`/v1/threads/${proof.thread.id}/sessions`, { agent_id: proof.agent.id });
    report.connection = await api(`/v1/connections/${selected.id}/inspect`, {});
    report.checks.push("codex_subscription_identity_and_capabilities");
  } else if (phase === "image") {
    const workspace = (await api(`/v1/threads/${proof.thread.id}/snapshot`)).workspaces.find((w: any) => w.agent_id === proof.agent.id);
    assert(workspace);
    const svg = `<svg width="600" height="360" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="360" fill="white"/><rect x="50" y="40" width="120" height="120" fill="#135fea"/><polygon points="360,40 435,170 285,170" fill="#edab13"/><text x="48" y="280" font-family="Arial" font-size="52" fill="black">RAVEN 7146</text></svg>`;
    const image = await sharp(Buffer.from(svg)).png().toBuffer();
    await Bun.write(".dev/verification/nma-060/final-cohort/visual-input.png", image);
    proof.image ??= await api(`/v1/workspaces/${workspace.id}/uploads`, { name: "visual.png", media_type: "image/png", content_base64: image.toString("base64") }); await save();
    const current = await run("image", "Visually read the attached image. Report the exact printed code and describe the two shapes and their colors. Use the native image input already supplied; do not call shell, read_file, OCR, browser or other tools. Keep the answer concise.", [proof.image.id]);
    assert.equal(current.visual_inputs.length, 1); assert.equal(current.native_tools.length, 0); assert.match(report.answer, /7146/); assert.match(report.answer, /blue/i); assert.match(report.answer, /triangle/i);
    report.checks.push("native_visual_content_and_normalization_receipt");
  } else if (phase === "unsupported") {
    const workspace = (await api(`/v1/threads/${proof.thread.id}/snapshot`)).workspaces.find((w: any) => w.agent_id === proof.agent.id);
    proof.video ??= await api(`/v1/workspaces/${workspace.id}/uploads`, { name: "unsupported.mp4", media_type: "video/mp4", content_base64: Buffer.from("capability probe; never decode or dispatch").toString("base64") }); await save();
    const current = await run("unsupported-video", "Describe the attached video only if native video input is supported.", [proof.video.id], "failed");
    assert.equal(current.diagnostic.code, "CAPABILITY_UNSUPPORTED"); assert.equal(current.native_run_id, null); assert.equal(current.native_tools.length, 0); assert.equal(current.visual_inputs.length, 0);
    report.checks.push("unsupported_video_rejected_before_inference");
  } else if (phase === "research") {
    const current = await run("research", "Use native live web search to find the official Bun documentation about SQLite transactions. Open the official page through native web read. Explain in one short paragraph how an exception inside a transaction affects its changes, and include a direct HTTPS Markdown link to the specific official source supporting the answer. Do not use shell, browser tools, Composio, memory or prior knowledge as a substitute for searching and opening the source.");
    assert(current.native_tools.some((t: any) => t.name === "webSearch")); assert(current.sources.some((s: any) => new URL(s.url).hostname === "bun.com" || new URL(s.url).hostname === "bun.sh")); assert.match(report.answer, /https:\/\/(bun.com|bun.sh)\//);
    report.checks.push("native_web_search_open_and_attributed_answer");
  } else if (phase.startsWith("application")) {
    const assignment = await Bun.file(".dev/nma059/application-selection.json").json();
    const current = await run(phase, `First call ngertiin.describe_tools to read the exact wrapper schemas. Then use ngertiin.list_apps and discover the assigned read-only application tool ${assignment.tool} on connection ${assignment.connection_id}. Call ngertiin.execute_app_tool once with fields command_id, connection_id, tool, arguments to ${assignment.task}. Use a fresh command_id for this distinct safe read. Do not write, send messages, modify external data or use shell/browser. Return a concise factual summary and the receipt log ID. The earlier invalid wrapper request dispatched no provider operation. Do not repeat an unknown outcome.`);
    const effects = (await api("/v1/entities/app_effect")).filter((e: any) => e.run_id === current.id);
    assert.equal(effects.length, 1); assert.equal(effects[0].state, "succeeded"); assert(effects[0].log_id); assert(current.product_tools.includes("ngertiin.execute_app_tool"));
    report.effects = effects.map(({result, ...receipt}: any) => ({...receipt, result_keys: result ? Object.keys(result) : []})); report.checks.push("authorized_provider_read_through_agent_api_with_log_id");
  } else throw new Error("Unknown verification phase");
} catch (error) { report.error = String(error); process.exitCode = 1; }
finally { report.completed_at = new Date().toISOString(); await save(); }
