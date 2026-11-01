import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { workspaceInput } from "./contracts";
import { allowedPath, canonicalDirectory, WorkspaceFiles } from "./files";

export const within = (root: string, path: string) => {
  const rest = relative(root, path);
  return rest === "" || (!isAbsolute(rest) && rest !== ".." && !rest.startsWith("../"));
};
/** One explicit file authority per owner/agent/thread; no implicit cross-conversation sharing. */
export class Workspaces {
  readonly root: string;
  constructor(readonly lifecycle: Lifecycle) {
    this.root = realpathSync(dirname(resolve(lifecycle.store.path)));
  }
  private scope(threadId: string, agentId: string) {
    const agent = this.lifecycle.store.get("agent", agentId);
    const thread = this.lifecycle.store.get("thread", threadId);
    if (!thread.member_agent_ids.includes(agentId)) throw new DomainError("SCOPE_DENIED", 403);
    return { agent, thread };
  }
  current(threadId: string, agentId: string) {
    this.scope(threadId, agentId);
    return (
      this.lifecycle.store
        .list("workspace")
        .find((w) => w.state === "active" && w.thread_id === threadId && w.agent_id === agentId) ??
      null
    );
  }
  ensure(threadId: string, agentId: string) {
    const current = this.current(threadId, agentId);
    return current ? this.get(current.id) : this.bind({ agent_id: agentId, thread_id: threadId });
  }
  bind(input: unknown): Entity<"workspace"> {
    const data = workspaceInput.parse(input);
    return this.lifecycle.store.transaction(() => {
      this.scope(data.thread_id, data.agent_id);
      if (
        this.lifecycle.store
          .list("run")
          .some(
            (run) =>
              run.thread_id === data.thread_id &&
              run.agent_id === data.agent_id &&
              ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
          )
      )
        throw new DomainError("CONFLICT");
      const id = crypto.randomUUID();
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
          this.lifecycle.store.list("workspace").some((w) => {
            if (w.thread_id === data.thread_id && w.agent_id === data.agent_id) return false;
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
      const current = this.current(data.thread_id, data.agent_id);
      if (current) this.revoke(current.id);
      return this.lifecycle.store.put({
        ...data,
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
      });
    });
  }
  get(workspaceId: string) {
    const workspace = this.lifecycle.store.get("workspace", workspaceId);
    this.scope(workspace.thread_id, workspace.agent_id);
    if (workspace.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
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
    return workspace.project_path ?? join(this.root, "workspaces", workspace.id, "files");
  }
  temporary(workspace: Entity<"workspace">) {
    this.get(workspace.id);
    const path = join(this.root, "runtime-temporary", workspace.id);
    mkdirSync(path, { recursive: true, mode: 0o700 });
    if (lstatSync(path).isSymbolicLink() || realpathSync(path) !== path)
      throw new DomainError("SCOPE_DENIED", 403);
    return path;
  }
  files(workspaceId: string) {
    const w = this.get(workspaceId);
    return new WorkspaceFiles(this.path(w), w.root_device, w.root_inode);
  }
  authorizeRun(run: Entity<"run">) {
    if (!run.workspace_id || run.workspace_revision === null)
      throw new DomainError("SCOPE_DENIED", 403);
    const workspace = this.get(run.workspace_id);
    if (
      workspace.thread_id !== run.thread_id ||
      workspace.agent_id !== run.agent_id ||
      workspace.revision !== run.workspace_revision
    )
      throw new DomainError("STALE_DISPATCH");
    const input = this.lifecycle.store.get("message", run.input_message_id);
    for (const artifactId of input.artifact_ids) {
      const item = this.lifecycle.store.get("artifact", artifactId);
      if (
        item.workspace_id !== workspace.id ||
        item.thread_id !== run.thread_id ||
        item.agent_id !== run.agent_id
      )
        throw new DomainError("SCOPE_DENIED", 403);
    }
    return workspace;
  }
  revoke(workspaceId: string) {
    const workspace = this.lifecycle.store.get("workspace", workspaceId);
    if (workspace.state === "revoked") return workspace;
    return this.lifecycle.store.transaction(() => {
      const result = this.lifecycle.store.put(
        {
          ...workspace,
          state: "revoked",
          revision: workspace.revision + 1,
          updated_at: new Date().toISOString(),
        },
        workspace.revision,
      );
      for (const run of this.lifecycle.store.list("run"))
        if (
          run.workspace_id === workspaceId &&
          ["dispatching", "running", "cancel_requested"].includes(run.status)
        )
          this.lifecycle.cancel(run.id);
      for (const binding of this.lifecycle.store.list("binding"))
        if (binding.workspace_id === workspaceId && binding.active)
          this.lifecycle.store.put(
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
