import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApi } from "../../../apps/server/src/api";
import { Background } from "../../../apps/server/src/background";
import { CONTRACT_VERSION, type Entity } from "../../../apps/server/src/contracts";
import { JevRouter } from "../../../apps/server/src/groups/router";
import { detectHarness } from "../../../apps/server/src/harness/availability";
import { HarnessBroker } from "../../../apps/server/src/harness/broker";
import { CodexAdapter } from "../../../apps/server/src/harness/codex/adapter";
import { Connections } from "../../../apps/server/src/harness/connections";
import { CredentialContexts } from "../../../apps/server/src/harness/context";
import { MuseAdapter } from "../../../apps/server/src/harness/muse/adapter";
import { ProductTools } from "../../../apps/server/src/harness/tools";
import { Lifecycle } from "../../../apps/server/src/lifecycle";
import { Store } from "../../../apps/server/src/store";

assert(process.env.TYPESAFE_API_KEY, "The TypeSafe routing credential is required.");
const output = resolve(process.argv[2] ?? "docs/verification/conversation-latency/native.json");
const groupsOnly = process.argv[3] === "groups";
const source = resolve(process.env.NGERTIIN_AUTH_SOURCE ?? ".dev/harness-first");
const directory = mkdtempSync(join(tmpdir(), "ngertiin-latency-native-"));
const sourceDb = new Database(join(source, "ngertiin.sqlite"), { readonly: true });
const sourceConnections = sourceDb
  .query<{ body: string }, []>("SELECT body FROM entities WHERE kind='connection'")
  .all()
  .map(({ body }) => JSON.parse(body) as Entity<"connection">);
