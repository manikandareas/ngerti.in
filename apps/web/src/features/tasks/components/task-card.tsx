import { Check, ChevronDown, ListTodo, Pencil, RefreshCw, Square, X } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useExpired } from "@/features/chat/hooks/use-expired";
import { ComputerPanel } from "@/features/computer/components/computer-panel";
import { FileDraft } from "@/features/files/components/file-draft";
import { ResultCard } from "@/features/files/components/result-card";
import { TaskInputs } from "@/features/files/components/task-inputs";
import { taskStage, taskStatusLabel } from "@/features/tasks/constants";
import { useTaskCommands } from "@/features/tasks/hooks/use-task-commands";
import { useTaskEditor } from "@/features/tasks/hooks/use-task-editor";
import type { BackgroundTask } from "@/features/tasks/types";
import { TaskDraftForm } from "./task-draft-form";

interface TaskCardProps {
  task: BackgroundTask;
  showResult?: boolean;
}

export function TaskCard({ task, showResult = true }: TaskCardProps) {
  const [open, setOpen] = useState(false);
  const editor = useTaskEditor(task);
  const { editing, draft } = editor;
  const { command, pending, error } = useTaskCommands(task);
  const active = task.status === "queued" || task.status === "running";
  const waiting = task.status === "waiting_user";
  const recoveryBlocked = ["upgrade_required", "restore_required"].includes(task.stage);
  const unknown =
    task.stage === "unknown" ||
    task.stage === "sandbox_unknown" ||
    task.stage === "computer_unknown" ||
    task.stage === "computer_unknown_resolved";
  const canReview = waiting && task.action?.status === "proposed" && !unknown && !recoveryBlocked;
  const expired = useExpired(task.action?.expires_at ?? "");
  const canEdit =
    ["waiting_user", "failed", "cancelled"].includes(task.status) &&
    !unknown &&
    !recoveryBlocked &&
    (task.runtime_kind !== "browser" || task.stage === "review" || task.stage === "draft_ready");
  const percent = Math.min(100, Math.round((task.usage_units / task.budget_cap) * 100));

  return (
    <article
      className="min-w-0 rounded-2xl border bg-card p-4 [&_button]:min-h-11 min-[701px]:p-5 min-[701px]:[&_button]:min-h-8"
      aria-label={`Task: ${task.title}`}
    >
      <div className="flex items-start gap-3">
        <ListTodo className="mt-1 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{taskStatusLabel(task)}</Badge>
          </div>
          <h3 className="text-sm leading-relaxed wrap-anywhere">{task.title}</h3>
          {task.goal_id ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Pekerjaan tujuan · target v{task.goal_revision}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {task.error ?? taskStage[task.stage] ?? "Draft dan progresmu tersimpan."}
          </p>
        </div>
      </div>
      {showResult && task.result_id && task.status === "succeeded" ? (
        <div className="mt-4">
          <ResultCard resultId={task.result_id} />
        </div>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {task.runtime_kind === "browser" ? <ComputerPanel task={task} /> : null}
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <ChevronDown className={open ? "rotate-180" : ""} />
          {open ? "Tutup detail" : canReview ? "Tinjau draft" : "Lihat detail"}
        </Button>
        {(active || waiting) && !unknown ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => void command("cancel")}
          >
            <Square /> Hentikan task
          </Button>
        ) : null}
        {(task.status === "failed" || task.status === "cancelled") &&
        !unknown &&
        !recoveryBlocked &&
        !["rejected", "expired"].includes(task.stage) ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void command("retry")}
          >
            <RefreshCw /> Coba lagi
          </Button>
        ) : null}
        {unknown ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => void command("reconcile")}
          >
            <RefreshCw /> Periksa outcome
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="mt-5 space-y-4 border-t pt-4">
          <p className="text-sm whitespace-pre-wrap wrap-anywhere">
            <strong>Instruksi saat dibuat:</strong> {task.instruction}
          </p>
          <TaskInputs task={task} />
          {task.runtime_kind === "code" ? (
            <p className="text-xs text-muted-foreground">
              Pengolahan Python tanpa akses internet.{" "}
              {task.sandbox_sessions?.some((session) => session.state !== "deleted")
                ? "Resource komputasi aktif atau masih dibersihkan."
                : task.sandbox_sessions?.length
                  ? "Resource komputasi telah dibersihkan; berkas hasil tetap tersimpan."
                  : "Resource belum dibuat."}
            </p>
          ) : null}
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer py-2">
              Detail eksekusi · versi {task.revision}
            </summary>
            <p>
              {task.budget_policy?.unit === "metered_browser_work" ? (
                "Pemakaian browser dicatat terpisah dari batas langkah dan waktu."
              ) : (
                <>
                  Batas kerja task: {percent}% terpakai atau dicadangkan untuk panggilan yang belum
                  terkonfirmasi. Percobaan {task.attempt}. Penggunaan provider yang belum pasti
                  tetap diperhitungkan.
                </>
              )}
            </p>
          </details>
          <p className="text-xs text-muted-foreground">
            {task.review_required
              ? "Review diperlukan sebelum finalisasi."
              : "Hasil akan difinalisasi sesuai permintaan awal."}{" "}
            Pesan chat baru tidak mengubah instruksi task ini.
          </p>
          {editing ? (
            <TaskDraftForm
              taskId={task.id}
              draft={draft}
              pending={pending}
              structured={Boolean(task.output_spec?.length)}
              onChange={editor.updateDraft}
              onCancel={editor.cancelEdit}
              onSave={() => {
                void command("revise", draft).then((saved) => {
                  if (saved) editor.finishEdit();
                });
              }}
            />
          ) : (
            <>
              <h4 className="text-sm font-bold">
                {task.status === "succeeded" ? "Hasil" : "Draft · belum difinalisasi"}
              </h4>
              {task.output_spec?.length ? (
                <FileDraft value={task.draft} taskId={task.id} />
              ) : task.draft || task.result ? (
                <div className="max-h-[55svh] overflow-auto rounded-xl bg-background p-4 text-sm leading-relaxed wrap-anywhere [&_pre]:overflow-auto">
                  <Streamdown mode="static">{task.result ?? task.draft}</Streamdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Draft akan muncul saat mulai diterima.
                </p>
              )}
              {canReview ? (
                <div className="space-y-3 rounded-xl bg-secondary p-4">
                  <p className="text-sm">
                    Finalisasi <strong>draft versi {task.revision}</strong> di atas dan simpan
                    hasilnya ke percakapan asal.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {expired
                      ? "Proposal kedaluwarsa. Simpan versi baru untuk meninjaunya lagi."
                      : `Berlaku sampai ${new Date(task.action?.expires_at ?? "").toLocaleString("id-ID")}. Kamu boleh menunda dengan menutup detail ini.`}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={pending || expired}
                      onClick={() => void command("approve")}
                    >
                      <Check /> Setujui finalisasi
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => void command("reject")}
                    >
                      <X /> Tolak draft
                    </Button>
                  </div>
                </div>
              ) : null}
              {canEdit && task.draft ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={editor.beginEdit}>
                  <Pencil /> Ubah draft
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </article>
  );
}
