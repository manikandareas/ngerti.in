import { Database } from "bun:sqlite";
import assert from "node:assert/strict";
import sharp from "../../../apps/server/node_modules/sharp";
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

const root = mkdtempSync(join(tmpdir(), "ngertiin-group-attachment-native-"));
const output = resolve(process.argv[2] ?? "docs/verification/group-attachments/native.json");
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
  if (store && !store.closed) store.close();
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
    text: "The Reviewer should inspect the attached PDF and report the verification key on page 3. Use read_attachment to read that page and cite the file and page. This is one immediate question; do not create a goal or Routine.",
    artifact_ids: [file],
  };
  const routed = await api(`/v1/groups/${group.id}/messages`, body, submission);
  const resolveTask = async (routeId: string) => {
    const deadline = Date.now() + 180_000;
    while (Date.now() < deadline) {
      const route: Entity<"group_route"> = await api(`/v1/entities/group_route/${routeId}`);
      if (route.state === "selected" && route.task_id) return store.get("peer_task", route.task_id);
      assert(
        !["rejected", "unknown"].includes(route.state),
        `Routing ${route.state}: ${route.error_code}`,
      );
      await Bun.sleep(300);
    }
    throw new Error("Router deadline exceeded.");
  };
  const firstTask = await resolveTask(routed.id);
  const first = await finish(firstTask.current_run_id);
  report.lanes.push({
    scenario: "automatic_router_pdf",
    selected_agent_id: firstTask.agent_id,
    ...first,
  });
  await save();
  assert.equal(firstTask.agent_id, reviewer.id);
  assert.equal(first.run.status, "succeeded");
  assert(first.answer.includes(marker));
  assert(
    first.run.attachment_observations.some((r) => r.operation === "read" && r.pages.includes(3)),
  );
  assert.deepEqual(await api(`/v1/groups/${group.id}/messages`, body, submission), routed);
  const initialWorkspace = first.run.workspace_id;
  const reviewerSession = first.binding.native_session_id;
  await stop();
  start();
  const followRoute = await api(`/v1/groups/${group.id}/messages`, {
    agent_id: coordinator.id,
    text: "Read the previously sent verification.pdf. Use list_attachments, search_attachment for 'Final marker', and read_attachment on the matching page. Report the final marker with its page. Do not create a goal or Routine.",
  });
  const followTask = await resolveTask(followRoute.id);
  const follow = await finish(followTask.current_run_id);
  report.lanes.push({ scenario: "other_member_followup_after_restart", ...follow });
  await save();
  assert.equal(follow.run.status, "succeeded");
  assert.equal(follow.run.workspace_id, initialWorkspace);
  assert(follow.answer.includes("indigo otter 7246"));
  for (const name of [
    "ngertiin.list_attachments",
    "ngertiin.search_attachment",
    "ngertiin.read_attachment",
  ])
    assert(follow.run.product_tools.includes(name));
  const handoff = await api(`/v1/groups/${group.id}/messages`, {
    agent_id: coordinator.id,
    artifact_ids: [file],
    text: "Use ngertiin.group_handoff to ask Reviewer to independently read verification.pdf page 3 and report its verification key. Set purpose to review. End your turn after the handoff. When the application resumes you with the review, report its result and the cited page. This is a single immediate review; do not create a goal or Routine.",
  });
  const rootTask = await resolveTask(handoff.id);
  const initial = await finish(rootTask.current_run_id);
  report.lanes.push({ scenario: "handoff_parent", ...initial });
  await save();
  assert.equal(initial.run.status, "succeeded");
  assert(initial.run.product_tools.includes("ngertiin.group_handoff"));
  const deadline = Date.now() + 180_000;
  let completed: Entity<"peer_task"> | undefined;
  while (Date.now() < deadline) {
    const current = store.get("peer_task", rootTask.id);
    if (["completed", "failed", "cancelled", "unknown"].includes(current.state)) {
      completed = current;
      break;
    }
    await Bun.sleep(300);
  }
  assert(completed, "Handoff deadline exceeded.");
  const child = store.list("peer_task").find((t) => t.parent_task_id === rootTask.id);
  assert(child, "No independent review task.");
  const reviewed = await finish(child.current_run_id);
  const resumed = await finish(completed.current_run_id);
  report.lanes.push(
    { scenario: "handoff_child", ...reviewed },
    { scenario: "handoff_continuation", ...resumed },
  );
  await save();
  assert.equal(completed.state, "completed");
  assert.equal(reviewed.run.status, "succeeded");
  assert.equal(resumed.run.status, "succeeded");
  assert.equal(reviewed.run.workspace_id, initialWorkspace);
  assert.equal(reviewed.binding.native_session_id, reviewerSession);
  assert(reviewed.answer.includes(marker));
  assert(resumed.answer.includes(marker));
  assert(
    reviewed.run.attachment_observations.some((r) => r.operation === "read" && r.pages.includes(3)),
  );
  const imageBytes = await sharp(
    Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120"><rect width="240" height="120" fill="white"/><rect x="10" y="20" width="90" height="80" fill="red"/><circle cx="175" cy="60" r="40" fill="blue"/></svg>',
    ),
  )
    .png()
    .toBuffer();
  const imageSubmission = crypto.randomUUID(),
    imageId = crypto.randomUUID();
  await api(
    "/v1/message-uploads",
    {
      submission_id: imageSubmission,
      thread_id: group.id,
      agent_id: null,
      name: "group-shapes.png",
      media_type: "image/png",
      content_base64: imageBytes.toString("base64"),
    },
    imageId,
  );
  const imageRoute = await api(
    `/v1/groups/${group.id}/messages`,
    {
      submission_id: imageSubmission,
      agent_id: coordinator.id,
      artifact_ids: [imageId],
      text: "Look at the attached image. State the rectangle color and circle color in English. This is one immediate image question; do not create a goal or Routine.",
    },
    imageSubmission,
  );
  const imageTask = await resolveTask(imageRoute.id);
  const imageResult = await finish(imageTask.current_run_id);
  report.lanes.push({ scenario: "shared_group_native_image", ...imageResult });
  await save();
  assert.equal(imageResult.run.status, "succeeded");
  assert.equal(imageResult.run.workspace_id, initialWorkspace);
  assert.equal(imageResult.run.visual_inputs[0]?.artifact_id, imageId);
  assert(/red/i.test(imageResult.answer) && /blue/i.test(imageResult.answer));
  const snapshot = await api(`/v1/threads/${group.id}/snapshot`);
  assert.equal(
    snapshot.workspaces.filter(
      (w: Entity<"workspace">) => w.scope === "group" && w.state === "active",
    ).length,
    1,
  );
  assert.equal(snapshot.artifacts.filter((a: Entity<"artifact">) => a.id === file).length, 1);
  assert.equal(store.list("goal").length + store.list("routine").length, 0);
  report.runs = store.list("run");
  report.routes = store.list("group_route");
  report.workspaces = store.list("workspace");
  report.artifacts = store.list("artifact");
  report.pass = true;
} catch (error) {
  report.error = error instanceof Error ? error.message : "Verification failed.";
  process.exitCode = 1;
} finally {
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