const sourceCodex = sourceConnections.find(
  (connection) =>
    connection.harness === "codex" &&
    connection.state === "active" &&
    connection.login === "authenticated" &&
    connection.authentication.billing_source === "subscription",
);
assert(sourceCodex, "An existing authenticated Codex subscription connection is required.");
const store = new Store(join(directory, "state.sqlite"), crypto.randomUUID());
const lifecycle = new Lifecycle(store, new JevRouter(process.env.TYPESAFE_API_KEY));
const calls: { run_id: string; name: string }[] = [];
const tools = new ProductTools(lifecycle, (scope, name) =>
  calls.push({ run_id: scope.run_id, name }),
);
let app!: ReturnType<typeof createApi>;
const token = crypto.randomUUID().replaceAll("-", "").repeat(2);
const broker = new HarnessBroker(
  lifecycle,
  new CredentialContexts(directory, () => {
    assert(process.env.MUSE_API_KEY, "The explicitly selected Muse API key is required.");
    return process.env.MUSE_API_KEY;
  }),
  tools,
  {
    codex: new CodexAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
    muse: new MuseAdapter(() => `http://127.0.0.1:${app.server?.port}/v1/harness/tools`),
  },
  (harness) =>
    detectHarness(
      harness,
      harness === "muse"
        ? (process.env.NGERTIIN_MUSE_EXECUTABLE ?? resolve(".dev/nma050/muse"))
        : undefined,
    ),
);
const background = new Background(lifecycle, broker.executors());
const samples: object[] = [];
const versions: object[] = [];
const report: Record<string, unknown> = {
  captured_at: new Date().toISOString(),
  contract: CONTRACT_VERSION,
  scope:
    "Isolated local native sessions and synthetic work; source state is read-only. Codex subscription and explicitly selected Muse API key remain separate.",
  versions,
  samples,
};
report.source_sha256 = Object.fromEntries(
  await Promise.all(
    [
      "apps/server/src/background.ts",
      "apps/server/src/groups/service.ts",
      "apps/server/src/groups/router.ts",
      "apps/server/src/groups/routing-worker.ts",
      "apps/server/src/harness/broker.ts",
      "apps/server/src/lifecycle.ts",
      "apps/server/src/runs/contracts.ts",
      "apps/server/src/store.ts",
    ].map(async (path) => [
      path,
      createHash("sha256")
        .update(new Uint8Array(await Bun.file(path).arrayBuffer()))
        .digest("hex"),
    ]),
  ),
);
const save = async () => {
  mkdirSync(resolve(output, ".."), { recursive: true });
  await Bun.write(output, `${JSON.stringify(report, null, 2)}\n`);
};
async function api<T>(path: string, body: object): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${app.server?.port}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
  });
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
async function waitFor(predicate: () => boolean, timeout = 120_000) {
  const deadline = Date.now() + timeout;
  while (!predicate() && Date.now() < deadline) await Bun.sleep(50);
  assert(predicate(), "Native verification exceeded its deadline; do not replay unknown work.");
}
function profile(
  harness: "codex" | "muse",
  connectionId: string,
  name: string,
  soul = "Answer the user's request directly.",
) {
  return lifecycle.createAgent({
    name,
    soul,
    harness,
    connection_id: connectionId,
    model_id: harness === "codex" ? "gpt-6.1-sol" : "muse-spark-1.3",
    reasoning: "medium",
    billing_source: harness === "codex" ? "subscription" : "api_key",
    instructions:
      "This is a short synthetic latency check. Follow the user's exact request. Do not create Goals, Routine or files for this check. Do not browse the web.",
  });
}
async function sendDm(agent: Entity<"agent">, threadId: string, label: string) {
  const started = performance.now();
  const receipt = await api<{ run: Entity<"run"> }>("/v1/runs", {
    thread_id: threadId,
    agent_id: agent.id,
    text: `Reply with exactly LATENCY_OK_${label}. No tools are needed.`,
  });
  await waitFor(() =>
    ["succeeded", "failed", "cancelled", "unknown"].includes(
      store.get("run", receipt.run.id).status,
    ),
  );
  const run = store.get("run", receipt.run.id);
  samples.push({
    label,
    harness: agent.harness,
    status: run.status,
    total_ms: Math.round(performance.now() - started),
    timings: run.timings,
    native_session_id: store.get("binding", run.binding_id).native_session_id,
    answer: store.answer(run.id)?.text,
    tools: run.product_tools,
  });
  await save();
  assert.equal(run.status, "succeeded", `${label} native result`);
  assert(store.answer(run.id)?.text.includes(`LATENCY_OK_${label}`), `${label} exact answer`);
  return run;
}
let passed = false;
try {
  const codex = new Connections(lifecycle).create({
    harness: "codex",
    authentication: { method: "native_login", billing_source: "subscription" },
  });
  const targetHome = join(directory, "connections", codex.id, "codex");
  mkdirSync(targetHome, { recursive: true, mode: 0o700 });
  copyFileSync(
    join(source, "connections", sourceCodex.id, "codex", "auth.json"),
    join(targetHome, "auth.json"),
  );
  chmodSync(join(targetHome, "auth.json"), 0o600);
  const codexAgent = profile("codex", codex.id, "Direct helper");
  const codexDm = lifecycle.create("thread", { type: "dm", member_agent_ids: [codexAgent.id] });
  const prewarmed = profile("codex", codex.id, "Prepared helper");
  const preparedDm = lifecycle.create("thread", { type: "dm", member_agent_ids: [prewarmed.id] });
  app = createApi(lifecycle, background, token, {
    broker,
    tools,
    connections: broker.connections,
  }).listen({ hostname: "127.0.0.1", port: 0 });
  background.start();
  versions.push(await detectHarness("codex"));
  if (!groupsOnly) {
    const first = await sendDm(codexAgent, codexDm.id, "codex_cold");
    const second = await sendDm(codexAgent, codexDm.id, "codex_warm");
    assert.equal(first.binding_id, second.binding_id, "Warm DM preserves its native binding.");
    const inferenceRunsBefore = store.list("run").length;
    const prewarmStart = performance.now();
    await api(`/v1/threads/${preparedDm.id}/prepare`, { agent_id: prewarmed.id });
    await broker.openSession(preparedDm.id, prewarmed.id);
    const inferenceRunsAfter = store.list("run").length;
    assert.equal(
      inferenceRunsAfter,
      inferenceRunsBefore,
      "Prewarming must not admit inference work.",
    );
    samples.push({
      label: "dm_prewarm",
      duration_ms: Math.round(performance.now() - prewarmStart),
      inference_runs_before: inferenceRunsBefore,
      inference_runs_after: inferenceRunsAfter,
      inference_runs_added: inferenceRunsAfter - inferenceRunsBefore,
    });
    await sendDm(prewarmed, preparedDm.id, "codex_prepared");
  }

  let museAgent: Entity<"agent"> | undefined;
  if (process.env.MUSE_API_KEY) {
    const muse = new Connections(lifecycle).create({
      harness: "muse",
      authentication: {
        method: "api_key",
        billing_source: "api_key",
        credential_ref: crypto.randomUUID(),
      },
    });
    museAgent = profile(
      "muse",
      muse.id,
      "Reviewer",
      "Independently reviews and verifies supplied facts and calculations.",
    );
    const museDm = lifecycle.create("thread", { type: "dm", member_agent_ids: [museAgent.id] });
    versions.push(
      await detectHarness(
        "muse",
        process.env.NGERTIIN_MUSE_EXECUTABLE ?? resolve(".dev/nma050/muse"),
      ),
    );
    if (!groupsOnly) {
      await sendDm(museAgent, museDm.id, "muse_cold");
      await sendDm(museAgent, museDm.id, "muse_warm");
    }
  } else report.muse = "Skipped: an explicit Muse API key was not supplied.";

  const writer = profile(
    "codex",
    codex.id,
    "Writer",
    "Writes requested prose and concise final answers from available facts.",
  );
  const group = lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [writer.id, museAgent?.id ?? codexAgent.id],
  });
  const route = await api<Entity<"group_route">>(`/v1/groups/${group.id}/messages`, {
    text: "Writer, please write exactly LATENCY_ROUTE_OK. The facts are already available; research and review are unnecessary.",
  });
  await waitFor(() => store.get("group_route", route.id).state !== "pending");
  const selected = store.get("group_route", route.id);
  assert.equal(selected.state, "selected");
  assert.equal(selected.selected_agent_id, writer.id);
  await waitFor(() => store.get("peer_task", selected.task_id).state === "completed");
  samples.push({
    label: "jev_to_native",
    route: selected,
    answer: store.answer(store.get("peer_task", selected.task_id).current_run_id)?.text,
  });
  await save();
  const peer = museAgent ?? codexAgent;
  const handoff = await api<Entity<"group_route">>(`/v1/groups/${group.id}/messages`, {
    agent_id: writer.id,
    text: `Use ngertiin.group_handoff once to ask peer ${peer.id} to verify 17 + 25 = 42 and deliver exactly VERIFIED_42 as its entire final response. Set purpose=review and continuation=complete. Do not produce the peer's answer yourself. This ordinary task has no Goal. Finish your native turn immediately after the handoff receipt; do not poll or wait for the peer.`,
  });
  await waitFor(() =>
    ["completed", "failed", "cancelled", "unknown"].includes(
      store.get("peer_task", handoff.task_id).state,
    ),
  );
  const parent = store.get("peer_task", handoff.task_id);
  const children = store.list("peer_task").filter((task) => task.parent_task_id === parent.id);
  assert.equal(parent.state, "completed");
  assert.equal(children.length, 1);
  assert.equal(parent.continuation, 0);
  assert.equal(children[0].state, "completed");
  const parentRun = store.get("run", parent.current_run_id),
    childRun = store.get("run", children[0].current_run_id);
  assert.equal(parentRun.status, "succeeded");
  assert.equal(childRun.status, "succeeded");
  assert(store.answer(childRun.id)?.text.includes("VERIFIED_42"));
  samples.push({
    label: "native_handoff",
    parent: parentRun,
    child: childRun,
    parent_task: parent,
    child_task: children[0],
    answer: store.answer(childRun.id)?.text,
  });
  assert.equal(store.list("goal").length, 0);
  assert.equal(store.list("routine").length, 0);
  report.tool_calls = calls;
  report.summary = {
    runs: store.list("run").length,
    succeeded: store.list("run").filter((run) => run.status === "succeeded").length,
    native_routing_runs: store.list("thread").filter((thread) => thread.purpose === "routing")
      .length,
    goals: 0,
    routines: 0,
    result: "passed",
  };
  passed = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : "Native verification failed.";
  report.runs = store.list("run");
  process.exitCode = 1;
} finally {
  await background.stop();
  await broker.close();
  await tools.browsers.shutdown();
  if (app) await app.stop();
  report.finished_at = new Date().toISOString();
  const activeRuns = store
    .list("run")
    .filter((run) =>
      ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
    ).length;
  report.cleanup = {
    active_runs: activeRuns,
    source_database_mode: "readonly",
    isolated_credentials_removed: activeRuns === 0,
  };
  await save();
  store.close();
  sourceDb.close();
  if (activeRuns === 0) rmSync(directory, { recursive: true, force: true });
  console.log(JSON.stringify({ output, passed, summary: report.summary, error: report.error }));
}
