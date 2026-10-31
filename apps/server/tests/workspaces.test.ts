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
import { createApi } from "../src/api";
import { Artifacts } from "../src/artifacts";
import { Background } from "../src/background";
import type { Entity } from "../src/contracts";
import { ProductTools } from "../src/harness/tools";
import { fixture } from "./helpers";

let f: ReturnType<typeof fixture>;
afterEach(() => f?.close());
const upload = (name = "input.csv", text = "value\n3\n4\n") => ({
  name,
  content_base64: Buffer.from(text).toString("base64"),
});
function setup() {
  f = fixture();
  const files = new Artifacts(f.lifecycle);
  const workspace = files.workspaces.ensure(f.thread.id, f.agent.id);
  return { files, workspace, root: files.workspaces.path(workspace) };
}
function running(workspace: Entity<"workspace">) {
  f.lifecycle.bind(f.thread.id, f.agent.id, "native-file-proof", workspace);
  const input = f.admit();
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  if (!run?.dispatch_token) throw new Error("Run was not claimed.");
  f.lifecycle.started(run.id, run.dispatch_token, "native-turn-proof");
  return {
    input,
    run: f.store.get("run", run.id),
    authorize: () => f.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string),
  };
}
test("authenticated HTTP upload, scoped listing, binary download and exact retry retain bytes after restart", async () => {
  const { workspace } = setup();
  const token = "a".repeat(64);
  const key = crypto.randomUUID();
  const app = createApi(f.lifecycle, new Background(f.lifecycle), token);
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
    new Artifacts(f.lifecycle).workspaces.files(workspace.id).read(artifact.source_path).toString(),
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
  f.restart();
  const files = new Artifacts(f.lifecycle);
  expect(files.download(artifact.id, workspace.id).bytes.toString()).toBe("value\n3\n4\n");
  expect(f.store.list("artifact")).toHaveLength(1);
  expect(files.workspaces.files(workspace.id).list("", "", 10).entries[0]?.name).toBe("inputs");
});
test("same agent has separate DM/group resources; explicit sharing creates a scoped immutable copy", () => {
  const { files, workspace } = setup();
  const group = f.lifecycle.create("thread", {
    type: "group",
    member_agent_ids: [f.agent.id],
  }) as Entity<"thread">;
  const second = files.workspaces.ensure(group.id, f.agent.id);
  const artifact = files.upload(workspace.id, crypto.randomUUID(), upload());
  expect(() => files.download(artifact.id, second.id)).toThrow("SCOPE_DENIED");
  expect(() =>
    f.lifecycle.admit({
      thread_id: group.id,
      agent_id: f.agent.id,
      text: "Read input.",
      artifact_ids: [artifact.id],
    }),
  ).toThrow("SCOPE_DENIED");
  const shared = files.share(artifact.id, second.id, crypto.randomUUID());
  expect(shared.source_artifact_id).toBe(artifact.id);
  expect(files.download(shared.id, second.id).bytes).toEqual(
    files.download(artifact.id, workspace.id).bytes,
  );
  expect(
    f.lifecycle.admit({
      thread_id: group.id,
      agent_id: f.agent.id,
      text: "Read the shared file.",
      artifact_ids: [shared.id],
    }).message.artifact_ids,
  ).toEqual([shared.id]);
});
test("path traversal, credential paths, symlink ancestors, symlink files and hardlinks cannot be read or published", () => {
  const { files, workspace, root } = setup();
  const privatePath = join(f.dir, "private.txt");
  writeFileSync(privatePath, "private-canary");
  symlinkSync(f.dir, join(root, "escape"));
  symlinkSync(privatePath, join(root, "link.txt"));
  linkSync(privatePath, join(root, "hard.txt"));
  const access = files.workspaces.files(workspace.id);
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
  const { run, authorize } = running(workspace);
  for (const path of ["link.txt", "escape/private.txt", "hard.txt"])
    expect(() =>
      files.publish(
        crypto.randomUUID(),
        { workspace_id: workspace.id, run_id: run.id, path },
        authorize,
      ),
    ).toThrow();
  expect(readFileSync(privatePath, "utf8")).toBe("private-canary");
  expect(f.store.list("artifact")).toHaveLength(0);
});
test("publication deduplicates by native run/path/hash, keeps provenance and never follows prose", () => {
  const { files, workspace, root } = setup();
  writeFileSync(join(root, "answer.txt"), "result");
  const { run, authorize } = running(workspace);
  f.lifecycle.appendAnswer(run.id, "The result is answer.txt.");
  expect(f.store.list("artifact")).toHaveLength(0);
  const input = {
    workspace_id: workspace.id,
    run_id: run.id,
    path: "answer.txt",
    media_type: "text/plain",
  };
  const key = crypto.randomUUID();
  const first = files.publish(key, input, authorize);
  expect(files.publish(key, input, authorize)).toEqual(first);
  expect(files.publish(crypto.randomUUID(), input, authorize)).toEqual(first);
  expect(first).toMatchObject({
    origin: "native_output",
    native_session_id: "native-file-proof",
    native_run_id: "native-turn-proof",
    size_bytes: 6,
    workspace_id: workspace.id,
  });
  expect(f.store.events(0, 1000).filter((e) => e.entity_kind === "artifact")).toHaveLength(1);
});
test("stop and restart retain one committed artifact without deleting or republishing files", () => {
  const { files, workspace, root } = setup();
  writeFileSync(join(root, "keep.txt"), "keep");
  const { run, authorize } = running(workspace);
  const input = { workspace_id: workspace.id, run_id: run.id, path: "keep.txt" };
  const published = files.publish(crypto.randomUUID(), input, authorize);
  f.lifecycle.cancel(run.id);
  expect(() => files.publish(crypto.randomUUID(), input, authorize)).toThrow();
  f.restart();
  const restored = new Artifacts(f.lifecycle);
  expect(restored.download(published.id, workspace.id).bytes.toString()).toBe("keep");
  expect(f.store.list("artifact")).toHaveLength(1);
  expect(readFileSync(join(root, "keep.txt"), "utf8")).toBe("keep");
  expect(f.store.get("run", run.id).status).toBe("unknown");
});
test("workspace revocation fences active tools, final publication, stale download and next dispatch", async () => {
  const { files, workspace, root } = setup();
  writeFileSync(join(root, "answer.txt"), "result");
  const { run, authorize } = running(workspace);
  const tools = new ProductTools(f.lifecycle);
  // The fixture connection must advertise the bridge before issuing a native lease.
  const connection = f.store.get("connection", f.store.get("agent", f.agent.id).connection_id);
  f.store.put(
    {
      ...connection,
      capabilities: { ...connection.capabilities, product_tools: "supported" },
      revision: connection.revision + 1,
    },
    connection.revision,
  );
  const lease = tools.issue(run);
  files.workspaces.revoke(workspace.id);
  expect(f.store.get("run", run.id).cancellation).toBe("requested");
  expect(() =>
    files.publish(
      crypto.randomUUID(),
      { workspace_id: workspace.id, run_id: run.id, path: "answer.txt" },
      authorize,
    ),
  ).toThrow();
  await expect(
    tools.call(lease.token, lease.scope, "ngertiin.read_file", { path: "answer.txt" }),
  ).rejects.toThrow();
  expect(() => files.workspaces.get(workspace.id)).toThrow("SCOPE_DENIED");
  expect(f.store.list("artifact")).toHaveLength(0);
});
test("project binding rejects credential/state ancestors and overlapping foreign project roots", () => {
  const { files, workspace } = setup();
  const sibling = join(f.dir, "project");
  mkdirSync(sibling);
  expect(() =>
    files.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id, project_path: f.dir }),
  ).toThrow("SCOPE_DENIED");
  // A project beneath installation state would share its credential boundary.
  expect(() =>
    files.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id, project_path: sibling }),
  ).toThrow("SCOPE_DENIED");
  expect(files.workspaces.get(workspace.id)).toEqual(workspace);
});
test("replacing a workspace root or corrupting immutable artifact bytes fails closed", () => {
  const { files, workspace, root } = setup();
  const artifact = files.upload(workspace.id, crypto.randomUUID(), upload());
  writeFileSync(join(files.blobRoot, artifact.storage_key), "tampered");
  expect(() => files.download(artifact.id, workspace.id)).toThrow("CONFLICT");
  renameSync(root, `${root}-old`);
  mkdirSync(root);
  expect(() => files.workspaces.files(workspace.id)).toThrow("SCOPE_DENIED");
});
test("upload rejects changed idempotency payload, overwrite, malformed base64 and credential filenames", () => {
  const { files, workspace } = setup();
  const key = crypto.randomUUID();
  files.upload(workspace.id, key, upload());
  expect(() => files.upload(workspace.id, key, upload("input.csv", "different"))).toThrow(
    "IDEMPOTENCY_CONFLICT",
  );
  expect(() =>
    files.upload(workspace.id, crypto.randomUUID(), { name: "data", content_base64: "not base64" }),
  ).toThrow();
  expect(() => files.upload(workspace.id, crypto.randomUUID(), upload(".env"))).toThrow(
    "SCOPE_DENIED",
  );
});

