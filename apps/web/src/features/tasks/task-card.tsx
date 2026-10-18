import { Check, ChevronDown, ListTodo, Pencil, RefreshCw, Square, X } from "lucide-react";
import { useState } from "react";
import { Streamdown } from "streamdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type BackgroundTask, taskStage, taskStatus } from "./types";
import { useTaskCommands } from "./use-task-commands";

export function TaskCard({ task }: { task: BackgroundTask }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editKey = `task-edit:${task.id}:${task.revision}`;
  const { command, pending, error } = useTaskCommands(task);
  const active = task.status === "queued" || task.status === "running";
  const waiting = task.status === "waiting_user";
  const unknown = task.stage === "unknown";
  const canReview = waiting && task.action?.status === "proposed" && !unknown;
  const expired = task.action ? Date.parse(task.action.expires_at) <= Date.now() : false;
  const canEdit = ["waiting_user", "failed", "cancelled"].includes(task.status) && !unknown;
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
            <Badge variant="secondary">{taskStatus[task.status]}</Badge>
            <span className="text-xs text-muted-foreground">Versi {task.revision}</span>
          </div>
          <h3 className="text-sm leading-relaxed wrap-anywhere">{task.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground" role="status">
            {taskStage[task.stage] ?? task.error ?? "Draft dan progresmu tersimpan."}
          </p>
        </div>
      </div>
      {task.error ? (
        <p className="mt-3 text-sm text-danger" role="status">
          {task.error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
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
          <p className="text-xs text-muted-foreground">
            Batas kerja task: {percent}% terpakai atau dicadangkan untuk panggilan yang belum
            terkonfirmasi. Percobaan {task.attempt}. Penggunaan provider yang belum pasti tetap
            diperhitungkan.
          </p>
          <p className="text-xs text-muted-foreground">
            {task.review_required
              ? "Review diperlukan sebelum finalisasi."
              : "Hasil akan difinalisasi sesuai permintaan awal."}{" "}
            Pesan chat baru tidak mengubah instruksi task ini.
          </p>
          {editing ? (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void command("revise", draft).then((saved) => {
                  if (saved) {
                    setEditing(false);
                    try {
                      sessionStorage.removeItem(editKey);
                    } catch {
                      /* Storage is optional. */
                    }
                  }
                });
              }}
              className="space-y-3"
            >
              <label className="block text-sm font-bold" htmlFor={`draft-${task.id}`}>
                Ubah isi draft
              </label>
              <Textarea
                id={`draft-${task.id}`}
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  try {
                    sessionStorage.setItem(editKey, event.target.value);
                  } catch {
                    /* Storage is optional. */
                  }
                }}
                maxLength={24000}
                className="min-h-64"
              />
              <p className="text-xs text-muted-foreground">
                Menyimpan perubahan membuat versi baru. Persetujuan versi sebelumnya tidak berlaku.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={pending || !draft.trim()}>
                  Simpan versi baru
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
                  Batal edit
                </Button>
              </div>
            </form>
          ) : (
            <>
              <h4 className="text-sm font-bold">
                {task.status === "succeeded" ? "Hasil" : "Draft · belum difinalisasi"}
              </h4>
              {task.draft || task.result ? (
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
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    try {
                      setDraft(sessionStorage.getItem(editKey) ?? task.draft);
                    } catch {
                      setDraft(task.draft);
                    }
                    setEditing(true);
                  }}
                >
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
