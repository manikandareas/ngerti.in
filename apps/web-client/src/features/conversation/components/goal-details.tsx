import { Clock01Icon, File02Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { responsibilityTime } from "@/features/conversation/lib/responsibility-format";
import { routineName } from "@/features/conversation/lib/routine-name";
import { routineSchedule } from "@/features/conversation/lib/routine-schedule";
import type { Goal } from "@/types/work";
import type { Snapshot } from "@/types/workspace";

type GoalDetailsProps = {
  goal: Goal;
  snapshot: Snapshot;
  openFile: (id: string) => void;
};

export function GoalDetails({ goal, snapshot, openFile }: GoalDetailsProps) {
  const goalRuns = snapshot.runs.filter((run) => run.goal_id === goal.id);
  const runIds = new Set(goalRuns.map((run) => run.id));
  const results = snapshot.artifacts.filter(
    (artifact) =>
      artifact.origin === "native_output" &&
      (goal.evidence_artifact_ids.includes(artifact.id) || runIds.has(artifact.run_id ?? "")),
  );
  const relatedRoutines = snapshot.routines.filter((routine) => routine.goal_id === goal.id);
  const activity = [
    ...snapshot.timeline.parts
      .filter((part) => part.resource_id === goal.id && part.kind !== "message")
      .map((part) => ({
        id: part.id,
        name: part.name,
        summary: part.summary,
        at: part.created_at,
      })),
    ...snapshot.messages
      .filter(
        (message) => message.author === "agent" && message.text && runIds.has(message.run_id ?? ""),
      )
      .map((message) => ({
        id: message.id,
        name: "Progress update",
        summary: message.text,
        at: message.created_at,
      })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <div className="mt-6 space-y-7">
      {goal.progress && (
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
          {goal.progress}
        </p>
      )}
      {(results.length > 0 || relatedRoutines.length > 0) && (
        <section
          aria-label="Goal results"
          className="overflow-hidden rounded-2xl border bg-background/60"
        >
          <h3 className="border-b border-dashed px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Files and routines
          </h3>
          {results.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              onClick={() => openFile(artifact.id)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-link/10 text-link">
                <HugeiconsIcon icon={File02Icon} size={21} />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{artifact.name}</span>
                <span className="mt-1 block text-xs text-muted-foreground">File</span>
              </span>
            </button>
          ))}
          {relatedRoutines.map((r) => (
            <div key={r.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-link/10 text-link">
                <HugeiconsIcon icon={Clock01Icon} size={21} />
              </span>
              <span className="min-w-0">
                <span className="block break-words text-sm font-medium">{routineName(r)}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {routineSchedule(r)}
                </span>
              </span>
            </div>
          ))}
        </section>
      )}
      <section aria-label="Goal activity">
        <h3 className="mb-5 text-base font-semibold">Activity</h3>
        {activity.length ? (
          <ol>
            {activity.map((part) => (
              <li key={part.id} className="relative flex gap-3 pb-6 last:pb-0">
                <span
                  className="absolute bottom-0 left-2 top-5 border-l border-dashed border-border"
                  aria-hidden="true"
                />
                <span className="relative mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-muted-foreground text-muted-foreground">
                  <HugeiconsIcon icon={Tick02Icon} size={11} />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{part.name}</p>
                  <time className="mt-1 block text-xs text-muted-foreground">
                    {responsibilityTime(part.at)}
                  </time>
                  {part.summary && (
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
                      {part.summary}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        )}
      </section>
    </div>
  );
}