test("external project binding is persistent, rejects overlapping DM/group roots and preserves files on rebind", () => {
  const { files } = setup();
  const project = realpathSync(mkdtempSync(join(tmpdir(), "ngertiin-project-")));
  try {
    writeFileSync(join(project, "keep.txt"), "project-data");
    const bound = files.workspaces.bind({
      thread_id: f.thread.id,
      agent_id: f.agent.id,
      project_path: project,
    });
    expect(files.workspaces.files(bound.id).read("keep.txt").toString()).toBe("project-data");
    const group = f.lifecycle.create("thread", { type: "group", member_agent_ids: [f.agent.id] });
    expect(() =>
      files.workspaces.bind({ thread_id: group.id, agent_id: f.agent.id, project_path: project }),
    ).toThrow("SCOPE_DENIED");
    f.restart();
    const restored = new Artifacts(f.lifecycle);
    expect(restored.workspaces.get(bound.id).project_path).toBe(project);
    restored.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id });
    expect(readFileSync(join(project, "keep.txt"), "utf8")).toBe("project-data");
    expect(f.store.get("workspace", bound.id).state).toBe("revoked");
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test("final resource recheck refuses a publication revoked after reading the source", () => {
  const { files, workspace, root } = setup();
  writeFileSync(join(root, "output.txt"), "result");
  const { run, authorize } = running(workspace);
  let checks = 0;
  expect(() =>
    files.publish(
      crypto.randomUUID(),
      { workspace_id: workspace.id, run_id: run.id, path: "output.txt" },
      () => {
        authorize();
        if (++checks === 2) files.workspaces.revoke(workspace.id);
      },
    ),
  ).toThrow();
  expect(f.store.list("artifact")).toHaveLength(0);
  expect(readFileSync(join(root, "output.txt"), "utf8")).toBe("result");
});

test("rebound or modified queued attachments are fenced before native dispatch", () => {
  const { files, workspace, root } = setup();
  const artifact = files.upload(workspace.id, crypto.randomUUID(), upload());
  const admitted = f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read the input.",
    artifact_ids: [artifact.id],
  });
  const replacement = files.workspaces.bind({ thread_id: f.thread.id, agent_id: f.agent.id });
  f.lifecycle.bind(f.thread.id, f.agent.id, "replacement-native", replacement);
  const claimed = f.lifecycle.claimNext(f.thread.id, f.agent.id);
  expect(claimed?.id).toBe(admitted.run.id);
  expect(() => files.workspaces.authorizeRun(claimed as Entity<"run">)).toThrow("SCOPE_DENIED");
  // Immutable input bytes remain intact even if the staging copy was changed.
  writeFileSync(join(root, artifact.source_path as string), "changed");
  expect(readFileSync(join(files.blobRoot, artifact.storage_key), "utf8")).toBe("value\n3\n4\n");
});

