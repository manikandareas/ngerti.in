import { useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { Schedule, ScheduleOccurrence } from "@/features/schedules/types";
import { outcomeLabels, timeLabel } from "@/features/schedules/utils/presentation";
import { TaskCard } from "@/features/tasks/components/task-card";
import type { BackgroundTask } from "@/features/tasks/types";
import { api } from "@/lib/api";

export function ScheduleHistory({
  occurrences,
  schedules = [],
}: {
  occurrences: ScheduleOccurrence[];
  schedules?: Schedule[];
}) {
  return (
    <section className="space-y-3">
      <h2 className="font-bold">Riwayat eksekusi</h2>
      {occurrences.length ? (
        occurrences.map((item) => (
          <Occurrence
            key={item.id}
            item={item}
            timezone={
              schedules.find((schedule) => schedule.id === item.schedule_id)?.spec.timezone ??
              Intl.DateTimeFormat().resolvedOptions().timeZone
            }
          />
        ))
      ) : (
        <p className="text-sm text-muted-foreground">
          Belum ada eksekusi. Jadwal aktif akan muncul di sini saat waktunya tiba.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Menampilkan 50 eksekusi terbaru. Setiap pekerjaan tetap mempunyai hasil dan penggunaan
        tersendiri.
      </p>
    </section>
  );
}

function Occurrence({ item, timezone }: { item: ScheduleOccurrence; timezone: string }) {
  const [open, setOpen] = useState(false);
  const { userId, getToken } = useAuth();
  const task = useQuery({
    queryKey: ["schedule-task", userId, item.task_id],
    queryFn: async () => api<BackgroundTask>(`/tasks/${item.task_id}`, await getToken()),
    enabled: open && Boolean(item.task_id),
    refetchInterval: open ? 4000 : false,
  });
  return (
    <article className="space-y-2 rounded-2xl border p-4 text-sm">
      <p className="font-bold wrap-anywhere">{item.title}</p>
      <p>
        {outcomeLabels[item.outcome] ?? item.outcome} ·{" "}
        {item.trigger === "manual" ? "Jalankan sekarang" : "Terjadwal"}
      </p>
      <p className="text-xs text-muted-foreground">
        {timeLabel(item.intended_at, timezone)} · versi jadwal {item.revision}
      </p>
      {item.reason || item.error ? (
        <p className="wrap-anywhere text-muted-foreground">{item.reason || item.error}</p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          search={{ thread: item.thread_id, view: "chat" }}
          className="inline-flex min-h-10 items-center underline"
        >
          Buka percakapan
        </Link>
        {item.task_id ? (
          <Button variant="outline" onClick={() => setOpen(!open)}>
            {open ? "Tutup pekerjaan" : "Buka pekerjaan & hasil"}
          </Button>
        ) : null}
      </div>
      {open ? (
        task.data ? (
          <TaskCard task={task.data} />
        ) : task.isError ? (
          <p role="alert">
            Pekerjaan belum dapat dimuat.{" "}
            <button type="button" className="underline" onClick={() => void task.refetch()}>
              Coba lagi
            </button>
          </p>
        ) : (
          <p role="status">Membuka pekerjaan…</p>
        )
      ) : null}
    </article>
  );
}
