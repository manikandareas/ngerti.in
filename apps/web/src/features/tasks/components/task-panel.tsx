import { useState } from "react";
import { Button } from "@/components/ui/button";
import { WorkspaceState } from "@/components/workspace-state";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import { TaskCard } from "./task-card";
import { TaskCreateForm } from "./task-create-form";

interface TaskPanelProps {
  threadId: string | null;
}

export function TaskPanel({ threadId }: TaskPanelProps) {
  const [onlyWaiting, setOnlyWaiting] = useState(false);
  const tasks = useTasks();

  const values = (tasks.data?.tasks ?? []).filter(
    (task) => !onlyWaiting || task.status === "waiting_user",
  );
  return (
    <div className="space-y-7">
      <TaskCreateForm threadId={threadId} />
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
        Menampilkan hingga 50 task, dengan pekerjaan aktif didahulukan. Kamu dapat memakai file dan
        menyimpan berkas hasil serta mengolah data dengan Python offline. Browser dan jadwal
        mengikuti kemampuan berikutnya.
      </p>
    </div>
  );
}
