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

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
const token = "j".repeat(64);
async function setup() {
  f = await fixture();
  const peer = await f.lifecycle.createAgent({
    name: "Reviewer",
    handle: "reviewer",
    harness: "codex",
    connection_id: (await f.store.get("agent", f.agent.id)).connection_id,
  });
  const group = (await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id, peer.id],
  })) as Entity<"thread">;
  return { peer, group, groups: new Groups(f.lifecycle), files: new Artifacts(f.lifecycle) };
}
async function stage(
  groupId: string,
  submission = crypto.randomUUID(),
  bytes = Buffer.from("Group source: violet otter 8472"),
  media = "text/plain",
) {
  const file = await new AttachmentSubmissions(f.lifecycle).stage(crypto.randomUUID(), {
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
async function start(runId: string) {
  const queued = await f.store.get("run", runId);
  if (
    !(await f.store.list("binding")).some(
      (b) => b.active && b.thread_id === queued.thread_id && b.agent_id === queued.agent_id,
    )
  )
    await f.lifecycle.bind(queued.thread_id, queued.agent_id, crypto.randomUUID());
  const run = await f.lifecycle.claimNext(queued.thread_id, queued.agent_id);
  if (!run?.dispatch_token) throw new Error("Run cannot acquire its workspace.");
  await f.lifecycle.started(run.id, run.dispatch_token, crypto.randomUUID());
  return await f.store.get("run", run.id);
}
async function finish(run: Entity<"run">, answer = "Source reviewed.") {
  await f.lifecycle.appendAnswer(run.id, answer);
  await f.lifecycle.settle(run.id, run.dispatch_token as string, "succeeded");
}
async function app() {
  return await createApi(f.lifecycle, new Background(f.lifecycle), token);
}
async function post(
  api: Awaited<ReturnType<typeof app>>,
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

test("group members share one workspace and have separate DM, routing and temporary resources", async () => {
  const { group, peer, files } = await setup();
  const first = await files.workspaces.ensure(group.id, f.agent.id);
  expect((await files.workspaces.ensure(group.id, peer.id)).id).toBe(first.id);
  expect(first).toMatchObject({ scope: "group", agent_id: null });
  expect((await files.workspaces.ensure(f.thread.id, f.agent.id)).id).not.toBe(first.id);
  expect(await files.workspaces.temporary(first, f.agent.id)).not.toBe(
    await files.workspaces.temporary(first, peer.id),
  );
  const route = await new Groups(f.lifecycle).send(group.id, { text: "Choose a reviewer." });
  const routing = await f.store.get("run", route.router_run_id as string);
  expect((await files.workspaces.ensure(routing.thread_id, routing.agent_id)).scope).toBe("agent");
  expect((await f.store.list("workspace")).filter((w) => w.scope === "group")).toHaveLength(1);
});

test("a shared native writer closes its owned background descendants before releasing the workspace", async () => {
  const { group, files } = await setup();
  const workspace = await files.workspaces.ensure(group.id, f.agent.id);
  const marker = join(files.workspaces.path(workspace), "stale-writer.txt");
  const release = join(files.workspaces.path(workspace), "release-writer.txt");
  const owned = new OwnedProcess(
    "/bin/sh",
    [
      "-c",
      '(while [ ! -e "$2" ]; do sleep 0.01; done; printf stale > "$1") & printf ready; wait',
      "writer",
      marker,
      release,
    ],
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
  // Release a surviving descendant only after close, independently of SQL or
  // event-loop latency before the native process's ready signal is observed.
  writeFileSync(release, "release");
  await Bun.sleep(650);
  expect(existsSync(marker)).toBe(false);
  await owned.close();
});

test("group submission is atomic and exact HTTP retries reconcile one message, route and artifact after restart", async () => {
  const { group } = await setup();
  const { file, body } = await stage(group.id);
  const api = await app();
  const path = `/v1/groups/${group.id}/messages`;
  const rejected = await post(
    api,
    path,
    { ...body, artifact_ids: [file.id, crypto.randomUUID()] },
    body.submission_id,
  );
  expect(rejected.status).toBe(404);
  expect(await f.store.list("artifact")).toHaveLength(0);
  expect(await f.store.list("message")).toHaveLength(0);
  const receipts = await Promise.all(
    Array.from({ length: 4 }, async () => {
      const response = await post(api, path, body, body.submission_id);
      expect(response.status).toBe(200);
      return response.json();
    }),
  );
  expect(new Set(receipts.map((r) => r.id)).size).toBe(1);
  expect(await f.store.list("artifact")).toHaveLength(1);
  expect((await f.store.list("message")).filter((m) => m.thread_id === group.id)).toHaveLength(1);
  expect((await f.store.list("attachment_upload"))[0]?.state).toBe("committed");
  expect((await post(api, path, { ...body, text: "changed" }, body.submission_id)).status).toBe(
    409,
  );
  await f.restart();
  const restored = await app();
  const status = await restored.handle(
    new Request(`http://localhost/v1/message-submissions/${body.submission_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  expect(await status.json()).toEqual({ state: "committed", result: receipts[0] });
  expect(await (await post(restored, path, body, body.submission_id)).json()).toEqual(receipts[0]);
  const artifact = await f.store.get("artifact", file.id);
  expect(
    (
      await new Artifacts(f.lifecycle).download(file.id, artifact.workspace_id as string)
    ).bytes.toString(),
  ).toContain("violet otter");
  expect(await f.store.list("group_route")).toHaveLength(1);
});

test("handoff and follow-up use the same source, serialize writers and retain access after restart", async () => {
  const { group, peer, groups } = await setup();
  const { file, body } = await stage(group.id);
  const route = await new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    { ...body, agent_id: f.agent.id },
    body.submission_id,
  );
  const root = await f.store.get("peer_task", route.task_id as string);
  const run = await start(root.current_run_id);
  const authorize = async () =>
    await f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
  const read = await new Attachments(f.lifecycle).read(
    run,
    attachmentRead.parse({ artifact_id: file.id }),
    authorize,
  );
  expect(read.pages[0]?.text).toContain("violet otter");
  const child = await groups.handoff(run.id, {
    agent_id: peer.id,
    instruction: "Review the exact source.",
    purpose: "review",
  });
  await f.lifecycle.bind(group.id, peer.id, "peer-native");
  expect(await f.lifecycle.claimNext(group.id, peer.id)).toBeNull();
  await finish(run);
  await f.restart();
  const childRun = await start(child.current_run_id);
  expect(childRun.workspace_id).toBe(run.workspace_id);
  expect((await f.store.get("message", childRun.input_message_id)).artifact_ids).toEqual([file.id]);
  const attachments = new Attachments(f.lifecycle);
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", peer.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, product_tools: "supported" },
  });
  const tools = await ProductTools.open(f.lifecycle);
  const lease = await tools.issue(childRun);
  const toolRead = await tools.call(lease.token, lease.scope, "ngertiin.read_attachment", {
    artifact_id: file.id,
  });
  expect(toolRead).toMatchObject({ artifact_id: file.id });
  expect((await f.store.get("run", childRun.id)).product_tools).toContain(
    "ngertiin.read_attachment",
  );
  const result = await attachments.read(
    childRun,
    attachmentRead.parse({ artifact_id: file.id }),
    async () => await f.lifecycle.authorizeDispatch(childRun.id, childRun.dispatch_token as string),
  );
  expect(result.pages[0]?.text).toContain("violet otter");
  const currentFiles = new Artifacts(f.lifecycle);
  (await currentFiles.workspaces.files(childRun.workspace_id as string)).create(
    "review.txt",
    Buffer.from("Shared review"),
  );
  const output = await currentFiles.publish(
    crypto.randomUUID(),
    { workspace_id: childRun.workspace_id, run_id: childRun.id, path: "review.txt" },
    async () => await f.lifecycle.authorizeDispatch(childRun.id, childRun.dispatch_token as string),
  );
  expect(output).toMatchObject({ agent_id: null, created_by_agent_id: peer.id });
  await finish(childRun);
  const followup = await new Groups(f.lifecycle).send(group.id, {
    text: "Read the previous files.",
    agent_id: peer.id,
  });
  const next = await start(
    (await f.store.get("peer_task", followup.task_id as string)).current_run_id,
  );
  expect((await attachments.list(next)).attachments.map((a) => a.id)).toContain(file.id);
  expect((await attachments.list(next)).attachments.map((a) => a.id)).toContain(output.id);
  expect((await currentFiles.download(file.id, run.workspace_id as string)).artifact.sha256).toBe(
    (await f.store.get("artifact", file.id)).sha256,
  );
});

test("unknown group work retains the workspace lease across restart until native reconciliation", async () => {
  const { group, peer, groups } = await setup();
  const a = await groups.send(group.id, { text: "First", agent_id: f.agent.id });
  const run = await start((await f.store.get("peer_task", a.task_id as string)).current_run_id);
  const b = await groups.send(group.id, { text: "Second", agent_id: peer.id });
  await f.lifecycle.bind(group.id, peer.id, "second-native");
  await f.restart();
  expect(await f.lifecycle.claimNext(group.id, peer.id)).toBeNull();
  const unknown = await f.store.get("run", run.id);
  await f.lifecycle.reconcile(run.id, unknown.revision, "succeeded", "verified-native-receipt");
  expect((await f.lifecycle.claimNext(group.id, peer.id))?.id).toBe(
    (await f.store.get("peer_task", b.task_id as string)).current_run_id,
  );
});

test("foreign attachment admission and removed-member access fail without publishing a message", async () => {
  const { group, peer, groups, files } = await setup();
  const dm = await files.workspaces.ensure(f.thread.id, f.agent.id);
  const privateFile = await files.upload(dm.id, crypto.randomUUID(), {
    name: "private.txt",
    content_base64: Buffer.from("private DM").toString("base64"),
  });
  await expect(
    (async () =>
      groups.send(group.id, { text: "Read", agent_id: peer.id, artifact_ids: [privateFile.id] }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  const { file, body } = await stage(group.id);
  const route = await new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    { ...body, agent_id: peer.id },
    body.submission_id,
  );
  const run = await start((await f.store.get("peer_task", route.task_id as string)).current_run_id);
  await groups.membership(group.id, {
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
  await expect((async () => files.workspaces.ensure(group.id, peer.id))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});

test("image routing exposes only capable members and rejects unsupported targets before publication", async () => {
  const { group, peer, groups } = await setup();
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", peer.id)).connection_id,
  );
  await new Connections(f.lifecycle).update(connection, {
    capabilities: { ...connection.capabilities, image_input: "supported" },
    models: [{ id: "vision", reasoning: [], input_modalities: ["text", "image"] }],
  });
  await f.lifecycle.updateAgent(peer.id, {
    expected_revision: peer.revision,
    changes: { model_id: "vision" },
  });
  const bytes = await sharp({ create: { width: 40, height: 20, channels: 3, background: "red" } })
    .png()
    .toBuffer();
  const { file, body } = await stage(group.id, crypto.randomUUID(), bytes, "image/png");
  const submissions = new AttachmentSubmissions(f.lifecycle);
  await expect(
    (async () =>
      submissions.commitGroup(group.id, { ...body, agent_id: f.agent.id }, body.submission_id))(),
  ).rejects.toThrow();
  expect(await f.store.list("artifact")).toHaveLength(0);
  const route = await submissions.commitGroup(group.id, body, body.submission_id);
  const router = await start(route.router_run_id as string);
  const prompt = (await f.store.get("message", router.input_message_id)).text;
  expect(prompt).toContain(file.id);
  expect(prompt).toContain(`"agent_id":"${peer.id}"`);
  expect(prompt).not.toContain(`"agent_id":"${f.agent.id}"`);
  await finish(router, JSON.stringify({ agent_id: peer.id }));
  await groups.advance();
  const selected = await f.store.get("group_route", route.id);
  const run = await start(
    (await f.store.get("peer_task", selected.task_id as string)).current_run_id,
  );
  const visual = await prepareVisualInputs(
    f.lifecycle,
    run,
    await f.store.get("connection", connection.id),
    "vision",
  );
  expect(visual.receipts[0]?.artifact_id).toBe(file.id);
});

test("retrying rejected routing keeps the original source message and cannot duplicate the selected task", async () => {
  const { group, peer, groups } = await setup();
  const { body, file } = await stage(group.id);
  const route = await new AttachmentSubmissions(f.lifecycle).commitGroup(
    group.id,
    body,
    body.submission_id,
  );
  const run = await start(route.router_run_id as string);
  await finish(run, "invalid JSON");
  await groups.advance();
  const rejected = await f.store.get("group_route", route.id);
  const api = await app();
  const path = `/v1/groups/${group.id}/routes/${route.id}/retry`;
  const input = { expected_revision: rejected.revision, agent_id: peer.id };
  const key = crypto.randomUUID();
  const response = await post(api, path, input, key);
  expect(response.status).toBe(200);
  const receipt = await response.json();
  expect(await (await post(api, path, input, key)).json()).toEqual(receipt);
  expect((await post(api, path, input)).status).toBe(409);
  expect(receipt.message_id).toBe(route.message_id);
  expect((await f.store.get("message", route.message_id)).artifact_ids).toEqual([file.id]);
  expect(await f.store.list("peer_task")).toHaveLength(1);
  expect(
    (await f.store.list("message")).filter((m) => m.thread_id === group.id && m.author === "user"),
  ).toHaveLength(1);
});

test("existing group lanes are preserved beneath stable directories and retain artifact identity", async () => {
  const { group, peer, files, groups } = await setup();
  for (const agentId of [f.agent.id, peer.id]) {
    const id = crypto.randomUUID();
    const root = join(f.dir, "workspaces", id, "files");
    mkdirSync(root, { recursive: true });
    const info = statSync(root);
    await f.store.put({
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
      machine_id: null,
      machine_root: null,
      revision: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    writeFileSync(join(root, "same-name.txt"), agentId);
    await files.upload(id, crypto.randomUUID(), {
      name: "source.txt",
      content_base64: Buffer.from(agentId).toString("base64"),
    });
    await f.lifecycle.bind(
      group.id,
      agentId,
      `previous-${agentId}`,
      await f.store.get("workspace", id),
    );
  }
  const sources = await f.store.list("artifact");
  await groups.membership(group.id, {
    expected_revision: group.revision,
    member_agent_ids: [f.agent.id],
  });
  const shared = await files.workspaces.ensure(group.id, f.agent.id);
  for (const source of sources) {
    const current = await f.store.get("artifact", source.id);
    expect(current).toMatchObject({
      workspace_id: shared.id,
      agent_id: null,
      sha256: source.sha256,
      created_by_agent_id: source.agent_id,
    });
    expect((await files.download(source.id, shared.id)).bytes.toString()).toBe(
      source.agent_id as string,
    );
    expect(
      (await files.workspaces.files(shared.id))
        .read(`previous/${source.workspace_id}/same-name.txt`)
        .toString(),
    ).toBe(source.agent_id as string);
  }
  expect((await f.store.list("binding")).every((b) => !b.active)).toBe(true);
});
