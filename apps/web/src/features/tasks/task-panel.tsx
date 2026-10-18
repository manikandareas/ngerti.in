import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { WorkspaceState } from "@/features/workspace/workspace-state";
import { api } from "@/lib/api";
import { TaskCard } from "./task-card";
import type { TaskList } from "./types";
import { useTaskDraft } from "./use-task-draft";

export function TaskPanel({ threadId }: { threadId: string | null }) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const storageKey = `task-draft:${userId}:${threadId}`;
  const form = useTaskDraft(storageKey);
  const { instruction, review } = form;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const tasks = useQuery({
    queryKey: ["tasks", userId],
    queryFn: async () => api<TaskList>("/tasks", await getToken()),
    enabled: Boolean(userId),
    refetchInterval: 2500,
  });

  async function create() {
    if (!threadId || sending || !instruction.trim()) return;
    setSending(true);
    setError("");
    try {
      await api("/tasks", await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: threadId,
          instruction,
          review_required: review,
          request_key: form.requestKey,
        }),
      });
      form.clear();
      void queryClient.invalidateQueries({ queryKey: ["tasks", userId] });
      void queryClient.invalidateQueries({ queryKey: ["quotas", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Task belum tersimpan.");
    } finally {
      setSending(false);
    }
  }

  const values = (tasks.data?.tasks ?? []).filter(
    (task) => !onlyWaiting || task.status === "waiting_user",
  );
  return (
    <div className="space-y-7">
      <form
        className="space-y-4 rounded-2xl border bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <label htmlFor="task-instruction" className="block text-sm font-bold">
          Titipkan pekerjaan teks
        </label>
        <Textarea
          id="task-instruction"
          placeholder="Contoh: susun rencana peluncuran dari diskusi di percakapan ini…"
          value={instruction}
          disabled={sending}
          maxLength={6000}
          className="min-h-28"
          onChange={(event) => {
            const value = event.target.value;
            form.update(value, review);
          }}
        />
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={review}
            disabled={sending}
            onChange={(event) => form.update(instruction, event.target.checked)}
            className="mt-1 size-4 accent-primary"
          />
          Minta review sebelum hasil difinalisasi
        </label>
        <p className="text-xs text-muted-foreground">
          Menggunakan konteks percakapan yang sedang dipilih. Membuat task memakai 1 pesan; review,
          stop dan mencoba ulang task tidak menambah pesan. Pekerjaan dibatasi budget dan tetap
          berjalan saat browser ditutup.
        </p>
        <Button type="submit" disabled={sending || !threadId || !instruction.trim()}>
          {sending ? "Menyimpan task…" : "Mulai task"}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        ) : null}
      </form>
      {tasks.data ? (
        <p className="text-sm text-muted-foreground">
          Batas kerja hari ini:{" "}
          {Math.max(
            0,
            Math.round(
              (1 -
                (tasks.data.budget.used + tasks.data.budget.reserved) /
                  tasks.data.budget.policy.account_daily_cap) *
                100,
            ),
          )}
          % tersedia. Sebagian dicadangkan untuk task yang belum selesai. Reset harian mengikuti
          UTC.
        </p>
      ) : null}
      <Button
        type="button"
        variant="outline"
        aria-pressed={onlyWaiting}
        onClick={() => setOnlyWaiting(!onlyWaiting)}
      >
        {onlyWaiting ? "Tampilkan semua task" : "Perlu keputusan saja"}
      </Button>
      {tasks.isError && tasks.data ? (
        <p role="alert" className="text-sm text-danger">
          Sinkronisasi task terganggu. Hasil terakhir tetap ditampilkan.{" "}
          <button type="button" className="underline" onClick={() => void tasks.refetch()}>
            Coba lagi
          </button>
        </p>
      ) : null}
      {tasks.isPending ? (
        <WorkspaceState kind="loading" title="Membuka task…" />
      ) : tasks.isError && !tasks.data ? (
        <WorkspaceState
          kind="error"
          title="Task belum dapat dimuat"
          onRetry={() => void tasks.refetch()}
        />
      ) : values.length ? (
        <div className="space-y-4">
          {values.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
        </div>
      ) : (
        <WorkspaceState
          kind="empty"
          title={onlyWaiting ? "Tidak ada keputusan yang menunggu" : "Belum ada task"}
          description="Titipkan pekerjaan di atas atau minta Gwen mengerjakannya di background lewat chat."
        />
      )}
      <p className="text-xs text-muted-foreground">
        Menampilkan hingga 50 task, dengan pekerjaan aktif didahulukan. Pekerjaan teks tersedia;
        file, web, kode dan jadwal mengikuti kemampuan berikutnya.
      </p>
    </div>
  );
}
