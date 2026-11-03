import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { ResponsibilityScope } from "./scope";

/** Immutable evidence must belong to this responsibility's actual execution lineage. */
export function verifyGoalEvidence(
  lifecycle: Lifecycle,
  goal: Entity<"goal">,
  ids: string[],
  current?: Entity<"run">,
) {
  const scope = new ResponsibilityScope(lifecycle.store);
  for (const id of ids) {
    const artifact = lifecycle.store.get("artifact", id);
    if (
      artifact.thread_id !== goal.thread_id ||
      artifact.origin !== "native_output" ||
      !artifact.workspace_id ||
      !artifact.run_id ||
      !artifact.size_bytes
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const workspace = lifecycle.store.get("workspace", artifact.workspace_id);
    if (
      artifact.agent_id !== workspace.agent_id ||
      (goal.scope === "group" ? workspace.scope !== "group" : artifact.agent_id !== goal.agent_id)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const producer = lifecycle.store.get("run", artifact.run_id);
    const generation = artifact.goal_generations[goal.id];
    if (generation !== undefined ? generation !== goal.generation : goal.generation !== 1)
      throw new DomainError("SCOPE_DENIED", 403);
    if (
      producer.workspace_id !== workspace.id ||
      producer.cancellation !== "none" ||
      !scope.evidence(goal, producer)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (producer.id !== current?.id && producer.status !== "succeeded")
      throw new DomainError("SCOPE_DENIED", 403);
    new Artifacts(lifecycle).download(id, workspace.id);
  }
  if (!ids.length) throw new DomainError("CONFLICT");
}
