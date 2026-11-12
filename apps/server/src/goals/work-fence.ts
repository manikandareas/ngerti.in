import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";

/** An explicit deferred step belongs to a new scheduler run, never to its source turn. */
export async function authorizeResponsibilityWork(lifecycle: Lifecycle, runId: string) {
  const run = await lifecycle.store.get("run", runId);
  if (
    (await lifecycle.store.list("goal", { thread_id: run.thread_id, state: "active" })).some(
      (goal) =>
        goal.thread_id === run.thread_id &&
        (goal.scope === "group" || goal.agent_id === run.agent_id) &&
        goal.state === "active" &&
        goal.current_run_id === runId &&
        goal.deferred_by_run_id === runId,
    )
  )
    throw new DomainError("RESPONSIBILITY_DEFERRED");
}
