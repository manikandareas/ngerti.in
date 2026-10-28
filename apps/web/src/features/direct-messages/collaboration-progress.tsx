import { TaskRow } from "@/components/beautiful-ui/conversation";
import { Button } from "@/components/ui/button";
import type { Snapshot } from "./state";

const labels: Record<string, string> = {
  running: "Sedang bekerja",
  completed: "Selesai",
  pending: "Menunggu pekerjaan",
  submitting: "Memastikan hasil",
  review: "Menunggu pemeriksaan",
  reviewing: "Memastikan hasil pemeriksaan",
  changes_requested: "Perlu revisi",
  blocked: "Terhambat",
  cancelled: "Dihentikan",
  interrupted: "Dihentikan",
  unknown: "Hasil belum dapat dipastikan",
  error: "Gagal diselesaikan",
  failed: "Gagal diselesaikan",
  schema_invalid: "Format hasil perlu diperbaiki",
};

export function CollaborationProgress({
  snapshot,
  stopping,
  onStop,
}: {
  snapshot: Snapshot;
  stopping: string | null;
  onStop: (runId: string) => void;
}) {
  const children = snapshot.delegations ?? [];
  const tasks = snapshot.collaboration_tasks ?? [];
  if (!children.length && !tasks.length) return null;
  const nameOf = (id: string) =>
    snapshot.thread.agents.find((agent) => agent.agent_id === id)?.display_name ?? "Agent";
  return (
    <section aria-label="Pekerjaan bersama" className="min-w-0 space-y-3 border-y py-4">
      <h2 className="text-sm font-medium">Pekerjaan bersama</h2>
      {tasks.map((task) => (
        <TaskRow
          key={task.task_id}
          title={task.expected_result}
          status={`${nameOf(task.assignee_agent_id)} · ${labels[task.status] ?? task.status}`}
          state={task.status}
        >
          <div className="space-y-2 text-muted-foreground">
            {task.summary ? (
              <p className="whitespace-pre-wrap break-words">{task.summary}</p>
            ) : null}
            {task.review_summary ? (
              <p className="whitespace-pre-wrap break-words">{task.review_summary}</p>
            ) : null}
            {task.block_reason ? <p className="break-words">{task.block_reason}</p> : null}
            <p>
              Penanggung jawab: {nameOf(task.implementer_agent_id)}
              {task.reviewer_agent_id ? ` · Pemeriksa: ${nameOf(task.reviewer_agent_id)}` : ""}
            </p>
            {task.artifact_ids.length ? (
              <p>{task.artifact_ids.length} hasil tersimpan di percakapan</p>
            ) : null}
            {task.dependencies.length ? <p>{task.dependencies.length} tugas terkait</p> : null}
          </div>
        </TaskRow>
      ))}
      {children.map((child) => {
        const parent = snapshot.runs.find((run) => run.run_id === child.parent_run_id);
        const agentId = child.agent_id ?? parent?.agent_id;
        return (
          <TaskRow
            key={child.child_session_id}
            title={child.goal}
            status={`Asisten sementara ${agentId ? `untuk ${nameOf(agentId)}` : ""} · ${labels[child.status] ?? child.status}`}
            state={child.status}
          >
            <div className="space-y-2 text-muted-foreground">
              <p className="break-words">{child.model}</p>
              {child.activity && child.status === "running" ? (
                <p>Aktivitas: {child.activity}</p>
              ) : null}
              {child.artifact_ids?.length ? (
                <p>{child.artifact_ids.length} hasil tersimpan di percakapan</p>
              ) : null}
              {child.result?.api_calls != null ? (
                <p>{child.result.api_calls} permintaan model</p>
              ) : null}
              {child.result?.summary ? (
                <p className="whitespace-pre-wrap break-words">{child.result.summary}</p>
              ) : null}
              {child.result?.schema_valid === false ? (
                <p>Format hasil belum sesuai permintaan.</p>
              ) : null}
              {child.status === "running" ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={stopping !== null}
                  onClick={() => onStop(child.parent_run_id)}
                >
                  {stopping === child.parent_run_id ? "Menghentikan…" : "Hentikan pekerjaan ini"}
                </Button>
              ) : null}
            </div>
          </TaskRow>
        );
      })}
    </section>
  );
}
