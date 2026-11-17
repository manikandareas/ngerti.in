import { afterEach, expect, test } from "bun:test";
import {
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Artifacts } from "../src/artifacts";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";
import { fixtureApi as createApi } from "./http-fixture";

let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => await f?.close());
const upload = (name = "input.csv", text = "value\n3\n4\n") => ({
  name,
  content_base64: Buffer.from(text).toString("base64"),
});
async function setup() {
  f = await fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = await files.workspaces.ensure(f.thread.id, f.agent.id);
  return { files, workspace, root: files.workspaces.path(workspace) };
}
async function running(
  workspace: Entity<"workspace">,
  nativeTurn: string | null = "native-turn-proof",
) {
  await f.lifecycle.bind(f.thread.id, f.agent.id, "native-file-proof", workspace);
  const input = await f.admit();
  const run = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Run was not claimed.");
  await f.lifecycle.started(run.id, run.dispatch_token, nativeTurn ?? undefined);
  return {
    input,
    run: await f.store.get("run", run.id),
    authorize: async () =>
      await f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  };
}
test("authenticated HTTP upload, scoped listing, binary download and exact retry retain bytes after restart", async () => {
  const { workspace } = await setup();
  const token = "a".repeat(64);
  const key = crypto.randomUUID();
  const app = await createApi(f.lifecycle, new Background(f.lifecycle), token);
  const request = () =>
    new Request(`http://localhost/v1/workspaces/${workspace.id}/uploads`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "Idempotency-Key": key,
      },
      body: JSON.stringify(upload()),
    });
  const response = await app.handle(request());
  expect(response.status).toBe(200);
  const artifact = await response.json();
  const staged = join(new Artifacts(f.lifecycle).workspaces.path(workspace), artifact.source_path);
  expect(lstatSync(staged).mode & 0o777).toBe(0o600);
  expect(
    (await new Artifacts(f.lifecycle).workspaces.files(workspace.id))
      .read(artifact.source_path)
      .toString(),
  ).toBe("value\n3\n4\n");
  expect(await (await app.handle(request())).json()).toEqual(artifact);
  const retries = await Promise.all(
    Array.from({ length: 12 }, async () => (await app.handle(request())).json()),
  );
  expect(retries.every((item) => item.id === artifact.id)).toBe(true);
  expect(
    (
      await app.handle(
        new Request(
          `http://localhost/v1/artifacts/${artifact.id}/content?workspace_id=${workspace.id}`,
        ),
      )
    ).status,
  ).toBe(401);
  await f.restart();
  const files = new Artifacts(f.lifecycle);
  expect((await files.download(artifact.id, workspace.id)).bytes.toString()).toBe("value\n3\n4\n");
  expect(await f.store.list("artifact")).toHaveLength(1);
  expect((await files.workspaces.files(workspace.id)).list("", "", 10).entries[0]?.name).toBe(
    "inputs",
  );
});
test("same agent has separate DM/group resources; explicit sharing creates a scoped immutable copy", async () => {
  const { files, workspace } = await setup();
  const group = (await f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  })) as Entity<"thread">;
  const second = await files.workspaces.ensure(group.id, f.agent.id);
  const artifact = await files.upload(workspace.id, crypto.randomUUID(), upload());
  await expect((async () => files.download(artifact.id, second.id))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
  await expect(
    (async () =>
      f.lifecycle.admit({
        thread_id: group.id,
        agent_id: f.agent.id,
        text: "Read input.",
        artifact_ids: [artifact.id],
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  const shared = await files.share(artifact.id, second.id, crypto.randomUUID());
  expect(shared.source_artifact_id).toBe(artifact.id);
  expect((await files.download(shared.id, second.id)).bytes).toEqual(
    (await files.download(artifact.id, workspace.id)).bytes,
  );
  expect(
    (
      await f.lifecycle.admit({
        thread_id: group.id,
        agent_id: f.agent.id,
        text: "Read the shared file.",
        artifact_ids: [shared.id],
      })
    ).message.artifact_ids,
  ).toEqual([shared.id]);
});
test("path traversal, credential paths, symlink ancestors, symlink files and hardlinks cannot be read or published", async () => {
  const { files, workspace, root } = await setup();
  const privatePath = join(f.dir, "private.txt");
  writeFileSync(privatePath, "private-canary");
  symlinkSync(f.dir, join(root, "escape"));
  symlinkSync(privatePath, join(root, "link.txt"));
  linkSync(privatePath, join(root, "hard.txt"));
  const access = await files.workspaces.files(workspace.id);
  for (const path of [
    "../private.txt",
    "escape/private.txt",
    "link.txt",
    "hard.txt",
    ".codex/auth.json",
    ".env",
    ".config/muse/auth.json",
  ])
    expect(() => access.read(path)).toThrow();
  expect(() => access.create("escape/new.txt", Buffer.from("bad"))).toThrow();
  const { run, authorize } = await running(workspace);
  for (const path of ["link.txt", "escape/private.txt", "hard.txt"])
    await expect(
      files.publish(
        crypto.randomUUID(),
        { workspace_id: workspace.id, run_id: run.id, path },
        authorize,
      ),
    ).rejects.toThrow();
  expect(readFileSync(privatePath, "utf8")).toBe("private-canary");
  expect(await f.store.list("artifact")).toHaveLength(0);
});
test("publication deduplicates by native run/path/hash, keeps provenance and never follows prose", async () => {
  const { files, workspace, root } = await setup();
  writeFileSync(join(root, "answer.txt"), "result");
  const { run, authorize } = await running(workspace);
  await f.lifecycle.appendAnswer(run.id, "The result is answer.txt.");
  expect(await f.store.list("artifact")).toHaveLength(0);
  const input = {
    workspace_id: workspace.id,
    run_id: run.id,
    path: "answer.txt",
    media_type: "text/plain",
  };
  const key = crypto.randomUUID();
  const first = await files.publish(key, input, authorize);
  expect(await files.publish(key, input, authorize)).toEqual(first);
  expect(await files.publish(crypto.randomUUID(), input, authorize)).toEqual(first);
  expect(first).toMatchObject({
    origin: "native_output",
    native_session_id: "native-file-proof",
    native_run_id: "native-turn-proof",
    size_bytes: 6,
    workspace_id: workspace.id,
  });
  expect((await f.store.events(0, 1000)).filter((e) => e.entity_kind === "artifact")).toHaveLength(
    1,
  );
});
test("an accepted nullable-ID run publishes immutable artifacts through its application binding and lease", async () => {
  const { files, workspace, root } = await setup();
  writeFileSync(join(root, "acp-report.txt"), "Scoped ACP output");
  const { run, authorize } = await running(workspace, null);
  const input = { workspace_id: workspace.id, run_id: run.id, path: "acp-report.txt" };
  expect(run.native_run_id).toBeNull();
  const published = await files.publish(crypto.randomUUID(), input, authorize);
  expect(published).toMatchObject({
    run_id: run.id,
    native_run_id: null,
    native_session_id: "native-file-proof",
  });
  expect((await files.download(published.id, workspace.id)).bytes.toString()).toBe(
    "Scoped ACP output",
  );
  expect(await files.publish(crypto.randomUUID(), input, authorize)).toEqual(published);
  await f.lifecycle.cancel(run.id);
  await expect(files.publish(crypto.randomUUID(), input, authorize)).rejects.toThrow();
  expect(await f.store.list("artifact")).toHaveLength(1);
});
test("stop and restart retain one committed artifact without deleting or republishing files", async () => {
  const { files, workspace, root } = await setup();
  writeFileSync(join(root, "keep.txt"), "keep");
  const { run, authorize } = await running(workspace);
  const input = { workspace_id: workspace.id, run_id: run.id, path: "keep.txt" };
  const published = await files.publish(crypto.randomUUID(), input, authorize);
  await f.lifecycle.cancel(run.id);
  await expect(files.publish(crypto.randomUUID(), input, authorize)).rejects.toThrow();
  await f.restart();
  const restored = new Artifacts(f.lifecycle);
  expect((await restored.download(published.id, workspace.id)).bytes.toString()).toBe("keep");
  expect(await f.store.list("artifact")).toHaveLength(1);
  expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("keep");
  expect((await f.store.get("run", run.id)).status).toBe("unknown");
});
test("workspace revocation fences active tools, final publication, stale download and next dispatch", async () => {
  const { files, workspace, root } = await setup();
  writeFileSync(join(root, "answer.txt"), "result");
  const { run, authorize } = await running(workspace);
  const tools = await ProductTools.open(f.lifecycle);
  // The fixture connection must advertise the bridge before issuing a native lease.
  const connection = await f.store.get(
    "connection",
    (await f.store.get("agent", f.agent.id)).connection_id,
  );
  await f.store.put(
    {
      ...connection,
      capabilities: { ...connection.capabilities, product_tools: "supported" },
      revision: connection.revision + 1,
    },
    connection.revision,
  );
  const lease = await tools.issue(run);
  await files.workspaces.revoke(workspace.id);
  expect((await f.store.get("run", run.id)).cancellation).toBe("requested");
  await expect(
    files.publish(
      crypto.randomUUID(),
      { workspace_id: workspace.id, run_id: run.id, path: "answer.txt" },
      authorize,
    ),
  ).rejects.toThrow();
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_file", { path: "answer.txt" }),
  ).rejects.toThrow();
  await expect((async () => files.workspaces.get(workspace.id))()).rejects.toThrow("SCOPE_DENIED");
  expect(await f.store.list("artifact")).toHaveLength(0);
});
test("project binding rejects credential/state ancestors and overlapping foreign project roots", async () => {
  const { files, workspace } = await setup();
  const sibling = join(f.dir, "project");
  mkdirSync(sibling);
  await expect(
    (async () =>
      files.workspaces.bind({
        thread_id: f.thread.id,
        agent_id: f.agent.id,
        project_path: f.dir,
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  // A project beneath installation state would share its credential boundary.
  await expect(
    (async () =>
      files.workspaces.bind({
        thread_id: f.thread.id,
        agent_id: f.agent.id,
        project_path: sibling,
      }))(),
  ).rejects.toThrow("SCOPE_DENIED");
  expect(await files.workspaces.get(workspace.id)).toEqual(workspace);
});
test("replacing a workspace root or corrupting immutable artifact bytes fails closed", async () => {
  const { files, workspace, root } = await setup();
  const artifact = await files.upload(workspace.id, crypto.randomUUID(), upload());
  writeFileSync(join(files.blobRoot, artifact.storage_key), "tampered");
  await expect((async () => files.download(artifact.id, workspace.id))()).rejects.toThrow(
    "CONFLICT",
  );
  renameSync(root, `${root}-old`);
  mkdirSync(root);
  await expect((async () => files.workspaces.files(workspace.id))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});
test("upload rejects changed idempotency payload, overwrite, malformed base64 and credential filenames", async () => {
  const { files, workspace } = await setup();
  const key = crypto.randomUUID();
  await files.upload(workspace.id, key, upload());
  await expect(files.upload(workspace.id, key, upload("input.csv", "different"))).rejects.toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
  await expect(
    files.upload(workspace.id, crypto.randomUUID(), { name: "data", content_base64: "not base64" }),
  ).rejects.toThrow();
  await expect(files.upload(workspace.id, crypto.randomUUID(), upload(".env"))).rejects.toThrow(
    "SCOPE_DENIED",
  );
});

test("external project binding is persistent, rejects overlapping DM/group roots and preserves files on rebind", async () => {
  const { files } = await setup();
  const project = realpathSync(mkdtempSync(join(tmpdir(), "ngertiin-project-")));
  try {
    writeFileSync(join(project, "keep.txt"), "project-data");
    const bound = await files.workspaces.bind({
      thread_id: f.thread.id,
      agent_id: f.agent.id,
      project_path: project,
    });
    expect((await files.workspaces.files(bound.id)).read("keep.txt").toString()).toBe(
      "project-data",
    );
    const group = await f.lifecycle.create("thread", {
      type: "group",
      member_agent_ids: [f.agent.id],
    });
    await expect(
      (async () =>
        files.workspaces.bind({
          thread_id: group.id,
          agent_id: f.agent.id,
          project_path: project,
        }))(),
    ).rejects.toThrow("SCOPE_DENIED");
    await f.restart();
    const restored = new Artifacts(f.lifecycle);
    expect((await restored.workspaces.get(bound.id)).project_path).toBe(project);
    await restored.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id });
    expect(readFileSync(join(project, "keep.txt"), "utf8")).toBe("project-data");
    expect((await f.store.get("workspace", bound.id)).state).toBe("revoked");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("final resource recheck refuses a publication revoked after reading the source", async () => {
  const { files, workspace, root } = await setup();
  writeFileSync(join(root, "output.txt"), "result");
  const { run, authorize } = await running(workspace);
  let checks = 0;
  await expect(
    files.publish(
      crypto.randomUUID(),
      { workspace_id: workspace.id, run_id: run.id, path: "output.txt" },
      async () => {
        await authorize();
        if (++checks === 2) await files.workspaces.revoke(workspace.id);
      },
    ),
  ).rejects.toThrow();
  expect(await f.store.list("artifact")).toHaveLength(0);
  expect(readFileSync(join(root, "output.txt"), "utf8")).toBe("result");
});

test("rebound or modified queued attachments are fenced before native dispatch", async () => {
  const { files, workspace, root } = await setup();
  const artifact = await files.upload(workspace.id, crypto.randomUUID(), upload());
  const admitted = await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read the input.",
    artifact_ids: [artifact.id],
  });
  const replacement = await files.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id });
  await f.lifecycle.bind(f.thread.id, f.agent.id, "replacement-native", replacement);
  const claimed = await f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(admitted.run.id);
  await expect(
    (async () => files.workspaces.authorizeRun(claimed as Entity<"run">))(),
  ).rejects.toThrow("SCOPE_DENIED");
  // Immutable input bytes remain intact even if the staging copy was changed.
  writeFileSync(join(root, artifact.source_path as string), "changed");
  expect(readFileSync(join(files.blobRoot, artifact.storage_key), "utf8")).toBe("value\n3\n4\n");
});

test("descriptor traversal refuses concurrent symlink swaps without exposing another directory", async () => {
  const { files, workspace, root } = await setup();
  const outside = join(f.dir, "foreign");
  mkdirSync(outside);
  mkdirSync(join(root, "safe"));
  writeFileSync(join(outside, "data.txt"), "private-canary");
  writeFileSync(join(root, "safe/data.txt"), "authorized");
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      `
    import { renameSync, symlinkSync, unlinkSync } from "node:fs";
    const [safe, held, foreign] = process.argv.slice(1);
    for (let i = 0; i < 2000; i++) {
      renameSync(safe, held); symlinkSync(foreign, safe); unlinkSync(safe); renameSync(held, safe);
    }
  `,
      join(root, "safe"),
      join(root, "held"),
      outside,
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  let reads = 0;
  try {
    for (let i = 0; i < 120; i++) {
      try {
        const value = (await files.workspaces.files(workspace.id)).read("safe/data.txt").toString();
        expect(value).toBe("authorized");
        reads++;
      } catch (error) {
        if (error instanceof Error && !["NOT_FOUND", "SCOPE_DENIED"].includes(error.message))
          throw error;
      }
      await Bun.sleep(1);
    }
    expect(reads).toBeGreaterThan(0);
  } finally {
    child.kill();
    await child.exited;
  }
  expect(readFileSync(join(outside, "data.txt"), "utf8")).toBe("private-canary");
});

test("input integrity is verified against immutable bytes before dispatch", async () => {
  const { files, workspace, root } = await setup();
  const input = await files.upload(workspace.id, crypto.randomUUID(), upload());
  await f.lifecycle.bind(f.thread.id, f.agent.id, "input-native", workspace);
  await f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read input.",
    artifact_ids: [input.id],
  });
  const run = (await f.lifecycle.claimNext(f.thread.id, f.agent.id)) as Entity<"run">;
  await files.verifyInputs(run);
  writeFileSync(join(root, input.source_path as string), "changed");
  await expect(files.verifyInputs(run)).rejects.toThrow("CONFLICT");
  expect((await files.download(input.id, workspace.id)).bytes.toString()).toBe("value\n3\n4\n");
});

test("native temporary storage stays outside agent-writable paths and rejects substituted roots", async () => {
  const { files, workspace, root } = await setup();
  symlinkSync(f.dir, join(root, ".tmp"));
  const temporary = await files.workspaces.temporary(workspace);
  expect(temporary.startsWith(root)).toBe(false);
  expect(realpathSync(temporary)).toBe(temporary);
  renameSync(temporary, `${temporary}-old`);
  symlinkSync(f.dir, temporary);
  await expect((async () => files.workspaces.temporary(workspace))()).rejects.toThrow(
    "SCOPE_DENIED",
  );
});
