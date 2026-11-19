import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  responsibilityLabels,
  responsibilityTime,
} from "@/features/conversation/lib/responsibility-format";
import { routineName } from "@/features/conversation/lib/routine-name";
import { ApiError, durableCommand } from "@/lib/api-client";
import { scopedStorageKey } from "@/lib/client-scope";
import { cn } from "@/lib/utils";
import type { Routine } from "@/types/work";
import type { Snapshot } from "@/types/workspace";
import { RoutineDelivery } from "./routine-delivery";

type RoutineDetailsProps = {
  routine: Routine;
  snapshot: Snapshot;
  openFile: (id: string) => void;
  openGoal: (id: string) => void;
  viewSource: () => void;
  refresh: () => Promise<unknown>;
};

const unsettled = new Set([
  "pending",
  "routing",
  "queued",
  "dispatching",
  "running",
  "cancel_requested",
  "unknown",
]);
const deliveryLabels = {
  queued: "Delivery queued",
  sending: "Sending",
  retrying: "Delivery retrying",
  delivered: "Delivered",
  failed: "Delivery failed",
  unknown: "Delivery unconfirmed",
  cancelled: "Delivery cancelled",
};
const checkLabels = {
  unchanged: "source unchanged",
  unavailable: "source file unavailable",
  mismatch: "file did not match",
  recovery_blocked: "recovery needs review",
  source_not_ready: "waiting for the source Routine",
  source_failed: "source Routine failed",
  source_output_missing: "source Routine produced no matching file",
};
const loopReasons = {
  condition_met: "Condition verified",
  run_limit: "Run limit reached",
  safety_limit: "Safety limit reached. Resume to continue from this position.",
  paused_by_user: "Position saved for resume",
};
const loopConditions = {
  matched: "Condition verified",
  missing: "Waiting for evidence file",
  mismatch: "Evidence did not match",
  unavailable: "Evidence unavailable",
};