test("descriptor traversal refuses concurrent symlink swaps without exposing another directory", async () => {
  const { files, workspace, root } = setup();
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
        const value = files.workspaces.files(workspace.id).read("safe/data.txt").toString();
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

test("input integrity is verified against immutable bytes before dispatch", () => {
  const { files, workspace, root } = setup();
  const input = files.upload(workspace.id, crypto.randomUUID(), upload());
  f.lifecycle.bind(f.thread.id, f.agent.id, "input-native", workspace);
  f.lifecycle.admit({
    thread_id: f.thread.id,
    agent_id: f.agent.id,
    text: "Read input.",
    artifact_ids: [input.id],
  });
  const run = f.lifecycle.claimNext(f.thread.id, f.agent.id) as Entity<"run">;
  files.verifyInputs(run);
  writeFileSync(join(root, input.source_path as string), "changed");
  expect(() => files.verifyInputs(run)).toThrow("CONFLICT");
  expect(files.download(input.id, workspace.id).bytes.toString()).toBe("value\n3\n4\n");
});

test("native temporary storage stays outside agent-writable paths and rejects substituted roots", () => {
  const { files, workspace, root } = setup();
  symlinkSync(f.dir, join(root, ".tmp"));
  const temporary = files.workspaces.temporary(workspace);
  expect(temporary.startsWith(root)).toBe(false);
  expect(realpathSync(temporary)).toBe(temporary);
  renameSync(temporary, `${temporary}-old`);
  symlinkSync(f.dir, temporary);
  expect(() => files.workspaces.temporary(workspace)).toThrow("SCOPE_DENIED");
});
