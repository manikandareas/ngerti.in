import { Button } from "@/components/ui/button";
import {
  responsibilityLabels,
  responsibilityTime,
} from "@/features/conversation/lib/responsibility-format";
import { routineName } from "@/features/conversation/lib/routine-name";
import { cn } from "@/lib/utils";
import type { Routine } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

type RoutineDetailsProps = {
  routine: Routine;
  snapshot: Snapshot;
  openGoal: (id: string) => void;
  viewSource: () => void;
};

export function RoutineDetails({ routine, snapshot, openGoal, viewSource }: RoutineDetailsProps) {
  const title = routineName(routine);
  const relatedGoalId = routine.goal_id;
  const runs = new Map(snapshot.runs.map((run) => [run.id, run]));
  const occurrences = snapshot.occurrences
    .filter((occurrence) => occurrence.routine_id === routine.id)
    .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
  return (
    <div className="mt-6 space-y-5">
      {routine.instruction !== title && (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {routine.instruction}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {routine.timezone}
        {routine.next_run_at
          ? ` · Next run: ${responsibilityTime(routine.next_run_at, routine.timezone)}`
          : ""}
      </p>
      <details open>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Run history
        </summary>
        <ol className="mt-3 space-y-1">
          {occurrences.map((occurrence) => {
            const run = runs.get(occurrence.run_id ?? "");
            const status = run?.status ?? occurrence.state;
            return (
              <li key={occurrence.id} className="flex items-start gap-2.5 py-2 text-[13px]">
                <span
                  aria-hidden="true"
                  className={cn("mt-1.5 size-2 shrink-0 rounded-full", {
                    "bg-success-foreground": status === "succeeded" || status === "completed",
                    "bg-destructive": status === "failed",
                    "bg-muted-foreground": !["succeeded", "completed", "failed"].includes(status),
                  })}
                />
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {responsibilityLabels[status] ?? status} · scheduled
                </span>
                <time className="max-w-[45%] text-right text-xs leading-5 text-muted-foreground">
                  {responsibilityTime(occurrence.scheduled_for, routine.timezone)}
                </time>
              </li>
            );
          })}
        </ol>
        {!occurrences.length && <p className="py-5 text-sm text-muted-foreground">No runs yet.</p>}
      </details>
      {relatedGoalId && (
        <Button
          variant="link"
          className="h-auto whitespace-normal p-0 text-left"
          onClick={() => openGoal(relatedGoalId)}
        >
          Related goal:{" "}
          {snapshot.goals.find((goal) => goal.id === relatedGoalId)?.title ?? "View goal"}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={viewSource}>
        View conversation
      </Button>
    </div>
  );
}
