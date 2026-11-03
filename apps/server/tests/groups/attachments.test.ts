import { afterEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { createApi } from "../../src/api";
import { Artifacts } from "../../src/artifacts";
import { attachmentRead } from "../../src/attachments/contracts";
import { Attachments } from "../../src/attachments/service";
import { AttachmentSubmissions } from "../../src/attachments/submissions";
import { Background } from "../../src/background";
import type { Entity } from "../../src/contracts";
import { Groups } from "../../src/groups/service";
import { Connections } from "../../src/harness/connections";
import { Redactor } from "../../src/harness/context";
import { OwnedProcess } from "../../src/harness/process";
import { ProductTools } from "../../src/harness/tools";
import { prepareVisualInputs } from "../../src/multimodal";
import { fixture } from "../helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
const token = "j".repeat(64);
function setup() {
  f = fixture();
  const peer = f.lifecycle.createAgent({
    name: "Reviewer",
    handle: "reviewer",
    harness: "codex",
    connection_id: f.store.get("agent", f.agent.id).connection_id,
  });
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  }) as Entity<"thread">;
  return { peer, group, groups: new Groups(f.lifecycle), files: new Artifacts(f.lifecycle) };
}
function stage(
  groupId: string,
  submission = crypto.randomUUID(),
  bytes = Buffer.from("Group source: violet otter 8472"),
  media = "text/plain",
) {
  const file = new AttachmentSubmissions(f.lifecycle).stage(crypto.randomUUID(), {
    thread_id: groupId,
    submission_id: submission,
    name: "source.txt",
    media_type: media,
    content_base64: bytes.toString("base64"),
  });
  return {
    file,
    body: { submission_id: submission, text: "Read the supplied source.", artifact_ids: [file.id] },
  };
}
function start(runId: string) {
  const queued = f.store.get("run", runId);
  if (
    !f.store
      .list("binding")
      .some((b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id)
  )
    f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("Run cannot acquire its workspace.");
  f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
  return f.store.get("run", run.id);
}
function finish(run: Entity<"run">, answer = "Source reviewed.") {
  f.lifecycle.appendAnswer(run.id, answer);
  f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
}
function app() {
  return createApi(f.lifecycle, new Background(f.lifecycle), token);
}
async function post(
  api: ReturnType<typeof app>,
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
) {
  return api.handle(
    new Request(`http://localhost${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(body),
    }),
  );
}

test("group members share one workspace and have separate DM, routing and temporary resources", () => {
  const { group, peer, files } = setup();
  const first = files.workspaces.ensure(group.id, f.agent.id);
  expect(files.workspaces.ensure(group.id, peer.id).id).toBe(first.id);
  expect(first).toMatchObject({ scope: "group", agent_id: null });
  expect(files.workspaces.ensure(f.thread.id, f.agent.id).id).not.toBe(first.id);
  expect(files.workspaces.temporary(first, f.agent.id)).not.toBe(
    files.workspaces.temporary(first, peer.id),
  );
  const route = new Groups(f.lifecycle).send(group.id, { text: "Choose a reviewer." });
  const routing = f.store.get("run", route.router_run_id as string);
  expect(files.workspaces.ensure(routing.thread_id, routing.agent_id).scope).toBe("agent");
  expect(f.store.list("workspace").filter((w) => w.scope === "group")).toHaveLength(1);
});

test("a shared native writer closes its owned background descendants before releasing the workspace", async () => {
  const { group, files } = setup();
  const workspace = files.workspaces.ensure(group.id, f.agent.id);
  const marker = join(files.workspaces.path(workspace), "stale-writer.txt");
  const owned = new OwnedProcess(
    "/bin/sh",
    ["-c", 'printf ready; (sleep 0.5; printf stale > "$1") & wait', "writer", marker],
    {
      env: { PATH: "/usr/bin:/bin" },
      state_directory: f.dir,
      redactor: new Redactor(),
      workspace: {
        id: workspace.id,
        root: files.workspaces.path(workspace),
        revision: workspace.revision,
        shared: true,
      },
    },
  );
  const reader = owned.child.stdout.getReader();
  try {
    expect((await reader.read()).done).toBe(false);
  } finally {
    reader.releaseLock();
  }
  await owned.close();
  await Bun.sleep(650);
  expect(existsSync(marker)).toBe(false);
  await owned.close();
});

test("group submission is atomic and exact HTTP retries reconcile one message, route and artifact after restart", async () => {
  const { group } = setup();
  const { file, body } = stage(group.id);
  const api = app();
  const path = `/v1/groups/${group.id}/messages`;
  const rejected = await post(
    api,
    path,
    { ...body, artifact_ids: [file.id, crypto.randomUUID()] },
    body.submission_id,
  );
  expect(rejected.status).toBe(404);
  expect(f.store.list("artifact")).toHaveLength(0);
  expect(f.store.list("message")).toHaveLength(0);
  const receipts = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const response = await post(api, path, body, body.submission_id);
      expect(response.status).toBe(200);
      return response.json();
    }),
  );
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
  expect(f.store.list("artifact")).toHaveLength(1);
  expect(f.store.list("message").filter((m) => m.thread_id === group.id)).toHaveLength(1);
  expect(f.store.list("attachment_upload")[0]?.state).toBe("committed");
  expect((await post(api, path, { ...body, text: "changed" }, body.submission_id)).status).toBe(
    409,
  );
  f.restart();
  const restored = app();
  const status = await restored.handle(
    new Request(`http://localhost/v1/message-submissions/${body.submission_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  expect(await status.json()).toEqual({ state: "committed", result: receipts[0] });
  expect(await (await post(restored, path, body, body.submission_id)).json()).toEqual(receipts[0]);
  const artifact = f.store.get("artifact", file.id);
  expect(
    new Artifacts(f.lifecycle).download(file.id, artifact.workspace_id as string).bytes.toString(),
  ).toContain("violet otter");
  expect(f.store.list("group_route")).toHaveLength(1);
});

test("handoff and follow-up use the same source, serialize writers and retain access after restart", async () => {
  const { group, peer, groups } = setup();
  const { file, body } = stage(group.id);
  const route = new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    { ...body, agent_id: f.agent.id },
    body.submission_id,
  );
  const root = f.store.get("peer_task", route.task_id as string);
  const run = start(root.current_run_id);
  const authorize = () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
  const read = await new Attachments(f.lifecycle).read(
    run,
    attachmentRead.parse({ artifact_id: file.id }),
    authorize,
  );
  expect(read.pages[0]?.text).toContain("violet otter");
  const child = groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Review the exact source.",
    purpose: "review",
  });
  f.lifecycle.bind(group.id, peer.id, "peer-native");
  expect(f.lifecycle.claimNext(group.id, peer.id)).toBeNull();
  finish(run);
  f.restart();
  const childRun = start(child.current_run_id);
  expect(childRun.workspace_id).toBe(run.workspace_id);
  expect(f.store.get("message", childRun.input_message_id).artifact_ids).toEqual([file.id]);
  const attachments = new Attachments(f.lifecycle);
  const connection = f.store.get("connection", f.store.get("agent", peer.id).connection_id);
  new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const tools = new ProductTools(f.lifecycle);
  const lease = tools.issue(childRun);
  const toolRead = await tools.call(lease.token, lease.scope, "ngertiin.read_attachment", {
    artifact_id: file.id,
  });
  expect(toolRead).toMatchObject({ artifact_id: file.id });
  expect(f.store.get("run", childRun.id).product_tools).toContain("ngertiin.read_attachment");
  const result = await attachments.read(
    childRun,
    attachmentRead.parse({ artifact_id: file.id }),
    () => f.lifecycle.authorizeDispatch(childRun.id, childRun.dispatch_token as string),
  );
  expect(result.pages[0]?.text).toContain("violet otter");
  const currentFiles = new Artifacts(f.lifecycle);
  currentFiles.workspaces
    .files(childRun.workspace_id as string)
    .create("review.txt", Buffer.from("Shared review"));
  const output = currentFiles.publish(
    crypto.randomUUID(),
    { workspace_id: childRun.workspace_id, run_id: childRun.id, path: "review.txt" },
    () => f.lifecycle.authorizeDispatch(childRun.id, childRun.dispatch_token as string),
  );
  expect(output).toMatchObject({ agent_id: null, created_by_agent_id: peer.id });
  finish(childRun);
  const followup = new Groups(f.lifecycle).send(group.id, {
    text: "Read the previous files.",
    agent_id: peer.id,
  });
  const next = start(f.store.get("peer_task", followup.task_id as string).current_run_id);
  expect(attachments.list(next).attachments.map((a) => a.id)).toContain(file.id);
  expect(attachments.list(next).attachments.map((a) => a.id)).toContain(output.id);
  expect(currentFiles.download(file.id, run.workspace_id as string).artifact.sha256).toBe(
    f.store.get("artifact", file.id).sha256,
  );
});

