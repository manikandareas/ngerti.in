import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { machineFor } from "../machines/service";
import { workspaceInput } from "./contracts";
import { allowedPath, canonicalDirectory, WorkspaceFiles } from "./files";

export const within = (root: string, path: string) => {
  const rest = relative(root, path);
  return rest === "" || (!isAbsolute(rest) && rest !== ".." && !rest.startsWith("../"));
};
/** Group conversations own shared files; DM and routing workspaces remain agent scoped. */
export class Workspaces {
  readonly root: string;
  constructor(readonly lifecycle: Lifecycle) {
    this.root = realpathSync(dirname(resolve(lifecycle.store.path)));
  }
  private async scope(threadId: string, agentId: string | null) {
    const thread = await this.lifecycle.store.get("thread", threadId);
    const shared = thread.type === "group" && thread.purpose === "conversation";
    if (agentId !== null) {
      await this.lifecycle.store.get("agent", agentId);
      if (!thread.member_agent_ids.includes(agentId)) throw new DomainError("SCOPE_DENIED", 403);
    } else if (!shared) throw new DomainError("SCOPE_DENIED", 403);
    return { thread, shared };
  }
  async current(threadId: string, agentId: string | null) {
    const { shared } = await this.scope(threadId, agentId);
    return (
      (await this.lifecycle.store.list("workspace", { state: "active", thread_id: threadId })).find(
        (w) =>
          w.state === "active" &&
          w.thread_id === threadId &&
          (shared ? w.scope === "group" : w.scope === "agent" && w.agent_id === agentId),
      ) ?? null
    );
  }
  async ensure(threadId: string, agentId: string | null) {
    const current = await this.current(threadId, agentId);
    const machine = this.lifecycle.store.dataContext ? undefined : machineFor(this.lifecycle);
    if (current && machine && current.machine_id !== (await machine.snapshot()).id) {
      if (
        (await this.lifecycle.store.list("run", { workspace_id: current.id })).some(
          (run) =>
            run.workspace_id === current.id &&
            ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
      )
        throw new DomainError("CONFLICT");
      return await this.lifecycle.store.put(
        {
          ...current,
          machine_id: (await machine.snapshot()).id,
          machine_root: (await machine.snapshot()).root,
          project_path: null,
          root_device: null,
          root_inode: null,
          revision: current.revision + 1,
          updated_at: new Date().toISOString(),
        },
        current.revision,
      );
    }
    return current
      ? await this.get(current.id)
      : await this.bind({ agent_id: agentId, thread_id: threadId });
  }
  async bind(input: unknown): Promise<Entity<"workspace">> {
    const data = workspaceInput.parse(input);
    if (this.lifecycle.store.dataContext && data.project_path !== null)
      throw new DomainError("SCOPE_DENIED", 403);
    return await this.lifecycle.store.transaction(async () => {
      const { shared } = await this.scope(data.thread_id, data.agent_id);
      if (
        (await this.lifecycle.store.list("run", { thread_id: data.thread_id })).some(
          (run) =>
            run.thread_id === data.thread_id &&
            (shared || run.agent_id === data.agent_id) &&
            ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
      )
        throw new DomainError("CONFLICT");
      const id = crypto.randomUUID();
      const machine = this.lifecycle.store.dataContext ? undefined : machineFor(this.lifecycle);
      if (machine) {
        if (data.project_path !== null) throw new DomainError("SCOPE_DENIED", 403);
        const current = await this.current(data.thread_id, data.agent_id);
        if (current) await this.revoke(current.id);
        const now = new Date().toISOString();
        return await this.lifecycle.store.put({
          ...data,
          scope: shared ? "group" : "agent",
          agent_id: shared ? null : data.agent_id,
          id,
          kind: "workspace",
          owner_id: this.lifecycle.store.ownerId,
          revision: 1,
          created_at: now,
          updated_at: now,
          state: "active",
          root_device: null,
          root_inode: null,
          machine_id: (await machine.snapshot()).id,
          machine_root: (await machine.snapshot()).root,
        });
      }
      let root: string;
      if (data.project_path !== null) {
        try {
          root = canonicalDirectory(data.project_path);
        } catch (error) {
          if (error instanceof DomainError) throw error;
          throw new DomainError("SCOPE_DENIED", 403);
        }
        // Binding an ancestor would expose credentials/state. Overlapping projects break lane isolation.
        const home = process.env.HOME;
        const forbidden = [
          this.root,
          ...(home
            ? [
                join(home, ".codex"),
                join(home, ".config"),
                join(home, ".ssh"),
                join(home, ".aws"),
                join(home, ".gnupg"),
              ]
            : []),
        ];
        if (root === "/" || forbidden.some((p) => within(root, p) || within(p, root)))
          throw new DomainError("SCOPE_DENIED", 403);
        for (const part of root.split("/").filter(Boolean)) allowedPath(part);
        if (
          (await this.lifecycle.store.list("workspace")).some((w) => {
            if (
              w.thread_id === data.thread_id &&
              (shared ? w.scope === "group" : w.agent_id === data.agent_id)
            )
              return false;
            const other = this.path(w);
            return within(root, other) || within(other, root);
          })
        )
          throw new DomainError("SCOPE_DENIED", 403);
      } else {
        root = join(this.root, "workspaces", id, "files");
        mkdirSync(root, { recursive: true, mode: 0o700 });
      }
      root = realpathSync(root);
      const info = lstatSync(root);
      const now = new Date().toISOString();
      const current = await this.current(data.thread_id, data.agent_id);
      if (current) await this.revoke(current.id);
      const workspace = await this.lifecycle.store.put({
        ...data,
        scope: shared ? "group" : "agent",
        agent_id: shared ? null : data.agent_id,
        project_path: data.project_path === null ? null : root,
        id,
        kind: "workspace",
        owner_id: this.lifecycle.store.ownerId,
        revision: 1,
        created_at: now,
        updated_at: now,
        state: "active",
        root_device: String(info.dev),
        root_inode: String(info.ino),
        machine_id: null,
        machine_root: null,
      });
      if (shared) await this.adoptGroupFiles(workspace);
      return workspace;
    });
  }
  async get(workspaceId: string) {
    const workspace = await this.lifecycle.store.get("workspace", workspaceId);
    const { shared } = await this.scope(workspace.thread_id, workspace.agent_id);
    if (
      (workspace.scope === "group" && (!shared || workspace.agent_id !== null)) ||
      (workspace.scope === "agent" && workspace.agent_id === null)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (workspace.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
    if (workspace.machine_id !== null) {
      const machine = await this.lifecycle.store.get("machine", workspace.machine_id);
      if (machine.id !== this.lifecycle.store.ownerId || workspace.machine_root !== machine.root)
        throw new DomainError("SCOPE_DENIED", 403);
      return workspace;
    }
    const path = this.path(workspace);
    let info: ReturnType<typeof lstatSync>;
    try {
      info = lstatSync(path);
    } catch {
      throw new DomainError("SCOPE_DENIED", 403);
    }
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      String(info.dev) !== workspace.root_device ||
      String(info.ino) !== workspace.root_inode
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return workspace;
  }
  path(workspace: Entity<"workspace">) {
    if (workspace.machine_id !== null) {
      if (!workspace.machine_root) throw new DomainError("SCOPE_DENIED", 403);
      return workspace.machine_root;
    }
    return workspace.project_path ?? join(this.root, "workspaces", workspace.id, "files");
  }
  controlDirectory(workspace: Entity<"workspace">, agentId: string) {
    const path = join(this.root, "runtime-control", workspace.id, agentId);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
      throw new DomainError("SCOPE_DENIED", 403);
    return path;
  }
  async temporary(workspace: Entity<"workspace">, agentId = workspace.agent_id) {
    await this.get(workspace.id);
    if (workspace.scope === "group" && agentId === null) throw new DomainError("SCOPE_DENIED", 403);
    await this.scope(workspace.thread_id, agentId);
    const path = join(
      this.root,
      "runtime-temporary",
      workspace.id,
      ...(workspace.scope === "group" ? [agentId as string] : []),
    );
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
      throw new DomainError("SCOPE_DENIED", 403);
    return path;
  }
  async files(workspaceId: string) {
    const w = await this.get(workspaceId);
    if (w.machine_id !== null || w.root_device === null || w.root_inode === null)
      throw new DomainError("SCOPE_DENIED", 403);
    return new WorkspaceFiles(this.path(w), w.root_device, w.root_inode);
  }
  async workingFiles(workspaceId: string) {
    if (this.lifecycle.store.dataContext) throw new DomainError("SCOPE_DENIED", 403);
    const workspace = await this.get(workspaceId);
    if (workspace.machine_id === null) {
      if (machineFor(this.lifecycle)) throw new DomainError("STALE_DISPATCH");
      return await this.files(workspace.id);
    }
    const machine = this.lifecycle.store.dataContext ? undefined : machineFor(this.lifecycle);
    if (!machine || (await machine.snapshot()).id !== workspace.machine_id)
      throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return machine.files();
  }
  async authorizeRun(run: Entity<"run">) {
    if (!run.workspace_id || run.workspace_revision === null)
      throw new DomainError("SCOPE_DENIED", 403);
    const workspace = await this.get(run.workspace_id);
    await this.scope(run.thread_id, run.agent_id);
    if (
      workspace.thread_id !== run.thread_id ||
      (workspace.scope === "agent" && workspace.agent_id !== run.agent_id) ||
      workspace.revision !== run.workspace_revision
    )
      throw new DomainError("STALE_DISPATCH");
    const input = await this.lifecycle.store.get("message", run.input_message_id);
    for (const artifactId of input.artifact_ids) {
      const item = await this.lifecycle.store.get("artifact", artifactId);
      if (
        item.workspace_id !== workspace.id ||
        item.thread_id !== run.thread_id ||
        item.agent_id !== workspace.agent_id
      )
        throw new DomainError("SCOPE_DENIED", 403);
    }
    return workspace;
  }
  async authorizeArtifacts(threadId: string, agentId: string | null, ids: string[]) {
    await this.scope(threadId, agentId);
    if (new Set(ids).size !== ids.length) throw new DomainError("INVALID_REQUEST", 422);
    for (const id of ids) {
      const item = await this.lifecycle.store.get("artifact", id);
      if (item.thread_id !== threadId || !item.workspace_id || !item.source_path)
        throw new DomainError("SCOPE_DENIED", 403);
      const workspace = await this.get(item.workspace_id);
      if (
        workspace.thread_id !== threadId ||
        item.agent_id !== workspace.agent_id ||
        (workspace.scope === "agent" && workspace.agent_id !== agentId)
      )
        throw new DomainError("SCOPE_DENIED", 403);
    }
  }
  private async adoptGroupFiles(target: Entity<"workspace">) {
    const store = this.lifecycle.store;
    const previous = (
      await store.list("workspace", { thread_id: target.thread_id, state: "active" })
    ).filter(
      (w) => w.thread_id === target.thread_id && w.scope === "agent" && w.state === "active",
    );
    for (const source of previous) {
      // Preserve each former lane beneath its stable workspace identity; never merge by filename.
      // This owner-authorized upgrade preserves group data even if its former contributor left.
      if (source.root_device === null || source.root_inode === null)
        throw new DomainError("SCOPE_DENIED", 403);
      const files = new WorkspaceFiles(this.path(source), source.root_device, source.root_inode);
      const prefix = `previous/${source.id}`;
      const copy = async (path: string) => {
        let after = "";
        do {
          const page = files.list(path, after, 200);
          for (const entry of page.entries) {
            const relative = path ? `${path}/${entry.name}` : entry.name;
            if (entry.type === "directory") await copy(relative);
            else if (entry.type === "file")
              (await this.files(target.id)).create(`${prefix}/${relative}`, files.read(relative));
            else throw new DomainError("SCOPE_DENIED", 403);
          }
          after = page.next_after ?? "";
        } while (after);
      };
      await copy("");
      for (const item of await store.list("artifact")) {
        if (item.workspace_id !== source.id) continue;
        await store.put(
          {
            ...item,
            workspace_id: target.id,
            agent_id: null,
            created_by_agent_id: item.created_by_agent_id ?? item.agent_id,
            source_path: item.source_path ? `${prefix}/${item.source_path}` : null,
            revision: item.revision + 1,
            updated_at: new Date().toISOString(),
          },
          item.revision,
        );
      }
      for (const item of await store.list("attachment_document")) {
        if (item.workspace_id !== source.id) continue;
        await store.put(
          {
            ...item,
            workspace_id: target.id,
            agent_id: null,
            revision: item.revision + 1,
            updated_at: new Date().toISOString(),
          },
          item.revision,
        );
      }
      await this.revoke(source.id);
    }
  }
  async revoke(workspaceId: string) {
    const workspace = await this.lifecycle.store.get("workspace", workspaceId);
    if (workspace.state === "revoked") return workspace;
    return await this.lifecycle.store.transaction(async () => {
      const result = await this.lifecycle.store.put(
        {
          ...workspace,
          state: "revoked",
          revision: workspace.revision + 1,
          updated_at: new Date().toISOString(),
        },
        workspace.revision,
      );
      for (const run of await this.lifecycle.store.list("run"))
        if (
          run.workspace_id === workspaceId &&
          ["dispatching", "running", "cancel_requested"].includes(run.status)
        )
          await this.lifecycle.cancel(run.id);
      for (const binding of await this.lifecycle.store.list("binding"))
        if (binding.workspace_id === workspaceId && binding.active)
          await this.lifecycle.store.put(
            {
              ...binding,
              active: false,
              revision: binding.revision + 1,
              updated_at: new Date().toISOString(),
            },
            binding.revision,
          );
      return result;
    });
  }
}
