import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useResourceContext } from "@/features/library/components/resource-context";
import { taskStatusLabel } from "@/features/tasks/constants";
import type { BackgroundTask } from "@/features/tasks/types";

export function TaskInline({ task }: { task: BackgroundTask }) {
  const context = useResourceContext();
  return (
    <button
      type="button"
      className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
      onClick={() => context.open({ kind: "task", id: task.id })}
      aria-label={`${task.title}: ${taskStatusLabel(task)}. Buka detail pekerjaan`}
    >
      {task.status === "running" ? (
        <LoaderCircle className="size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{task.title}</span>
        {taskStatusLabel(task)}
      </span>
      <ArrowUpRight className="size-4 shrink-0" />
    </button>
  );
}