test("unknown group work retains the workspace lease across restart until native reconciliation", () => {
  const { group, peer, groups } = setup();
  const a = groups.send(group.id, { text: "First", agent_id: f.agent.id });
  const run = start(f.store.get("peer_task", a.task_id as string).current_run_id);
  const b = groups.send(group.id, { text: "Second", agent_id: peer.id });
  f.lifecycle.bind(group.id, peer.id, "second-native");
  f.restart();
  expect(f.lifecycle.claimNext(group.id, peer.id)).toBeNull();
  const unknown = f.store.get("run", run.id);
  f.lifecycle.reconcile(run.id, unknown.revision, "succeeded", "verified-native-receipt");
  expect(f.lifecycle.claimNext(group.id, peer.id)?.id).toBe(
    f.store.get("peer_task", b.task_id as string).current_run_id,
  );
});

test("foreign attachment admission and removed-member access fail without publishing a message", async () => {
  const { group, peer, groups, files } = setup();
  const dm = files.workspaces.ensure(f.thread.id, f.agent.id);
  const privateFile = files.upload(dm.id, crypto.randomUUID(), {
    name: "private.txt",
    content_base64: Buffer.from("private DM").toString("base64"),
  });
  expect(() =>
    groups.send(group.id, { text: "Read", agent_id: peer.id, artifact_ids: [privateFile.id] }),
  ).toThrow("SCOPE_DENIED");
  const { file, body } = stage(group.id);
  const route = new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    { ...body, agent_id: peer.id },
    body.submission_id,
  );
  const run = start(f.store.get("peer_task", route.task_id as string).current_run_id);
  groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  await expect(
    new Attachments(f.lifecycle).read(
      run,
      attachmentRead.parse({ artifact_id: file.id }),
      () => {},
    ),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(() => files.workspaces.ensure(group.id, peer.id)).toThrow("SCOPE_DENIED");
});

