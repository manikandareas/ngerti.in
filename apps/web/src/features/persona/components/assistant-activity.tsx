import { Button } from "@/components/ui/button";
import { useSchedules } from "@/features/schedules/hooks/use-schedules";
import { recurrenceLabel, timeLabel } from "@/features/schedules/utils/presentation";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import type { WorkspaceView } from "@/features/workspace/types";

export function AssistantActivity({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const tasks = useTasks();
  const labels = {
    queued: "Mengantre",
    running: "Sedang dikerjakan",
    waiting_user: "Menunggu keputusanmu",
    succeeded: "Selesai",
    failed: "Terhenti",
    cancelled: "Dibatalkan",
  };
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-xl font-bold">Aktivitas</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Pekerjaan dan keputusan yang sedang berlangsung.
        </p>
      </div>
      {tasks.isPending ? (
        <p role="status">Memuat aktivitas…</p>
      ) : tasks.isError ? (
        <div role="alert">
          <p>Aktivitas belum dapat dimuat.</p>
          <Button variant="outline" onClick={() => void tasks.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : tasks.data?.tasks.length ? (
        <ul className="divide-y border-y">
          {tasks.data.tasks.slice(0, 8).map((task) => (
            <li key={task.id} className="space-y-1 py-4">
              <p className="text-sm font-medium wrap-anywhere">{task.title}</p>
              <p className="text-xs text-muted-foreground">{labels[task.status]}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted p-5 text-sm">
          Belum ada pekerjaan. Kamu bisa meminta bantuan melalui chat kapan saja.
        </p>
      )}
      <Button variant="outline" onClick={() => onNavigate("tasks")}>
        Buka semua Task
      </Button>
    </section>
  );
}

export function AssistantUpcoming({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const data = useSchedules();
  const upcoming =
    data.data?.schedules
      .filter((s) => s.state === "active" && s.next_due)
      .sort((a, b) => (a.next_due ?? "").localeCompare(b.next_due ?? "")) ?? [];
  return (
    <section className="space-y-5">
      <div>
        <h3 className="text-xl font-bold">Mendatang</h3>
        <p className="mt-1 text-sm text-muted-foreground">Pekerjaan yang sudah kamu jadwalkan.</p>
      </div>
      {data.isPending ? (
        <p role="status">Memuat jadwal…</p>
      ) : data.isError ? (
        <div role="alert">
          <p>Jadwal belum dapat dimuat.</p>
          <Button variant="outline" onClick={() => void data.refetch()}>
            Coba lagi
          </Button>
        </div>
      ) : upcoming.length ? (
        <ul className="divide-y border-y">
          {upcoming.slice(0, 8).map((s) => (
            <li key={s.id} className="space-y-1 py-4">
              <p className="text-sm font-medium wrap-anywhere">{s.spec.title}</p>
              <p className="text-sm">{timeLabel(s.next_due ?? "", s.spec.timezone)}</p>
              <p className="text-xs text-muted-foreground">{recurrenceLabel(s.spec)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl bg-muted p-5 text-sm">
          Belum ada jadwal mendatang. Minta pengingat melalui chat atau buka menu Jadwal.
        </p>
      )}
      <Button variant="outline" onClick={() => onNavigate("schedules")}>
        Kelola jadwal
      </Button>
    </section>
  );
}
