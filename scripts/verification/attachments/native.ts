import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION, type Entity } from "../../../apps/server/src/contracts";
import { detectHarness } from "../../../apps/server/src/harness/availability";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const root = mkdtempSync(join(tmpdir(), "ngertiin-attachment-native-"));
const output = resolve(process.argv[2] ?? "docs/verification/attachments/native.json");
const owner = crypto.randomUUID();
const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
const marker = `TURQUOISE-${crypto.randomUUID().slice(0, 8)}`;
const detect = (harness: "codex" | "muse") => detectHarness(harness, harness === "muse" ? process.env.NGERTIIN_MUSE_EXECUTABLE : undefined);
const report: { contract: string; started_at: string; lanes: object[]; pass: boolean; error?: string; cleanup?: object } = { contract: CONTRACT_VERSION, started_at: new Date().toISOString(), lanes: [], pass: false };
let store!: Store;
let lifecycle!: Lifecycle;
let broker: HarnessBroker;
let background: Background;
let tools: ProductTools;
let app: ReturnType<typeof createApi>;
async function save() { await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`); }
function start() {
  store = new Store(join(root, "state.sqlite"), owner);
  lifecycle = new Lifecycle(store);
  tools = new ProductTools(lifecycle);
  const credentials = new CredentialContexts(root, () => { assert(process.env.MUSE_API_KEY, "Muse key unavailable."); return process.env.MUSE_API_KEY; });
  broker = new HarnessBroker(lifecycle, credentials, tools, {
    codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
  }, detect);
  background = new Background(lifecycle, broker.executors());
  app = createApi(lifecycle, background, token, { connections: new Connections(lifecycle), tools, broker }).listen({ hostname: "127.0.0.1", port: 0 });
  background.start(100);
}
async function stop() {
  await background?.stop();
  await broker?.close();
  await tools?.browsers.shutdown();
  if (app?.server) await app.stop(true);
  if (store && !store.closed) store.close();
}
async function api(path: string, body?: object, key = crypto.randomUUID()): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${app.server?.port}${path}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": key }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  assert.equal(response.status, 200, `${path}: ${result.error?.code}`);
  return result;
}
function pdf() {
  const texts = ["Attachment verification cover", "Document reference instructions", `Verification key: ${marker}`, "Final marker: indigo otter 7246"];
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  for (let i = 0; i < texts.length; i++) { const text = `BT /F1 12 Tf 20 750 Td (${texts[i]}) Tj ET`; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`, `<< /Length ${text.length} >>\nstream\n${text}\nendstream`); }
  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(text)); text += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const start = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return Buffer.from(text);
}
async function finish(id: string) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const run: Entity<"run"> = await api(`/v1/entities/run/${id}`);
    if (["succeeded", "failed", "cancelled", "unknown"].includes(run.status)) {
      const snapshot = await api(`/v1/threads/${run.thread_id}/snapshot`);
      const answer = snapshot.messages.find((m: Entity<"message">) => m.run_id === id && m.author === "agent");
      return { run, answer: answer?.text ?? "", binding: snapshot.bindings.find((b: Entity<"binding">) => b.active && b.agent_id === run.agent_id) };
    }
    await Bun.sleep(300);
  }
  await api(`/v1/runs/${id}/cancel`, {});
  throw new Error("Native verification deadline exceeded; stop requested.");
}
try {
  start();
  await Bun.write(resolve("docs/contracts/1.21.0.json"), `${JSON.stringify(await api("/v1/contracts"), null, 2)}\n`);
  for (const harness of ["codex", "muse"] as const) {
    const availability = await detect(harness);
    assert.equal(availability.state, "supported");
    const connection = new Connections(lifecycle).create({ harness, authentication: harness === "codex" ? { method: "native_login", billing_source: "subscription" } : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() } });
    if (harness === "codex") {
      const source = resolve(process.env.NGERTIIN_AUTH_SOURCE ?? ".dev/harness-first");
      const db = new Database(join(source, "ngertiin.sqlite"), { readonly: true });
      const rows = db.query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'").all();
      db.close();
      const selected = rows.map((r) => JSON.parse(r.body) as Entity<"connection">).find((c) => c.harness === "codex" && c.authentication.method === "native_login" && c.login === "authenticated");
      assert(selected, "Authenticated source Codex connection unavailable.");
      const destination = join(root, "connections", connection.id, "codex");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyFileSync(join(source, "connections", selected.id, "codex", "auth.json"), join(destination, "auth.json"));
      chmodSync(join(destination, "auth.json"), 0o600);
    }
    const agent = lifecycle.createAgent({ name: `Attachment proof ${harness}`, harness, connection_id: connection.id, model_id: harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3", billing_source: harness === "codex" ? "subscription" : "api_key" });
    const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
    const submission = crypto.randomUUID();
    const file = crypto.randomUUID();
    await api("/v1/message-uploads", { submission_id: submission, thread_id: thread.id, agent_id: agent.id, name: "verification.pdf", media_type: "application/pdf", content_base64: pdf().toString("base64") }, file);
    const admitted = await api("/v1/runs", { submission_id: submission, thread_id: thread.id, agent_id: agent.id, text: "Based on this file, what is the verification key on page 3? Cite the file and page. This is one question; do not create a goal or Routine.", artifact_ids: [file] }, submission);
    const first = await finish(admitted.run.id);
    const lane: Record<string, unknown> = { harness, version: availability.version, first };
    report.lanes.push(lane);
    await save();
    assert.equal(first.run.status, "succeeded");
    assert(first.answer.includes(marker));
    assert(first.run.attachment_observations.some((r) => r.operation === "read" && r.pages.includes(3)));
    const session = first.binding.native_session_id;
    await stop();
    start();
    const next = await api("/v1/runs", { thread_id: thread.id, agent_id: agent.id, text: "For the previously sent file, call ngertiin.list_attachments and then ngertiin.search_attachment for 'Final marker'. Read the matching page with ngertiin.read_attachment. Report the content and page. Do not create a goal or Routine." });
    const followup = await finish(next.run.id);
    lane.followup = followup;
    lane.connection = store.get("connection", connection.id);
    await save();
    assert.equal(followup.run.status, "succeeded");
    assert(followup.answer.includes("indigo otter 7246"));
    for (const name of ["ngertiin.list_attachments", "ngertiin.search_attachment", "ngertiin.read_attachment"]) assert(followup.run.product_tools.includes(name));
    assert.equal(followup.binding.native_session_id, session);
    assert(followup.run.attachment_observations.some((r) => r.pages.includes(4)));
    assert.equal(store.list("goal").length + store.list("routine").length, 0);
    lane.pass = true;
    await save();
  }
  report.pass = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : "Verification failed.";
  process.exitCode = 1;
} finally {
  await stop();
  rmSync(root, { recursive: true, force: true });
  report.cleanup = { owned_services_stopped: true, isolated_credentials_removed: true, original_state_preserved: true };
  await save();
  console.log(JSON.stringify({ pass: report.pass, error: report.error ?? null, output }));
}
