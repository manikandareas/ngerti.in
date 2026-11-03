import type { Goal } from "@/types/work";

export const responsibilityLabels: Record<string, string> = {
  active: "Active",
  paused: "Paused",
  stopped: "Stopped",
  completed: "Completed",
  blocked: "Blocked",
  waiting: "Waiting",
  waiting_assignment: "Awaiting assignment",
  routing: "Choosing an agent",
  queued: "Queued",
  running: "Working",
  unknown: "Outcome unknown",
  cancelled: "Stopped",
  failed: "Failed",
  ready: "Ready",
  completion_pending: "Checking results",
  succeeded: "Succeeded",
  dispatched: "Started",
  skipped: "Skipped",
};
export function goalStatus(goal: Goal): string {
  return goal.state === "active"
    ? (responsibilityLabels[goal.work_state] ?? responsibilityLabels.active)
    : responsibilityLabels[goal.state];
}
export function responsibilityTime(value: string | null, timezone?: string): string {
  return value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        ...(timezone ? { timeZone: timezone } : {}),
      }).format(new Date(value))
    : "—";
}
