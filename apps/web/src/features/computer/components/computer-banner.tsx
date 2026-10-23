import { ComputerPanel } from "@/features/computer/components/computer-panel";
import { taskStage } from "@/features/tasks/constants";
import type { BackgroundTask } from "@/features/tasks/types";

export function ComputerBanner({ tasks }: { tasks: BackgroundTask[] }) {
  const relevant = tasks.filter(
    (task) =>
      task.runtime_kind === "browser" &&
      ["queued", "running", "waiting_user"].includes(task.status),
  );
  if (!relevant.length) return null;
  return (
    <section
      aria-label="Aktivitas komputer"
      className="mx-auto w-full max-w-[816px] space-y-2 px-4 py-2"
    >
      {relevant.map((task) => (
        <div
          key={task.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{task.title}</p>
            <p className="text-xs text-muted-foreground">
              {taskStage[task.stage] ?? "Pekerjaan browser sedang berlangsung."}
            </p>
          </div>
          <ComputerPanel task={task} />
        </div>
      ))}
    </section>
  );
}
