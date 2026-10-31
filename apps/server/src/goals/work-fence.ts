import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";

/** An explicit deferred step belongs to a new scheduler run, never to its source turn. */
export function authorizeResponsibilityWork(lifecycle: Lifecycle, runId: string) {
  const run = lifecycle.store.get("run", runId);
  if (
    lifecycle.store
      .list("goal")
      .some(
        (goal) =>
          goal.thread_id === run.thread_id &&
          goal.agent_id === run.agent_id &&
          goal.state === "active" &&
          goal.current_run_id === runId &&
          goal.deferred_by_run_id === runId,
      )
  )
    throw new DomainError("RESPONSIBILITY_DEFERRED");
}
