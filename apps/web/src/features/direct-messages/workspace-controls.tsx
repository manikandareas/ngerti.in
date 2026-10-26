import { useAuth } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { command, submit } from "./client";
import type { Thread } from "./state";

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
  const [output, setOutput] = useState("");
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
      setOutput(JSON.stringify(result, null, 2));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Workspace belum tersedia.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">Workspace & perubahan kode</summary>
      <div className="mt-3 space-y-3 text-sm">
        <p className="text-muted-foreground">
          Pilih agent untuk melihat file, diagnostik, dan checkpoint percakapan ini.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label>
            Agent
            <select
              className="ml-2 rounded border bg-background p-2"
              value={agentId}
              disabled={busy}
              onChange={(e) => {
                setAgentId(e.target.value);
                setWorkspace(null);
                setOutput("");
                setCheckpoint("");
              }}
            >
              {thread.agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.display_name}
                </option>
              ))}
            </select>
          </label>
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
            <div className="flex flex-wrap gap-2">
              <input
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
              <select
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
              </select>
            </label>
            <input
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
                      void action({ action: item.active ? "release" : "cleanup", worktree_id: id })
                    }
                  >
                    {item.active ? "Lepas tugas" : "Bersihkan"}
                  </Button>
                </div>
              ))}
          </>
        )}
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        {output && (
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
            {output}
          </pre>
        )}
      </div>
    </details>
  );
}
