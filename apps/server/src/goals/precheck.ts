import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { hasUnresolvedResponseEffects } from "../runs/retry-policy";
import { Workspaces } from "../workspaces/service";
import { type GoalScope, ResponsibilityScope } from "./scope";
import { textMatches } from "./verification";

type RoutinePrecheck = NonNullable<Entity<"routine">["precheck"]>;
type OccurrenceCheck = NonNullable<Entity<"occurrence">["check"]>;
const unavailable: OccurrenceCheck = { outcome: "unavailable", artifact_id: null, sha256: null };

export async function requirePrecheckWorkspace(
  lifecycle: Lifecycle,
  check: RoutinePrecheck,
  scope: { thread_id: string; agent_id: string | null },
) {
  const workspace = await new Workspaces(lifecycle).get(check.workspace_id);
  if (
    workspace.thread_id !== scope.thread_id ||
    (workspace.scope === "agent" && workspace.agent_id !== scope.agent_id)
  )
    throw new DomainError("SCOPE_DENIED", 403);
  return workspace;
}

export async function requirePrecheckDefinition(
  lifecycle: Lifecycle,
  routineId: string,
  check: RoutinePrecheck,
  scope: GoalScope,
) {
  const workspace = await requirePrecheckWorkspace(lifecycle, check, scope);
  const authorization = new ResponsibilityScope(lifecycle.store);
  const visited = new Set([routineId]);
  let source = "source_routine_id" in check ? check.source_routine_id : null;
  while (source) {
    if (visited.has(source)) throw new DomainError("CONFLICT");
    visited.add(source);
    const prerequisite = await authorization.require(
      scope,
      await lifecycle.store.get("routine", source),
    );
    if (workspace.scope === "agent" && prerequisite.agent_id !== workspace.agent_id)
      throw new DomainError("SCOPE_DENIED", 403);
    const next = prerequisite.precheck;
    source = next && "source_routine_id" in next ? next.source_routine_id : null;
  }
}

async function latestSource(lifecycle: Lifecycle, check: RoutinePrecheck) {
  const { rows } = await lifecycle.store.query<{ id: string; size_bytes: string; sha256: string }>(
    `SELECT a.id, a.body->>'size_bytes' AS size_bytes, a.body->>'sha256' AS sha256
     FROM entities a
     JOIN entities r ON r.kind='run' AND r.id=(a.body->>'run_id')::uuid
     WHERE a.kind='artifact' AND a.body->>'workspace_id'=$1 AND a.body->>'source_path'=$2
       AND a.body->>'origin'='native_output' AND r.body->>'status'='succeeded'
     ORDER BY a.seq DESC LIMIT 1`,
    [check.workspace_id, check.source_path],
  );
  return rows[0];
}

export async function initialPrecheckBaseline(
  lifecycle: Lifecycle,
  check: RoutinePrecheck | null | undefined,
) {
  return check && "on_change" in check
    ? ((await latestSource(lifecycle, check))?.sha256 ?? null)
    : null;
}

async function changedSource(
  lifecycle: Lifecycle,
  routine: Entity<"routine">,
  source: Extract<RoutinePrecheck, { on_change: true }>,
): Promise<OccurrenceCheck> {
  const { store } = lifecycle;
  const { rows } = await store.query<{ id: string }>(
    `SELECT id FROM entities
     WHERE kind='occurrence' AND body->>'routine_id'=$1
       AND body->'check'->>'precheck_revision'=$2 AND body->'check'->>'outcome'='match'
     ORDER BY seq DESC LIMIT 1`,
    [routine.id, String(routine.precheck_revision)],
  );
  const prior = rows[0] ? await store.get("occurrence", rows[0].id) : null;
  const observed = prior?.check;
  if (prior?.run_id && observed?.artifact_id) {
    const run = await store.get("run", prior.run_id);
    if (run.status === "failed") {
      const blocked =
        run.diagnostic?.outcome === "unknown" ||
        (await hasUnresolvedResponseEffects(store, run)) ||
        (await store.list("app_effect", { run_id: run.id })).some(
          (effect) => effect.state === "succeeded",
        ) ||
        (await store.list("artifact", { run_id: run.id })).some(
          (artifact) => artifact.origin === "native_output",
        );
      if (blocked) return { ...observed, outcome: "recovery_blocked" };
      const artifact = await store.get("artifact", observed.artifact_id);
      if (
        artifact.workspace_id !== source.workspace_id ||
        artifact.source_path !== source.source_path ||
        artifact.sha256 !== observed.sha256
      )
        return unavailable;
      return { ...observed, recovery_of: observed.recovery_of ?? prior.id };
    }
  }
  const latest = await latestSource(lifecycle, source);
  if (!latest) return unavailable;
  return {
    outcome:
      latest.sha256 === (observed?.sha256 ?? routine.precheck_baseline_sha256)
        ? "unchanged"
        : "match",
    artifact_id: latest.id,
    sha256: latest.sha256,
    precheck_revision: routine.precheck_revision,
  };
}

