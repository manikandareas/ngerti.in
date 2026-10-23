import { Bell, CircleCheck, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useResourceContext } from "@/features/library/components/resource-context";
import { useProactivityPreferences } from "@/features/proactivity/hooks/use-proactivity-preferences";
import { useSchedules } from "@/features/schedules/hooks/use-schedules";
import { recurrenceLabel, timeLabel } from "@/features/schedules/utils/presentation";
import { taskStage, taskStatusLabel } from "@/features/tasks/constants";
import { useTasks } from "@/features/tasks/hooks/use-tasks";
import type { WorkspaceView } from "@/features/workspace/types";

export function AssistantActivity({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const tasks = useTasks();
  const context = useResourceContext();
  const ordered = [...(tasks.data?.tasks ?? [])].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  );
  const groups = new Map<string, typeof ordered>();
  for (const task of ordered) {
    const date =
      new Date(task.updated_at).toDateString() === new Date().toDateString()
        ? "Hari ini"
        : new Date(task.updated_at).toLocaleDateString("id-ID", { dateStyle: "long" });
    groups.set(date, [...(groups.get(date) ?? []), task]);
  }
  const proactive = useProactivityPreferences();
  return (
    <section className="space-y-2">
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
        <div className="space-y-5">
          {[...groups].map(([date, items]) => (
            <section key={date}>
              <h4 className="mb-2 text-sm font-medium">{date}</h4>
              <ul className="space-y-2">
                {items.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      className="flex w-full items-start gap-3 rounded-2xl py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => context.open({ kind: "task", id: task.id })}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted/60">
                        {task.status === "succeeded" ? (
                          <CircleCheck className="size-5" />
                        ) : (
                          <Clock3 className="size-5 text-muted-foreground" />
                        )}
                      </span>
                      <span className="min-w-0 space-y-1">
                        <span className="block text-sm font-medium wrap-anywhere">
                          {task.title}
                        </span>
                        <span className="block line-clamp-2 text-sm text-muted-foreground">
                          {task.error ?? taskStage[task.stage] ?? taskStatusLabel(task)}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {new Date(task.updated_at).toLocaleTimeString("id-ID", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <p className="rounded-xl bg-muted p-5 text-sm">
          Belum ada pekerjaan. Kamu bisa meminta bantuan melalui chat kapan saja.
        </p>
      )}
      <Button variant="ghost" onClick={() => onNavigate("tasks")}>
        Buka semua Task
      </Button>
      {proactive.data?.deliveries.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">Saran proaktif terbaru</h3>
          {proactive.data.deliveries.slice(0, 5).map((d) => (
            <button
              type="button"
              key={d.candidate_id}
              onClick={() => context.open({ kind: "thread", id: d.thread_id })}
              className="block w-full rounded-lg p-2 text-left text-sm wrap-anywhere hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              {d.title ?? "Saran tersimpan"}
              <span className="mt-1 block text-xs text-muted-foreground">
                {d.thread_title} · {new Date(d.created_at).toLocaleString()}
              </span>
            </button>
          ))}
        </section>
      ) : null}
    </section>
  );
}

export function AssistantUpcoming({ onNavigate }: { onNavigate: (view: WorkspaceView) => void }) {
  const data = useSchedules();
  const context = useResourceContext();
  const upcoming =
    data.data?.schedules
      .filter((s) => s.state === "active" && s.next_due)
      .sort((a, b) => (a.next_due ?? "").localeCompare(b.next_due ?? "")) ?? [];
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">Pengingat</h3>
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
        <div className="space-y-7">
          {(["once", "recurring"] as const).map((group) => {
            const items = upcoming.filter((s) =>
              group === "once" ? s.spec.frequency === "once" : s.spec.frequency !== "once",
            );
            if (!items.length) return null;
            return (
              <section key={group}>
                <h4 className="mb-2 text-sm font-medium">
                  {group === "once" ? "Sekali" : "Rutin"}
                </h4>
                <ul className="space-y-3">
                  {items.map((s) => (
                    <li key={s.id} className="py-1">
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 rounded-2xl py-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
                        onClick={() => context.open({ kind: "schedule", id: s.id })}
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/60">
                          {s.spec.frequency === "once" ? (
                            <Bell className="size-5 text-muted-foreground" />
                          ) : (
                            <Clock3 className="size-5 text-muted-foreground" />
                          )}
                        </span>
                        <span className="min-w-0 space-y-1">
                          <span className="block text-sm font-medium wrap-anywhere">
                            {s.spec.title}
                          </span>
                          <span className="block text-sm text-muted-foreground">
                            {recurrenceLabel(s.spec)}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {timeLabel(s.next_due ?? "", s.spec.timezone)}
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl bg-muted p-5 text-sm">
          Belum ada jadwal mendatang. Minta pengingat melalui chat atau buka menu Jadwal.
        </p>
      )}
      <Button variant="ghost" onClick={() => onNavigate("schedules")}>
        Kelola jadwal
      </Button>
    </section>
  );
}