export function RoutineDetails({
  routine,
  snapshot,
  openFile,
  openGoal,
  viewSource,
  refresh,
}: RoutineDetailsProps) {
  const title = routineName(routine);
  const loop = routine.schedule.type === "loop";
  const limits = routine.schedule.type === "loop" ? routine.schedule : null;
  const checkpoint = routine.loop_progress;
  const terminal = routine.state === "stopped" || routine.state === "completed";
  const relatedGoalId = routine.goal_id;
  const precheck = routine.precheck;
  const prerequisite =
    precheck && "source_routine_id" in precheck
      ? snapshot.routines.find((source) => source.id === precheck.source_routine_id)
      : undefined;
  const [starting, setStarting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const runs = new Map(snapshot.runs.map((run) => [run.id, run]));
  const deliveries = new Map(
    snapshot.routine_deliveries?.map((delivery) => [delivery.run_id, delivery]),
  );
  const occurrences = snapshot.occurrences
    .filter((occurrence) => occurrence.routine_id === routine.id)
    .sort((a, b) => b.scheduled_for.localeCompare(a.scheduled_for));
  const busy = occurrences.some(
    ({ state, run_id }) =>
      unsettled.has(state) || unsettled.has(runs.get(run_id ?? "")?.status ?? ""),
  );
  const previousCheck = occurrences.find((entry) => entry.trigger !== "manual" && entry.run_id);

  async function runNow() {
    if (starting || busy) return;
    const slot = `routine-run-now:${routine.id}`;
    setStarting(true);
    setNotice("");
    setError("");
    try {
      const occurrence = await durableCommand<Snapshot["occurrences"][number]>(
        slot,
        `/v1/routines/${routine.id}/run-now`,
        {
          expected_revision: routine.revision,
        },
      );
      if (occurrence.state !== "skipped") setNotice("Run requested.");
    } catch (failure) {
      if (failure instanceof ApiError && failure.code === "CONFLICT") {
        localStorage.removeItem(scopedStorageKey(`ngertiin:pending:${slot}`));
        setError("The Routine changed or already has work in progress.");
      } else setError(failure instanceof Error ? failure.message : "Could not start the run.");
    } finally {
      setStarting(false);
      void refresh().catch(() => {});
    }
  }
  return (
    <div className="mt-6 space-y-5">
      {routine.restore_pending && (
        <p className="text-sm text-muted-foreground">
          Choose a model in this conversation, then resume to authorize this restored Routine.
        </p>
      )}
      {routine.instruction !== title && (
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">
          {routine.instruction}
        </p>
      )}
      {loop && (
        <div className="space-y-1 text-sm text-muted-foreground">
          <p>
            {checkpoint?.runs ?? 0}
            {limits?.max_runs === undefined ? "" : ` of ${limits.max_runs}`} checks finished
          </p>
          {limits?.until && (
            <p>Stops when {limits.until.artifact_name} matches the required text.</p>
          )}
          {checkpoint?.reason && (
            <p className="font-medium text-foreground">{loopReasons[checkpoint.reason]}</p>
          )}
          {routine.state === "active" &&
            routine.next_run_at &&
            previousCheck?.state === "failed" && (
              <p>Previous check failed. The next check is scheduled.</p>
            )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {routine.timezone}
          {routine.next_run_at
            ? ` · Next run: ${responsibilityTime(routine.next_run_at, routine.timezone, loop)}`
            : ""}
        </p>
        {!terminal && (
          <Button
            variant="outline"
            size="sm"
            disabled={starting || busy || routine.restore_pending}
            onClick={() => void runNow()}
          >
            Run now
          </Button>
        )}
      </div>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {routine.monitor && (
        <section aria-label="Alert condition">
          <h3 className="text-sm font-medium">Alert condition</h3>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            Alert when {routine.monitor.metric} exceeds {routine.monitor.above}.
          </p>
        </section>
      )}
      {precheck && (
        <section aria-label="Pre-check">
          <h3 className="text-sm font-medium">Pre-check</h3>
          <p className="mt-2 break-words text-sm text-muted-foreground">
            {snapshot.workspaces.find(({ id }) => id === precheck.workspace_id)?.name ??
              "Conversation workspace"}
            {" · "}
            {precheck.source_path}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {"source_routine_id" in precheck
              ? `Use the file from the latest run of ${prerequisite ? routineName(prerequisite) : "the source Routine"}.`
              : "on_change" in precheck
                ? "Run when the published file changes."
                : "Run when the published snapshot matches this text."}
          </p>
          {"exact_text" in precheck && (
            <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-xs">
              {precheck.exact_text}
            </pre>
          )}
        </section>
      )}
      {!!(snapshot.routine_delivery_targets?.length || routine.delivery_target) && (
        <RoutineDelivery
          routine={routine}
          targets={snapshot.routine_delivery_targets ?? []}
          refresh={refresh}
        />
      )}
      <details open>
        <summary className="cursor-pointer text-sm font-medium text-muted-foreground">
          Run history
        </summary>
        <ol className="mt-3 space-y-1">
          {occurrences.map((occurrence) => {
            const run = runs.get(occurrence.run_id ?? "");
            const delivery = deliveries.get(occurrence.run_id ?? "");
            const status = run?.status ?? occurrence.state;
            const outcome = occurrence.check?.outcome;
            const cadence = occurrence.trigger === "manual" ? "manual" : "scheduled";
            const source =
              occurrence.run_id || !outcome || outcome === "match" ? cadence : checkLabels[outcome];
            const label = outcome?.startsWith("source_")
              ? "Input held"
              : run?.preparation?.state === "blocked"
                ? "Waiting for the selected harness"
                : (responsibilityLabels[status] ?? status);
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
                  {label} · {source}
                  {occurrence.check?.recovery_of && " · Resumed observed change"}
                  {occurrence.loop_condition && (
                    <span className="block text-xs leading-5">
                      {loopConditions[occurrence.loop_condition.status]}
                      {occurrence.loop_condition.artifact_id && (
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          className="ml-1 h-auto px-1 py-0 text-xs"
                          onClick={() => {
                            const id = occurrence.loop_condition?.artifact_id;
                            if (id) openFile(id);
                          }}
                        >
                          View evidence
                        </Button>
                      )}
                    </span>
                  )}
                  {run?.routine_observation &&
                    ` · ${run.routine_observation.value} · ${
                      run.routine_observation.decision === "alert"
                        ? "Threshold exceeded"
                        : run.routine_observation.decision === "already_alerted"
                          ? "Already notified"
                          : "Within threshold"
                    }`}
                  {routine.monitor && run?.status === "succeeded" && !run.routine_observation
                    ? " · Reading unavailable"
                    : ""}
                  {delivery && (
                    <span className="block text-xs leading-5">
                      {deliveryLabels[delivery.state]} · {delivery.destination}
                    </span>
                  )}
                </span>
                <time className="max-w-[45%] text-right text-xs leading-5 text-muted-foreground">
                  {responsibilityTime(occurrence.scheduled_for, routine.timezone, loop)}
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
