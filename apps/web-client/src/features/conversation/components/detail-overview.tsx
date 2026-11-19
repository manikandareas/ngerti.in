import { Clock01Icon, FavouriteIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { goalStatus } from "@/features/conversation/lib/responsibility-format";
import { routineName } from "@/features/conversation/lib/routine-name";
import { routineSchedule } from "@/features/conversation/lib/routine-schedule";
import type { Goal } from "@/types/work";
import type { Snapshot } from "@/types/workspace";
import { NativeProgressDetails } from "./native-progress-details";
import { PanelHelp } from "./panel-help";
import { WorkspaceProject } from "./workspace-project";

const goalStates: Goal["state"][] = ["active", "paused", "completed", "stopped"];
const rowClassName =
  "-mx-3 flex w-[calc(100%+1.5rem)] min-w-0 items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-menu-hover focus-visible:outline-2 focus-visible:outline-ring";

export function DetailOverview({
  snapshot,
  open,
  compose,
  refresh,
}: {
  snapshot: Snapshot;
  open: (section: "goals" | "routine", id: string) => void;
  compose: (text: string) => void;
  refresh: () => Promise<unknown>;
}) {
  const routines = [...snapshot.routines].sort(
    (a, b) => Number(b.state === "active") - Number(a.state === "active"),
  );
  const progressRun = snapshot.runs.findLast((run) => run.native_progress);
  const progressAgent = snapshot.agents.find((agent) => agent.id === progressRun?.agent_id);
  return (
    <div className="space-y-7 pt-5" data-detail-overview="">
      <NativeProgressDetails
        progress={progressRun?.native_progress}
        agentName={progressAgent?.name ?? "Agent"}
        compose={snapshot.thread.type === "dm" ? compose : undefined}
      />
      <WorkspaceProject key={snapshot.thread.id} snapshot={snapshot} refresh={refresh} />
      <section aria-label="Goals">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold">Goals</h3>
          <PanelHelp topic="Goals" />
        </div>
        {!snapshot.goals.length && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No goals yet. Tell your agent what you want to work on.
          </p>
        )}
        {goalStates.map((state) => {
          const items = snapshot.goals.filter((goal) => goal.state === state);
          return (
            items.length > 0 && (
              <div key={state} className="mb-3 last:mb-0">
                {items.map((goal) => (
                  <button
                    key={goal.id}
                    type="button"
                    data-panel-nav={`goal:${goal.id}`}
                    aria-label={goal.title}
                    onClick={() => open("goals", goal.id)}
                    className={rowClassName}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1 grid size-4 shrink-0 place-items-center rounded-[4px] border-[1.5px] border-muted-foreground/70"
                    >
                      {state === "completed" && <HugeiconsIcon icon={Tick02Icon} size={12} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-[14px] font-medium leading-5">
                        {goal.title}
                      </span>
                      <span className="mt-1 line-clamp-2 break-words text-[13px] leading-5 text-muted-foreground">
                        {goal.progress || (goal.state === "completed" ? "" : goalStatus(goal))}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )
          );
        })}
      </section>
      <section aria-label="Routine">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[16px] font-semibold">Routine</h3>
          <PanelHelp topic="Routine" />
        </div>
        {!routines.length && (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No routines yet. Ask your agent to schedule a task.
          </p>
        )}
        {routines.map((routine) => (
          <button
            key={routine.id}
            type="button"
            data-panel-nav={`routine:${routine.id}`}
            aria-label={routineName(routine)}
            onClick={() => open("routine", routine.id)}
            className={rowClassName}
          >
            <span
              aria-hidden="true"
              className={`mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-foreground/[0.06] ${routine.schedule.type === "heartbeat" ? "text-destructive" : "text-muted-foreground"}`}
            >
              <HugeiconsIcon
                icon={routine.schedule.type === "heartbeat" ? FavouriteIcon : Clock01Icon}
                size={20}
                strokeWidth={1.5}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block break-words text-[14px] font-medium leading-5">
                {routineName(routine)}
              </span>
              <span className="mt-1 block break-words text-[13px] leading-5 text-muted-foreground">
                {routine.state !== "active"
                  ? `${routine.state.charAt(0).toUpperCase()}${routine.state.slice(1)} · `
                  : ""}
                {routineSchedule(routine)}
              </span>
            </span>
          </button>
        ))}
      </section>
    </div>
  );
}
