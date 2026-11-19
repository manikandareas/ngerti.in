import type { Entity } from "../contracts";
import type { Store } from "../store";

export async function hasUnresolvedResponseEffects(
  store: Store,
  run: Entity<"run">,
): Promise<boolean> {
  return (
    run.native_tools.some((tool) => tool.state === "started") ||
    (await store.list("app_effect", { run_id: run.id })).some(
      (effect) => effect.run_id === run.id && ["dispatched", "unknown"].includes(effect.state),
    ) ||
    (await store.list("machine_operation", { run_id: run.id })).some(
      (effect) => effect.run_id === run.id && ["dispatched", "unknown"].includes(effect.state),
    )
  );
}

export async function canRetryResponse(store: Store, run: Entity<"run">): Promise<boolean> {
  return (
    run.status === "failed" &&
    !run.parallel_peer_source_id &&
    !run.peer_budget_seconds &&
    run.cancellation === "none" &&
    !run.retried_by_run_id &&
    run.diagnostic?.outcome !== "unknown" &&
    !(await scheduledSourceOwnsRetry(store, run)) &&
    !(await hasUnresolvedResponseEffects(store, run))
  );
}

export async function scheduledSourceOwnsRetry(store: Store, run: Entity<"run">) {
  if (!run.routine_id) return false;
  const { precheck } = await store.get("routine", run.routine_id);
  return precheck !== null && "on_change" in precheck;
}