test("image routing exposes only capable members and rejects unsupported targets before publication", async () => {
  const { group, peer, groups } = setup();
  const connection = f.store.get("connection", f.store.get("agent", peer.id).connection_id);
  new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, image_input: "supported" },
    models: [{ id: "vision", reasoning: [], input_modalities: ["text", "image"] }],
  });
  f.lifecycle.updateAgent(peer.id, {
    expected_revision: peer.revision,
    changes: { model_id: "vision" },
  });
  const bytes = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const { file, body } = stage(group.id, crypto.randomUUID(), bytes, "image/png");
  const submissions = new AttachmentSubmissions(f.lifecycle);
  expect(() =>
    submissions.commitGroup(group.id, { ...body, agent_id: f.agent.id }, body.submission_id),
  ).toThrow();
  expect(f.store.list("artifact")).toHaveLength(0);
  const route = submissions.commitGroup(group.id, body, body.submission_id);
  const router = start(route.router_run_id as string);
  const prompt = f.store.get("message", router.input_message_id).text;
  expect(prompt).toContain(file.id);
  expect(prompt).toContain(`"agent_id":"${peer.id}"`);
  expect(prompt).not.toContain(`"agent_id":"${f.agent.id}"`);
  finish(router, JSON.stringify({ agent_id: peer.id }));
  groups.advance();
  const selected = f.store.get("group_route", route.id);
  const run = start(f.store.get("peer_task", selected.task_id as string).current_run_id);
  const visual = await prepareVisualInputs(
    f.lifecycle,
    run,
    f.store.get("connection", connection.id),
    "vision",
  );
  expect(visual.receipts[0]?.artifact_id).toBe(file.id);
});

test("retrying rejected routing keeps the original source message and cannot duplicate the selected task", async () => {
  const { group, peer, groups } = setup();
  const { body, file } = stage(group.id);
  const route = new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    body,
    body.submission_id,
  );
  const run = start(route.router_run_id as string);
  finish(run, "invalid JSON");
  groups.advance();
  const rejected = f.store.get("group_route", route.id);
  const api = app();
  const path = `/v1/groups/${group.id}/routes/${route.id}/retry`;
  const input = { expected_revision: rejected.revision, agent_id: peer.id };
  const key = crypto.randomUUID();
  const response = await post(api, path, input, key);
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(await (await post(api, path, input, key)).json()).toEqual(receipt);
  expect((await post(api, path, input)).status).toBe(409);
  expect(receipt.message_id).toBe(route.message_id);
  expect(f.store.get("message", route.message_id).artifact_ids).toEqual([file.id]);
  expect(f.store.list("peer_task")).toHaveLength(1);
  expect(
    f.store.list("message").filter((m) => m.thread_id === group.id && m.author === "user"),
  ).toHaveLength(1);
});

test("existing group lanes are preserved beneath stable directories and retain artifact identity", () => {
  const { group, peer, files, groups } = setup();
  for (const agentId of [f.agent.id, peer.id]) {
    const id = crypto.randomUUID();
    const root = join(f.dir, "workspaces", id, "files");
    mkdirSync(root, { recursive: true });
    const info = statSync(root);
    f.store.put({
      id,
      kind: "workspace",
      owner_id: f.owner,
      thread_id: group.id,
      agent_id: agentId,
      scope: "agent",
      name: "Previous group lane",
      project_path: null,
      state: "active",
      root_device: String(info.dev),
      root_inode: String(info.ino),
      revision: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    writeFileSync(join(root, "same-name.txt"), agentId);
    files.upload(id, crypto.randomUUID(), {
      name: "source.txt",
      content_base64: Buffer.from(agentId).toString("base64"),
    });
    f.lifecycle.bind(group.id, agentId, `previous-${agentId}`, f.store.get("workspace", id));
  }
  const sources = f.store.list("artifact");
  groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  const shared = files.workspaces.ensure(group.id, f.agent.id);
  for (const source of sources) {
    const current = f.store.get("artifact", source.id);
    expect(current).toMatchObject({
      workspace_id: shared.id,
      agent_id: null,
      sha256: source.sha256,
      created_by_agent_id: source.agent_id,
    });
    expect(files.download(source.id, shared.id).bytes.toString()).toBe(source.agent_id as string);
    expect(
      files.workspaces
        .files(shared.id)
        .read(`previous/${source.workspace_id}/same-name.txt`)
        .toString(),
    ).toBe(source.agent_id as string);
  }
  expect(f.store.list("binding").every((b) => !b.active)).toBe(true);
});
