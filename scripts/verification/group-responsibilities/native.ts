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
import { Goals } from "../../../apps/server/src/goals/service";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

const root = mkdtempSync(join(tmpdir(), "ngertiin-group-responsibility-native-"));
const output = resolve(process.argv[2] ?? "docs/verification/group-responsibilities/native.json");
const owner = crypto.randomUUID();
const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
const marker = `TURQUOISE-${crypto.randomUUID().slice(0, 8)}`;
const detect = (harness: "codex" | "muse") =>
  detectHarness(
    harness,
    harness === "muse"
      ? (process.env.NGERTIIN_MUSE_EXECUTABLE ?? resolve(".dev/nma050/muse"))
      : undefined,
  );
const report: {
  contract: string;
  started_at: string;
  lanes: object[];
  pass: boolean;
  error?: string;
  cleanup?: object;
  runs?: object[];
  routes?: object[];
  workspaces?: object[];
  artifacts?: object[];
  goals?: object[];
  routines?: object[];
  occurrences?: object[];
  checks?: object;
} = { contract: CONTRACT_VERSION, started_at: new Date().toISOString(), lanes: [], pass: false };
let store!: Store;
let lifecycle!: Lifecycle;
let broker: HarnessBroker;
let background: Background;
let tools: ProductTools;
let app: ReturnType<typeof createApi>;
async function save() {
  await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
}
function start() {
  store = new Store(join(root, "state.sqlite"), owner);
  lifecycle = new Lifecycle(store);
  tools = new ProductTools(lifecycle);
  const credentials = new CredentialContexts(root, () => {
    assert(process.env.MUSE_API_KEY, "Muse key unavailable.");
    return process.env.MUSE_API_KEY;
  });
  broker = new HarnessBroker(
    lifecycle,
    credentials,
    tools,
    {
      codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
      muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    },
    detect,
  );
  background = new Background(lifecycle, broker.executors());
  app = createApi(lifecycle, background, token, {
    connections: new Connections(lifecycle),
    tools,
    broker,
  }).listen({ hostname: "127.0.0.1", port: 0 });
  background.start(100);
}
async function stop() {
  await background?.stop();
  await broker?.close();
  await tools?.browsers.shutdown();
  if (app?.server) await app.stop(true);
  if (store && !store.closed) {
    report.runs = store.list("run");
    report.routes = store.list("group_route");
    report.workspaces = store.list("workspace");
    report.artifacts = store.list("artifact");
    report.goals = store.list("goal");
    report.routines = store.list("routine");
    report.occurrences = store.list("occurrence");
    store.close();
  }
}
async function api(path: string, body?: object, key = crypto.randomUUID()): Promise<any> {
  const response = await fetch(`http://127.0.0.1:${app.server?.port}${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  assert.equal(response.status, 200, `${path}: ${result.error?.code}`);
  return result;
}
function pdf() {
  const texts = [
    "Attachment verification cover",
    "Document reference instructions",
    `Verification key: ${marker}`,
    "Final marker: indigo otter 7246",
  ];
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R] /Count 4 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let i = 0; i < texts.length; i++) {
    const text = `BT /F1 12 Tf 20 750 Td (${texts[i]}) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    );
  }
  let text = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(text));
    text += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
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
      const answer = snapshot.messages.find(
        (m: Entity<"message">) => m.run_id === id && m.author === "agent",
      );
      return {
        run,
        answer: answer?.text ?? "",
        binding: snapshot.bindings.find(
          (b: Entity<"binding">) => b.active && b.agent_id === run.agent_id,
        ),
      };
    }
    await Bun.sleep(300);
  }
  await api(`/v1/runs/${id}/cancel`, {});
  const stalled = store.get("run", id);
  throw new Error(
    `Native verification deadline exceeded: ${stalled.status} ${stalled.diagnostic?.code ?? "no diagnostic"}; stop requested.`,
  );
}
try {
  start();
  await Bun.write(
    resolve(`docs/contracts/${CONTRACT_VERSION}.json`),
    `${JSON.stringify(await api("/v1/contracts"), null, 2)}\n`,
  );
  const agents: Entity<"agent">[] = [];
  for (const harness of ["codex", "muse"] as const) {
    const availability = await detect(harness);
    assert.equal(availability.state, "supported");
    const connection = new Connections(lifecycle).create({
      harness,
      authentication:
        harness === "codex"
          ? { method: "native_login", billing_source: "subscription" }
          : { method: "api_key", billing_source: "api_key", credential_ref: crypto.randomUUID() },
    });
    if (harness === "codex") {
      const source = resolve(process.env.NGERTIIN_AUTH_SOURCE ?? ".dev/harness-first");
      const db = new Database(join(source, "ngertiin.sqlite"), { readonly: true });
      const rows = db
        .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'")
        .all();
      db.close();
      const selected = rows
        .map((r) => JSON.parse(r.body) as Entity<"connection">)
        .find(
          (c) =>
            c.harness === "codex" &&
            c.authentication.method === "native_login" &&
            c.login === "authenticated",
        );
      assert(selected, "Authenticated source Codex connection unavailable.");
      const destination = join(root, "connections", connection.id, "codex");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      copyFileSync(
        join(source, "connections", selected.id, "codex", "auth.json"),
        join(destination, "auth.json"),
      );
      chmodSync(join(destination, "auth.json"), 0o600);
    }
    const agent = lifecycle.createAgent({
      name: harness === "codex" ? "Coordinator" : "Reviewer",
      handle: harness === "codex" ? "coordinator" : "reviewer",
      soul:
        harness === "codex"
          ? "Coordinate immediate document work and delegate requested independent reviews."
          : "Review source documents and check exact PDF page references.",
      harness,
      instructions:
        harness === "muse"
          ? "When a delegated task requests a file deliverable, use create_file and publish_artifact before returning its result. Return results by finishing the task, without handing back to an ancestor."
          : "Include required deliverables explicitly in peer instructions, including create_file/publish_artifact when completion needs a peer artifact.",
      connection_id: connection.id,
      model_id: harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
      billing_source: harness === "codex" ? "subscription" : "api_key",
    });
    agents.push(agent);
    report.lanes.push({
      harness,
      version: availability.version,
      agent_id: agent.id,
      billing_source: connection.authentication.billing_source,
    });
  }
  const [coordinator, reviewer] = agents;
  assert(coordinator && reviewer);
  const group = lifecycle.create("thread", {
    type: "group",
    member_agent_ids: agents.map((a) => a.id),
  });
  const submission = crypto.randomUUID(),
    file = crypto.randomUUID();
  await api(
    "/v1/message-uploads",
    {
      submission_id: submission,
      thread_id: group.id,
      agent_id: null,
      name: "verification.pdf",
      media_type: "application/pdf",
      content_base64: pdf().toString("base64"),
    },
    file,
  );
  const body = {
    submission_id: submission,
    agent_id: coordinator.id,
    artifact_ids: [file],
    text: `Create one group goal for summarizing this PDF and obtaining a concrete independent example from Reviewer. Read PDF page 3 with read_attachment and publish a useful summary file containing its exact verification key. Then call group_handoff to Reviewer with purpose=review, a friendly short summary and continuation=finalize. The handoff instruction must explicitly require Reviewer to read page 3, create_file for a useful example containing its exact verification key, publish_artifact, then return the artifact ID by finishing the task. Reviewer must independently read page 3, publish a useful example file with the verification key, and finish its task without capturing another goal, reporting goal completion or handing back. After your exact task resumes, list current goals, report the original goal completed using both published artifact IDs, and finish. Both requested public answers should be delivered by you and Reviewer; the final continuation only records completion. Do not create a Routine yet.`,
  };
  const sent = await api(`/v1/groups/${group.id}/messages`, body, submission);
  const rootTask = store.get("peer_task", sent.task_id);
  report.lanes.push({ scenario: "goal_parent", ...(await finish(rootTask.current_run_id)) });
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    const goal = store.list("goal").find((g) => g.thread_id === group.id);
    const active = store
      .list("run")
      .some(
        (r) =>
          r.thread_id === group.id &&
          ["queued", "running", "dispatching", "unknown"].includes(r.status),
      );
    if (goal?.state === "completed" && !active) break;
    if (goal?.work_state === "blocked" && !active)
      throw new Error(`Goal blocked: ${goal.last_report_error?.code ?? goal.progress}`);
    await Bun.sleep(300);
  }
  const completed = store.list("goal").filter((g) => g.thread_id === group.id);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].state, "completed");
  assert.equal(completed[0].scope, "group");
  assert.equal(completed[0].agent_id, null);
  assert.equal(completed[0].coordinator_agent_id, coordinator.id);
  assert(completed[0].evidence_artifact_ids.length >= 2);
  for (const task of store.list("peer_task").filter((t) => t.thread_id === group.id)) {
    if (task.current_run_id !== rootTask.current_run_id)
      report.lanes.push({
        scenario: task.parent_task_id ? "goal_child" : "goal_finalizer",
        ...(await finish(task.current_run_id)),
      });
  }
  const beforeRestart = await api(`/v1/threads/${group.id}/snapshot`);
  const publicAnswers = beforeRestart.messages.filter(
    (m: Entity<"message">) => m.author === "agent" && m.purpose === "conversation",
  );
  assert.equal(publicAnswers.length, 2, "Only the two requested answers should be public.");
  const handoff = beforeRestart.messages.find((m: Entity<"message">) => m.purpose === "review");
  assert(handoff && handoff.text.length <= 240);
  const childRun = store
    .list("run")
    .find((r) => r.thread_id === group.id && r.agent_id === reviewer.id);
  assert(
    childRun?.attachment_observations.some((o) => o.operation === "read" && o.pages.includes(3)),
  );
  await stop();
  start();
  const shared = await api(`/v1/threads/${group.id}/goals?agent_id=${reviewer.id}`);
  assert.equal(shared.goals[0].id, completed[0].id);
  const at = new Date(Date.now() + 120_000).toISOString();
  const planned = await api(`/v1/groups/${group.id}/messages`, {
    agent_id: coordinator.id,
    text: `Use list_goals to inspect the completed shared goal, and list_attachments/read_attachment to read Coordinator's published summary file. Report the exact verification key from that file. Create exactly one standalone group Routine (goal_id=null) with execution_target={"type":"auto"}, timezone UTC and schedule={"type":"once","at":"${at}"}. Its instruction is: "Inspect the shared files; this scheduled check has no new finding. Call routine_no_update, create no new goals or files, and finish quietly." Do not execute the scheduled check now. Do not create another goal. Finish after recording the schedule.`,
  });
  const planRun = store.get("peer_task", planned.task_id).current_run_id;
  const planning = await finish(planRun);
  assert.equal(planning.run.status, "succeeded");
  assert(planning.run.product_tools.includes("ngertiin.list_goals"));
  assert(planning.run.product_tools.includes("ngertiin.read_attachment"));
  assert(planning.answer.includes(marker));
  assert.equal(store.list("routine").length, 1);
  const routine = store.list("routine")[0];
  assert.equal(routine.scope, "group");
  assert.equal(routine.agent_id, null);
  assert.equal(routine.execution_target?.type, "auto");
  report.lanes.push({ scenario: "routine_source_after_restart", ...planning });
  await stop();
  start();
  const routineDeadline = Date.parse(at) + 180_000;
  while (Date.now() < routineDeadline) {
    const occurrences = store.list("occurrence");
    if (occurrences[0]?.state === "completed") break;
    if (occurrences.some((o) => ["blocked", "failed", "unknown"].includes(o.state)))
      throw new Error(`Routine did not complete: ${occurrences[0].state}`);
    await Bun.sleep(300);
  }
  const occurrence = store.list("occurrence")[0];
  assert(occurrence?.run_id);
  assert.equal(occurrence.state, "completed");
  assert.equal(store.list("occurrence").length, 1);
  const scheduled = await finish(occurrence.run_id);
  assert.equal(scheduled.run.status, "succeeded");
  assert.equal(scheduled.run.publication, "quiet");
  assert.equal(scheduled.answer, "");
  assert(scheduled.run.product_tools.includes("ngertiin.routine_no_update"));
  report.lanes.push({ scenario: "automatic_routine_after_restart", ...scheduled });
  const routed = store.get("group_route", occurrence.route_id);
  const router = await finish(routed.router_run_id as string);
  assert.equal(router.run.status, "succeeded");
  assert.equal(router.run.product_tools.length, 0);
  report.lanes.push({ scenario: "routine_model_selection", ...router });
  const counts = {
    messages: store.list("message").length,
    runs: store.list("run").length,
    artifacts: store.list("artifact").length,
    tasks: store.list("peer_task").length,
    occurrences: store.list("occurrence").length,
  };
  await api(`/v1/groups/${group.id}/messages`, body, submission);
  assert.deepEqual(
    {
      messages: store.list("message").length,
      runs: store.list("run").length,
      artifacts: store.list("artifact").length,
      tasks: store.list("peer_task").length,
      occurrences: store.list("occurrence").length,
    },
    counts,
  );
  const currentRoutine = store.get("routine", routine.id);
  new Goals(lifecycle).controlRoutine(
    { thread_id: group.id, agent_id: null },
    { routine_id: routine.id, expected_revision: currentRoutine.revision, state: "stopped" },
  );
  report.runs = store.list("run");
  report.routes = store.list("group_route");
  report.workspaces = store.list("workspace");
  report.artifacts = store.list("artifact");
  report.goals = store.list("goal");
  report.routines = store.list("routine");
  report.occurrences = store.list("occurrence");
  assert(report.runs.every((r) => (r as Entity<"run">).status === "succeeded"));
  report.checks = {
    one_group_goal: true,
    cross_harness_evidence: true,
    two_public_answers: true,
    friendly_handoff: true,
    shared_goal_read_after_restart: true,
    shared_artifact_read_after_restart: true,
    durable_auto_routine: true,
    quiet_tick: true,
    replay_without_new_work: true,
  };
  report.pass = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : "Verification failed.";
  process.exitCode = 1;
} finally {
  if (store && !store.closed) {
    report.runs = store.list("run");
    report.routes = store.list("group_route");
    report.workspaces = store.list("workspace");
    report.artifacts = store.list("artifact");
    report.goals = store.list("goal");
    report.routines = store.list("routine");
    report.occurrences = store.list("occurrence");
  }
  await stop();
  rmSync(root, { recursive: true, force: true });
  report.cleanup = {
    owned_services_stopped: true,
    isolated_credentials_removed: true,
    original_state_preserved: true,
  };
  await save();
  console.log(JSON.stringify({ pass: report.pass, error: report.error ?? null, output }));
}
