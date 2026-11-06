import type { Entity } from "../contracts";
import type { Store } from "../store";

export function hasUnresolvedResponseEffects(store: Store, run: Entity<"run">): boolean {
  return (
    run.native_tools.some((tool) => tool.state === "started") ||
    store
      .list("app_effect")
      .some(
        (effect) => effect.run_id === run.id && ["dispatched", "unknown"].includes(effect.state),
      ) ||
    store
      .list("machine_operation")
      .some(
        (effect) => effect.run_id === run.id && ["dispatched", "unknown"].includes(effect.state),
      )
  );
}

export function canRetryResponse(store: Store, run: Entity<"run">): boolean {
  return (
    run.status === "failed" &&
    run.cancellation === "none" &&
    !run.retried_by_run_id &&
    run.diagnostic?.outcome !== "unknown" &&
    !hasUnresolvedResponseEffects(store, run)
  );
}