async function prerequisiteSource(
  lifecycle: Lifecycle,
  routine: Entity<"routine">,
  check: Extract<RoutinePrecheck, { source_routine_id: string }>,
): Promise<OccurrenceCheck> {
  const { store } = lifecycle;
  await new ResponsibilityScope(store).require(
    routine,
    await store.get("routine", check.source_routine_id),
  );
  // A quiet slot leaves the latest execution in place. A newer blocked or failed
  // execution must not silently fall back to an older successful artifact.
  const { rows } = await store.query<{ id: string }>(
    `SELECT id FROM entities
     WHERE kind='occurrence' AND body->>'routine_id'=$1 AND (
       body->>'run_id' IS NOT NULL OR body->>'state' NOT IN ('completed','skipped','cancelled')
       OR body->'check'->>'outcome' IN ('source_not_ready','source_failed','source_output_missing','recovery_blocked')
     )
     ORDER BY seq DESC LIMIT 1`,
    [check.source_routine_id],
  );
  const occurrence = rows[0] ? await store.get("occurrence", rows[0].id) : null;
  const missing = {
    artifact_id: null,
    sha256: null,
    ...(occurrence ? { source_occurrence_id: occurrence.id } : {}),
  };
  if (!occurrence?.run_id) return { ...missing, outcome: "source_not_ready" };
  const run = await store.get("run", occurrence.run_id);
  if (["failed", "cancelled", "steered"].includes(run.status))
    return { ...missing, outcome: "source_failed" };
  if (run.status !== "succeeded") return { ...missing, outcome: "source_not_ready" };
  const output = (
    await store.list("artifact", {
      run_id: run.id,
      workspace_id: check.workspace_id,
    })
  ).findLast((item) => item.origin === "native_output" && item.source_path === check.source_path);
  if (!output) return { ...missing, outcome: "source_output_missing" };
  return {
    outcome: "match",
    artifact_id: output.id,
    sha256: output.sha256,
    source_occurrence_id: occurrence.id,
  };
}

export async function checkRoutineSource(lifecycle: Lifecycle, routine: Entity<"routine">) {
  const check = routine.precheck;
  if (!check) return null;
  try {
    await requirePrecheckWorkspace(lifecycle, check, routine);
    if ("on_change" in check) return await changedSource(lifecycle, routine, check);
    if ("source_routine_id" in check) return await prerequisiteSource(lifecycle, routine, check);
    const latest = await latestSource(lifecycle, check);
    if (!latest || Number(latest.size_bytes) > 64 * 1024) return unavailable;
    const { artifact, bytes } = await new Artifacts(lifecycle).download(
      latest.id,
      check.workspace_id,
    );
    const matches = textMatches(bytes, check.exact_text);
    return {
      outcome: matches ? "match" : "mismatch",
      artifact_id: artifact.id,
      sha256: artifact.sha256,
    } satisfies OccurrenceCheck;
  } catch (error) {
    if (
      (error instanceof DomainError &&
        ["NOT_FOUND", "SCOPE_DENIED", "CONFLICT"].includes(error.code)) ||
      (error instanceof Error && (error as NodeJS.ErrnoException).code === "ENOENT")
    )
      return "source_routine_id" in check
        ? { ...unavailable, outcome: "source_not_ready" as const }
        : unavailable;
    throw error;
  }
}

export function precheckCompletion(check: OccurrenceCheck | null, manual: boolean) {
  if (
    check &&
    ["recovery_blocked", "source_not_ready", "source_failed", "source_output_missing"].includes(
      check.outcome,
    )
  )
    return "skipped";
  if (!check || manual || check.outcome === "match") return null;
  return check.outcome === "unchanged" ? "completed" : "skipped";
}

export function checkedRoutineInstruction(
  routine: Entity<"routine">,
  check: OccurrenceCheck | null,
) {
  const condition = routine.schedule.type === "loop" ? routine.schedule.until : null;
  return [
    check?.recovery_of &&
      "This scheduled check is recovering a previously observed change after a confirmed failed analysis. Use the attached immutable snapshot for that observation. Follow the Routine instructions and publish its result.",
    condition &&
      `The application verifies the stop condition against the exact contents of ${JSON.stringify(condition.artifact_name)} published in this run. Check the actual source and publish its observed result. When the condition has not occurred, report the observed state.`,
    routine.instruction,
  ]
    .filter(Boolean)
    .join("\n\n");
}
