import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";
import { artifact, DomainError, type Entity } from "./contracts";
import { authorizeResponsibilityWork } from "./goals/work-fence";
import type { Lifecycle } from "./lifecycle";
import { MAX_FILE_BYTES, publicationInput, uploadInput } from "./workspaces/contracts";
import { Workspaces } from "./workspaces/service";

const digest = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
/** Immutable bytes are durable before their transactional publication/event/command receipt. */
export class Artifacts {
  readonly workspaces: Workspaces;
  readonly blobRoot: string;
  constructor(readonly lifecycle: Lifecycle) {
    this.workspaces = new Workspaces(lifecycle);
    this.blobRoot = join(this.workspaces.root, "artifact-bytes");
    mkdirSync(this.blobRoot, { recursive: true, mode: 0o700 });
  }
  private bytes(key: string) {
    const handle = openSync(
      join(this.blobRoot, key),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      const info = fstatSync(handle);
      if (!info.isFile() || info.nlink !== 1 || info.size > MAX_FILE_BYTES)
        throw new DomainError("SCOPE_DENIED", 403);
      const data = Buffer.alloc(info.size);
      let offset = 0;
      while (offset < data.length) {
        const count = readSync(handle, data, offset, data.length - offset, offset);
        if (!count) throw new DomainError("CONFLICT");
        offset += count;
      }
      return data;
    } finally {
      closeSync(handle);
    }
  }
  private persist(key: string, bytes: Uint8Array) {
    let handle: number;
    try {
      handle = openSync(
        join(this.blobRoot, key),
        constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
        0o600,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (digest(this.bytes(key)) !== digest(bytes)) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return;
    }
    try {
      writeFileSync(handle, bytes);
      fsyncSync(handle);
    } finally {
      closeSync(handle);
    }
    const directory = openSync(this.blobRoot, constants.O_RDONLY | constants.O_DIRECTORY);
    try {
      fsyncSync(directory);
    } finally {
      closeSync(directory);
    }
  }
  private save(
    id: string,
    workspace: Entity<"workspace">,
    bytes: Uint8Array,
    fields: {
      name: string;
      media_type: string;
      source_path: string;
      origin: "upload" | "native_output" | "shared_copy";
      run_id?: string;
      source_artifact_id?: string;
      native_session_id?: string;
      native_run_id?: string;
    },
  ) {
    this.persist(id, bytes);
    const now = new Date().toISOString();
    return this.lifecycle.store.put(
      artifact.parse({
        id,
        kind: "artifact",
        owner_id: workspace.owner_id,
        revision: 1,
        created_at: now,
        updated_at: now,
        workspace_id: workspace.id,
        thread_id: workspace.thread_id,
        agent_id: workspace.agent_id,
        storage_key: id,
        sha256: digest(bytes),
        size_bytes: bytes.length,
        ...fields,
      }),
    );
  }
  verifyInputs(run: Entity<"run">) {
    const workspace = this.workspaces.authorizeRun(run);
    const message = this.lifecycle.store.get("message", run.input_message_id);
    for (const id of message.artifact_ids) {
      const { artifact: item } = this.download(id, workspace.id);
      if (
        !item.source_path ||
        digest(this.workspaces.files(workspace.id).read(item.source_path)) !== item.sha256
      )
        throw new DomainError("CONFLICT");
    }
  }
  upload(workspaceId: string, commandId: string, input: unknown) {
    const data = uploadInput.parse(input);
    const workspace = this.workspaces.get(workspaceId);
    const bytes = Buffer.from(data.content_base64, "base64");
    if (bytes.toString("base64") !== data.content_base64 || bytes.length > MAX_FILE_BYTES)
      throw new DomainError("INVALID_REQUEST", 422);
    return this.lifecycle.store.command(
      commandId,
      { operation: "upload", workspaceId, ...data },
      () => {
        const path = `inputs/${commandId}/${data.name}`;
        this.stage(workspaceId, path, bytes);
        return this.save(commandId, workspace, bytes, {
          name: data.name,
          source_path: path,
          media_type: data.media_type,
          origin: "upload",
        });
      },
    );
  }
  private stage(workspaceId: string, path: string, bytes: Uint8Array) {
    const files = this.workspaces.files(workspaceId);
    try {
      files.create(path, bytes);
    } catch (error) {
      // A crash after file fsync but before the receipt is safe to acknowledge only for exact bytes.
      if (!(error instanceof DomainError) || error.code !== "SCOPE_DENIED") throw error;
      if (digest(files.read(path)) !== digest(bytes)) throw new DomainError("CONFLICT");
    }
  }
  publish(commandId: string, input: unknown, authorize: () => void) {
    const data = publicationInput.parse(input);
    authorize();
    const run = this.lifecycle.store.get("run", data.run_id);
    const workspace = this.workspaces.authorizeRun(run);
    if (
      workspace.id !== data.workspace_id ||
      !run.native_run_id ||
      run.status !== "running" ||
      !run.dispatch_token
    )
      throw new DomainError("SCOPE_DENIED", 403);
    this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    return this.lifecycle.store.command(
      commandId,
      { operation: "publish_artifact", ...data },
      () => {
        authorizeResponsibilityWork(this.lifecycle, run.id);
        const bytes = this.workspaces.files(workspace.id).read(data.path);
        authorize();
        this.workspaces.authorizeRun(this.lifecycle.store.get("run", run.id));
        this.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
        const previous = this.lifecycle.store
          .list("artifact")
          .find(
            (a) =>
              a.run_id === run.id &&
              a.workspace_id === workspace.id &&
              a.source_path === data.path &&
              a.sha256 === digest(bytes),
          );
        if (previous) return previous;
        const binding = this.lifecycle.store.get("binding", run.binding_id as string);
        if (run.publication === "quiet") {
          const current = this.lifecycle.store.get("run", run.id);
          this.lifecycle.store.put(
            {
              ...current,
              publication: "deferred",
              revision: current.revision + 1,
              updated_at: new Date().toISOString(),
            },
            current.revision,
          );
        }
        return this.save(commandId, workspace, bytes, {
          name: basename(data.path),
          media_type: data.media_type,
          source_path: data.path,
          origin: "native_output",
          run_id: run.id,
          native_session_id: binding.native_session_id,
          native_run_id: run.native_run_id as string,
        });
      },
    );
  }
  download(artifactId: string, workspaceId: string) {
    const workspace = this.workspaces.get(workspaceId);
    const item = this.lifecycle.store.get("artifact", artifactId);
    if (
      item.workspace_id !== workspace.id ||
      item.agent_id !== workspace.agent_id ||
      item.thread_id !== workspace.thread_id ||
      item.origin === "metadata"
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const bytes = this.bytes(item.storage_key);
    if (bytes.length !== item.size_bytes || digest(bytes) !== item.sha256)
      throw new DomainError("CONFLICT");
    return { artifact: item, bytes };
  }
  share(artifactId: string, workspaceId: string, commandId: string) {
    const original = this.lifecycle.store.get("artifact", artifactId);
    if (!original.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
    const source = this.download(artifactId, original.workspace_id);
    const target = this.workspaces.get(workspaceId);
    return this.lifecycle.store.command(
      commandId,
      { operation: "share_artifact", artifactId, workspaceId },
      () => {
        const path = `inputs/${commandId}/${original.name}`;
        this.stage(target.id, path, source.bytes);
        return this.save(commandId, target, source.bytes, {
          name: original.name,
          media_type: original.media_type,
          source_path: path,
          origin: "shared_copy",
          source_artifact_id: original.id,
        });
      },
    );
  }
}
