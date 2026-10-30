import { useAuth } from "@clerk/tanstack-react-start";
import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { command, submit } from "./client";
import { ResourcePanel } from "./resource-panel";
import type { Thread } from "./state";
import { WorkspaceResult } from "./workspace-result";

type Workspace = {
  project?: string;
  root?: string;
  hashes?: Record<string, string>;
  checkpoints?: { hash: string; short_hash: string; reason: string }[];
  worktrees?: Record<string, { path: string; active: boolean; removed?: boolean }>;
  instructions?: { path: string; content: string }[];
  error?: string;
};

export function WorkspaceControls({ thread, working }: { thread: Thread; working: boolean }) {
  const { getToken } = useAuth();
  const [agentId, setAgentId] = useState(thread.agents[0]?.agent_id ?? "");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [project, setProject] = useState("");
  const [checkpoint, setCheckpoint] = useState("");
  const [path, setPath] = useState("");
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function action(arguments_: object, inspect = false) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await submit<Workspace>(
        command("workspace.action", {
          thread_id: thread.thread_id,
          agent_id: agentId,
          arguments: arguments_,
        }),
        await getToken(),
      );
      if (result.error) throw new Error(result.error);
      if (inspect) setWorkspace(result);
      else if (workspace && !("error" in result)) {
        const refreshed = await submit<Workspace>(
          command("workspace.action", {
            thread_id: thread.thread_id,
            agent_id: agentId,
            arguments: { action: "inspect" },
          }),
          await getToken(),
        );
        if (!refreshed.error) setWorkspace(refreshed);
      }
      setOutput(inspect ? null : result);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace belum tersedia.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <ResourcePanel
      title="Workspace"
      icon={<FolderOpen className="size-4" />}
      description="File, proyek, dan perubahan kode dalam percakapan ini."
    >
      <div className="space-y-4 text-sm" aria-busy={busy}>
        {busy && <p role="status">Memuat workspace…</p>}
        <div className="flex flex-wrap items-end gap-2">
          {thread.kind === "group" && (
            <label>
              Agent
              <NativeSelect
                className="ml-2 rounded border bg-background p-2"
                value={agentId}
                disabled={busy}
                onChange={(e) => {
                  setAgentId(e.target.value);
                  setWorkspace(null);
                  setOutput(null);
                  setCheckpoint("");
                }}
              >
                {thread.agents.map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.display_name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !agentId}
            onClick={() => void action({ action: "inspect" }, true)}
          >
            Periksa workspace
          </Button>
        </div>
        {workspace && (
          <>
            <p className="break-all">
              {workspace.project} · {workspace.root}
            </p>
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm font-medium">
                Proyek dan checkpoint
              </summary>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="Nama proyek"
                  className="min-w-0 rounded border bg-background p-2"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="Nama proyek"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || working || !project.trim()}
                  onClick={() => void action({ action: "project", project, folders: ["."] }, true)}
                >
                  Buka proyek
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || working}
                  onClick={() => void action({ action: "checkpoint" })}
                >
                  Simpan checkpoint
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || working}
                  onClick={() => void action({ action: "worktree" })}
                >
                  Buat worktree
                </Button>
              </div>
              <label className="block">
                Checkpoint
                <NativeSelect
                  className="ml-2 max-w-full rounded border bg-background p-2"
                  value={checkpoint}
                  onChange={(e) => setCheckpoint(e.target.value)}
                >
                  <option value="">Pilih checkpoint</option>
                  {workspace.checkpoints?.map((c) => (
                    <option key={c.hash} value={c.hash}>
                      {c.short_hash} · {c.reason}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            </details>
            {Object.keys(workspace.hashes ?? {}).length > 0 && (
              <div className="space-y-1">
                <h3 className="font-medium">File proyek</h3>
                {Object.keys(workspace.hashes ?? {}).map((file) => (
                  <Button
                    key={file}
                    variant={path === file ? "secondary" : "ghost"}
                    className="h-auto w-full justify-start whitespace-normal break-all text-left"
                    onClick={() => setPath(file)}
                  >
                    {file}
                  </Button>
                ))}
              </div>
            )}
            <details className="space-y-3">
              <summary className="cursor-pointer text-sm font-medium">Perubahan kode</summary>
              <Input
                aria-label="Path file workspace"
                className="w-full rounded border bg-background p-2"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="Path file, misalnya src/main.py"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !path}
                  onClick={() => void action({ action: "diagnostics", path })}
                >
                  Diagnostik
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || !checkpoint}
                  onClick={() => void action({ action: "diff", checkpoint })}
                >
                  Lihat diff
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={busy || working || !checkpoint || !workspace.hashes}
                  onClick={() =>
                    void action({
                      action: "restore",
                      checkpoint,
                      ...(path ? { path } : {}),
                      expected_hashes: workspace.hashes,
                    })
                  }
                >
                  {path ? "Pulihkan file terpilih" : "Pulihkan perubahan agent"}
                </Button>
              </div>
              {Object.entries(workspace.worktrees ?? {})
                .filter(([, item]) => !item.removed)
                .map(([id, item]) => (
                  <div key={id} className="flex flex-wrap items-center gap-2">
                    <span className="break-all">
                      {item.path} · {item.active ? "aktif" : "dilepas"}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={busy || working}
                      onClick={() =>
                        void action({
                          action: item.active ? "release" : "cleanup",
                          worktree_id: id,
                        })
                      }
                    >
                      {item.active ? "Lepas tugas" : "Bersihkan"}
                    </Button>
                  </div>
                ))}
            </details>
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive-foreground">
            {error}
          </p>
        )}
        {workspace && (
          <details className="rounded-xl border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              Detail workspace dan petunjuk proyek
            </summary>
            <div className="mt-3">
              <WorkspaceResult value={workspace} />
            </div>
          </details>
        )}
        {output && (
          <section aria-label="Hasil operasi workspace" className="rounded-xl bg-muted/50 p-4">
            <h3 className="mb-3 font-medium">Hasil operasi</h3>
            <WorkspaceResult value={output} />
          </section>
        )}
      </div>
    </ResourcePanel>
  );
}
