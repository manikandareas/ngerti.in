import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readSync,
  unlinkSync,
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
  private async save(
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
      native_run_id?: string | null;
      created_by_agent_id?: string | null;
      goal_generations?: Record<string, number>;
    },
  ) {
    const now = new Date().toISOString();
    return await this.lifecycle.store.put(
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
  async inputPath(item: Entity<"artifact">) {
    if (!item.workspace_id) return item.source_path;
    const workspace = await this.workspaces.get(item.workspace_id);
    return workspace.machine_id ? `inputs/${item.id}/${basename(item.name)}` : item.source_path;
  }
  async verifyInputs(run: Entity<"run">) {
    const workspace = await this.workspaces.authorizeRun(run);
    const message = await this.lifecycle.store.get("message", run.input_message_id);
    for (const id of message.artifact_ids) {
      await this.materialize(id);
      const { artifact: item } = await this.download(id, workspace.id);
      if (
        !(await this.inputPath(item)) ||
        digest(
          await (await this.workspaces.workingFiles(workspace.id)).read(
            (await this.inputPath(item)) as string,
          ),
        ) !== item.sha256
      )
        throw new DomainError("CONFLICT");
    }
  }
  reserveUpload(id: string, input: unknown) {
    const data = uploadInput.parse(input);
    const bytes = Buffer.from(data.content_base64, "base64");
    if (bytes.toString("base64") !== data.content_base64 || bytes.length > MAX_FILE_BYTES)
      throw new DomainError("INVALID_REQUEST", 422);
    this.persist(id, bytes);
    return {
      name: data.name,
      media_type: data.media_type,
      size_bytes: bytes.length,
      sha256: digest(bytes),
    };
  }
  async commitUpload(upload: Entity<"attachment_upload">, workspace: Entity<"workspace">) {
    const bytes = this.bytes(upload.id);
    if (digest(bytes) !== upload.sha256 || bytes.length !== upload.size_bytes)
      throw new DomainError("CONFLICT");
    const now = new Date().toISOString();
    return await this.lifecycle.store.put(
      artifact.parse({
        id: upload.id,
        kind: "artifact",
        owner_id: workspace.owner_id,
        revision: 1,
        created_at: now,
        updated_at: now,
        workspace_id: workspace.id,
        thread_id: workspace.thread_id,
        agent_id: workspace.agent_id,
        storage_key: upload.id,
        sha256: upload.sha256,
        size_bytes: upload.size_bytes,
        name: upload.name,
        media_type: upload.media_type,
        source_path: `inputs/${upload.id}/${upload.name}`,
        origin: "upload",
        materialization: "pending",
      }),
    );
  }
  async materialize(artifactId: string) {
    const item = await this.lifecycle.store.get("artifact", artifactId);
    if (!item.workspace_id || !item.source_path) throw new DomainError("SCOPE_DENIED", 403);
    const workspace = await this.workspaces.get(item.workspace_id);
    if (this.lifecycle.store.dataContext && !workspace.machine_id)
      throw new DomainError("SCOPE_DENIED", 403);
    if (item.materialization !== "pending" && !workspace.machine_id) return item;
    const { bytes } = await this.download(item.id, item.workspace_id);
    await this.stage(item.workspace_id, (await this.inputPath(item)) as string, bytes);
    await this.workspaces.get(workspace.id);
    const current = await this.lifecycle.store.get("artifact", artifactId);
    if (current.materialization === "ready") return current;
    return await this.lifecycle.store.put(
      {
        ...current,
        materialization: "ready",
        revision: current.revision + 1,
        updated_at: new Date().toISOString(),
      },
      current.revision,
    );
  }
  async discardReserved(upload: Entity<"attachment_upload">) {
    if (
      (await this.lifecycle.store.list("artifact")).some((item) => item.storage_key === upload.id)
    )
      return;
    try {
      if (digest(this.bytes(upload.id)) !== upload.sha256) throw new DomainError("CONFLICT");
      unlinkSync(join(this.blobRoot, upload.id));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  async upload(workspaceId: string, commandId: string, input: unknown) {
    const data = uploadInput.parse(input);
    const workspace = await this.workspaces.get(workspaceId);
    const bytes = Buffer.from(data.content_base64, "base64");
    if (bytes.toString("base64") !== data.content_base64 || bytes.length > MAX_FILE_BYTES)
      throw new DomainError("INVALID_REQUEST", 422);
    const authorize = async () => {
      if ((await this.workspaces.get(workspaceId)).revision !== workspace.revision)
        throw new DomainError("STALE_DISPATCH");
    };
    return this.lifecycle.store.fileCommand(
      commandId,
      { operation: "upload", workspaceId, ...data },
      async () => {
        const path = `inputs/${commandId}/${data.name}`;
        this.persist(commandId, bytes);
        await this.stage(workspaceId, path, bytes);
        return path;
      },
      async (path) => {
        return await this.save(commandId, workspace, bytes, {
          name: data.name,
          source_path: path,
          media_type: data.media_type,
          origin: "upload",
        });
      },
      authorize,
    );
  }
  private async stage(workspaceId: string, path: string, bytes: Uint8Array) {
    const files = await this.workspaces.workingFiles(workspaceId);
    try {
      await files.create(path, bytes);
    } catch (error) {
      // A crash after file fsync but before the receipt is safe to acknowledge only for exact bytes.
      try {
        if (digest(await files.read(path)) !== digest(bytes)) throw new DomainError("CONFLICT");
      } catch (verification) {
        if (verification instanceof DomainError && verification.code === "CONFLICT")
          throw verification;
        throw error;
      }
    }
  }
  async publish(commandId: string, input: unknown, authorize: () => void) {
    const data = publicationInput.parse(input);
    await authorize();
    const run = await this.lifecycle.store.get("run", data.run_id);
    const workspace = await this.workspaces.authorizeRun(run);
    if (
      workspace.id !== data.workspace_id ||
      !run.binding_id ||
      run.status !== "running" ||
      !run.dispatch_token
    )
      throw new DomainError("SCOPE_DENIED", 403);
    await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const reauthorize = async () => {
      await authorize();
      await this.workspaces.authorizeRun(await this.lifecycle.store.get("run", run.id));
      await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
      await authorizeResponsibilityWork(this.lifecycle, run.id);
    };
    return this.lifecycle.store.fileCommand(
      commandId,
      { operation: "publish_artifact", ...data },
      async () => {
        await reauthorize();
        const bytes = await (await this.workspaces.workingFiles(workspace.id)).read(data.path);
        this.persist(commandId, bytes);
        return bytes;
      },
      async (bytes) => {
        const previous = (
          await this.lifecycle.store.list("artifact", {
            run_id: run.id,
            workspace_id: workspace.id,
          })
        ).find(
          (a) =>
            a.run_id === run.id &&
            a.workspace_id === workspace.id &&
            a.source_path === data.path &&
            a.sha256 === digest(bytes),
        );
        if (previous) return previous;
        const binding = await this.lifecycle.store.get("binding", run.binding_id as string);
        if (run.publication === "quiet") {
          const current = await this.lifecycle.store.get("run", run.id);
          await this.lifecycle.store.put(
            {
              ...current,
              publication: "deferred",
              revision: current.revision + 1,
              updated_at: new Date().toISOString(),
            },
            current.revision,
          );
        }
        return await this.save(commandId, workspace, bytes, {
          name: basename(data.path),
          media_type: data.media_type,
          source_path: data.path,
          origin: "native_output",
          run_id: run.id,
          native_session_id: binding.native_session_id,
          native_run_id: run.native_run_id,
          created_by_agent_id: run.agent_id,
          goal_generations: run.task_id
            ? (await this.lifecycle.store.get("peer_task", run.task_id)).goal_generations
            : run.goal_id && run.goal_generation
              ? { [run.goal_id]: run.goal_generation }
              : {},
        });
      },
      reauthorize,
    );
  }
  async download(artifactId: string, workspaceId: string) {
    const workspace = await this.workspaces.get(workspaceId);
    const item = await this.lifecycle.store.get("artifact", artifactId);
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
  async share(artifactId: string, workspaceId: string, commandId: string) {
    const original = await this.lifecycle.store.get("artifact", artifactId);
    if (!original.workspace_id) throw new DomainError("SCOPE_DENIED", 403);
    const source = await this.download(artifactId, original.workspace_id);
    const target = await this.workspaces.get(workspaceId);
    return this.lifecycle.store.fileCommand(
      commandId,
      { operation: "share_artifact", artifactId, workspaceId },
      async () => {
        const path = `inputs/${commandId}/${original.name}`;
        this.persist(commandId, source.bytes);
        await this.stage(target.id, path, source.bytes);
        return path;
      },
      async (path) => {
        return await this.save(commandId, target, source.bytes, {
          name: original.name,
          media_type: original.media_type,
          source_path: path,
          origin: "shared_copy",
          source_artifact_id: original.id,
        });
      },
      async () => {
        if ((await this.workspaces.get(workspaceId)).revision !== target.revision)
          throw new DomainError("STALE_DISPATCH");
      },
    );
  }
}
