import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { ProductResult } from "@/features/files/types";
import { useGoalCommands } from "@/features/goals/hooks/use-goals";
import { type EvidenceInput, evidenceLabels, type GoalDetail } from "@/features/goals/types";
import { taskStatus } from "@/features/tasks/constants";
import { api } from "@/lib/api";

export function GoalEvidenceForm({ goal, onClose }: { goal: GoalDetail; onClose: () => void }) {
  const command = useGoalCommands();
  const { userId, getToken } = useAuth();
  const [criterion, setCriterion] = useState("0");
  const [state, setState] = useState<EvidenceInput["state"]>("in_progress");
  const [note, setNote] = useState("");
  const [taskId, setTaskId] = useState("user_report");
  const [revision, setRevision] = useState("none");
  const task = goal.tasks.find((t) => t.id === taskId);
  const result = useQuery({
    queryKey: ["result", userId, task?.result_id],
    queryFn: async () => api<ProductResult>(`/results/${task?.result_id}`, await getToken()),
    enabled: Boolean(task?.result_id),
    retry: false,
  });
  return (
    <form
      className="space-y-4 rounded-2xl border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const evidence: EvidenceInput = {
          criterion: Number(criterion),
          state,
          note,
          ...(task ? { task_id: task.id } : {}),
          ...(task?.result_id && revision !== "none"
            ? { result_id: task.result_id, result_revision: Number(revision) }
            : {}),
        };
        void command
          .propose(goal.thread_id, "evidence", goal.id, goal.revision, undefined, evidence)
          .then((p) => {
            if (p) onClose();
          });
      }}
    >
      <h3 className="font-bold">Catat bukti kemajuan</h3>
      <div className="space-y-2">
        <label htmlFor="goal-criterion" className="text-sm">
          Kriteria
        </label>
        <Select value={criterion} onValueChange={setCriterion}>
          <SelectTrigger id="goal-criterion" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {goal.spec.criteria.map((c, i) => (
              <SelectItem key={c} value={String(i)}>
                {i + 1}. {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label htmlFor="goal-evidence-state" className="text-sm">
          Perkembangan
        </label>
        <Select value={state} onValueChange={(v) => setState(v as EvidenceInput["state"])}>
          <SelectTrigger id="goal-evidence-state" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(evidenceLabels).map(([v, label]) => (
              <SelectItem key={v} value={v}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <label htmlFor="goal-evidence-source" className="text-sm">
          Sumber bukti
        </label>
        <Select
          value={taskId}
          onValueChange={(id) => {
            setTaskId(id);
            setRevision("none");
          }}
        >
          <SelectTrigger id="goal-evidence-source" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user_report">Laporan saya sendiri</SelectItem>
            {goal.tasks
              .filter((t) => t.goal_revision === goal.plan_revision)
              .map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title} · {taskStatus[t.status as keyof typeof taskStatus] ?? t.status}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      {task?.result_id ? (
        <div className="space-y-2">
          <label htmlFor="goal-result-revision" className="text-sm">
            Revisi hasil (opsional)
          </label>
          <Select value={revision} onValueChange={setRevision}>
            <SelectTrigger id="goal-result-revision" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Gunakan status dan hasil Task</SelectItem>
              {result.data?.revisions
                .filter((r) => r.status === "ready")
                .map((r) => (
                  <SelectItem key={r.revision} value={String(r.revision)}>
                    Hasil v{r.revision}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          {result.isError ? (
            <p role="status" className="text-xs">
              Hasil tidak tersedia. Bukti Task tetap dapat ditinjau.
            </p>
          ) : null}
        </div>
      ) : null}
      <label htmlFor="goal-evidence-note" className="block space-y-2 text-sm">
        <span>Catatan yang mendukung penilaian</span>
        <Textarea
          id="goal-evidence-note"
          required
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <p className="text-xs text-muted-foreground">
        Task gagal tidak dapat menjadi bukti terpenuhi. Laporan sendiri diberi label terpisah. Bukti
        baru menggantikan penilaian kriteria saat ini; riwayat tetap tersedia.
      </p>
      <div className="flex gap-2">
        <Button disabled={command.pending || !note.trim()}>Tinjau bukti</Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Tutup
        </Button>
      </div>
      {command.error ? (
        <p role="alert" className="text-sm text-danger">
          {command.error}
        </p>
      ) : null}
    </form>
  );
}
