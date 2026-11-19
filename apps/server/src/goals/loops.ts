import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { firstDue, nextLoopWake, updateLoopPacing } from "./schedule";
import { textMatches } from "./verification";

const safetyLimit = 100;
const initial = { runs: 0, budget_used: 0, resume_at: null, reason: null } as const;
type LoopCondition = NonNullable<Entity<"occurrence">["loop_condition"]>;

export function loopControlFields(
  routine: Entity<"routine">,
  state: "paused" | "active" | "stopped",
  now = new Date(),
): Pick<Partial<Entity<"routine">>, "loop_progress" | "next_run_at"> {
  if (routine.schedule.type !== "loop") return {};
  const progress = routine.loop_progress ?? initial;
  if (state === "paused") {
    return {
      next_run_at: null,
      loop_progress: {
        ...progress,
        resume_at: progress.resume_at ?? routine.next_run_at ?? now.toISOString(),
        reason: progress.reason ?? "paused_by_user",
      },
    };
  }
  return {
    next_run_at:
      state === "active"
        ? (progress.resume_at ??
          routine.next_run_at ??
          firstDue(routine.schedule, routine.timezone, now))
        : null,
    loop_progress: {
      ...progress,
      resume_at: null,
      reason: null,
      budget_used: progress.reason === "safety_limit" ? 0 : progress.budget_used,
    },
  };
}

async function checkCondition(
  lifecycle: Lifecycle,
  run: Entity<"run">,
  condition: { artifact_name: string; exact_text: string },
): Promise<LoopCondition> {
  const artifact = (await lifecycle.store.list("artifact", { run_id: run.id })).findLast(
    (file) =>
      file.name === condition.artifact_name &&
      file.run_id === run.id &&
      file.thread_id === run.thread_id &&
      file.workspace_id === run.workspace_id &&
      file.origin === "native_output",
  );
  if (!artifact?.workspace_id) return { status: "missing", artifact_id: null };
  const artifact_id = artifact.id;
  if (artifact.materialization !== "ready" || (artifact.size_bytes ?? Infinity) > 64 * 1024)
    return { status: "unavailable", artifact_id };
  try {
    const { bytes } = await new Artifacts(lifecycle).download(artifact_id, artifact.workspace_id);
    return {
      status: textMatches(bytes, condition.exact_text) ? "matched" : "mismatch",
      artifact_id,
    };
  } catch (error) {
    if (
      (error instanceof DomainError &&
        ["NOT_FOUND", "SCOPE_DENIED", "CONFLICT"].includes(error.code)) ||
      (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT")
    )
      return { status: "unavailable", artifact_id };
    throw error;
  }
}

export async function settleLoop(
  lifecycle: Lifecycle,
  routine: Entity<"routine">,
  run: Entity<"run">,
) {
  const { schedule } = routine;
  if (schedule.type !== "loop") return null;
  const settledAt = run.timings?.settled_at ?? run.updated_at;
  const succeeded = run.status === "succeeded" && run.cancellation === "none";
  const condition =
    succeeded && schedule.until ? await checkCondition(lifecycle, run, schedule.until) : null;
  const reading = run.routine_observation?.value;
  const answer =
    succeeded && schedule.self_paced && reading === undefined
      ? ((await lifecycle.store.answer(run.id))?.text ?? run.pending_answer)?.trim()
      : null;
  const pacing = updateLoopPacing(
    schedule,
    routine.loop_pacing,
    succeeded && reading !== undefined ? { reading } : answer ? { answer } : null,
  );
  const progress = routine.loop_progress ?? initial;
  const count = run.timings?.dispatched_at ? 1 : 0;
  const runs = progress.runs + count;
  const budget_used = Math.min(safetyLimit, progress.budget_used + count);
  const next = nextLoopWake(schedule, settledAt, pacing);
  let reason: NonNullable<Entity<"routine">["loop_progress"]>["reason"] = null;
  let state: Entity<"routine">["state"] = "active";
  if (condition?.status === "matched" || (schedule.max_runs && runs >= schedule.max_runs)) {
    state = "completed";
    reason = condition?.status === "matched" ? "condition_met" : "run_limit";
  } else if (budget_used === safetyLimit) {
    state = "paused";
    reason = "safety_limit";
  }
  const fields = {
    state,
    loop_pacing: pacing,
    loop_progress: { runs, budget_used, reason, resume_at: state === "paused" ? next : null },
    next_run_at: state === "active" ? next : null,
  };
  return { condition, fields };
}
