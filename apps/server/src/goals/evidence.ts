import { Artifacts } from "../artifacts";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { ResponsibilityScope } from "./scope";

export type VerifiedGoalFiles = ReadonlyMap<string, { id: string; bytes: Uint8Array | null }>;

/** Immutable evidence must belong to this responsibility's actual execution lineage. */
export async function verifyGoalEvidence(
  lifecycle: Lifecycle,
  goal: Entity<"goal">,
  ids: string[],
  current?: Entity<"run">,
) {
  const requested = new Map(goal.verification?.checks.map((check) => [check.artifact_name, check]));
  const files = new Map<string, { id: string; bytes: Uint8Array | null }>();
  const fingerprints = new Map<string, string>();
  const scope = new ResponsibilityScope(lifecycle.store);
  for (const id of ids) {
    const artifact = await lifecycle.store.get("artifact", id);
    if (
      artifact.thread_id !== goal.thread_id ||
      artifact.origin !== "native_output" ||
      !artifact.workspace_id ||
      !artifact.run_id ||
      !artifact.size_bytes
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const workspace = await lifecycle.store.get("workspace", artifact.workspace_id);
    if (
      artifact.agent_id !== workspace.agent_id ||
      (goal.scope === "group" ? workspace.scope !== "group" : artifact.agent_id !== goal.agent_id)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const producer = await lifecycle.store.get("run", artifact.run_id);
    const generation = artifact.goal_generations[goal.id];
    const checkpoint =
      goal.checkpoint_evidence?.assignment_revision === goal.assignment_revision &&
      goal.checkpoint_evidence.artifact_ids.includes(artifact.id) &&
      producer.thread_id === goal.thread_id &&
      producer.status === "succeeded";
    if (
      !checkpoint &&
      (generation !== undefined ? generation !== goal.generation : goal.generation !== 1)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (
      producer.workspace_id !== workspace.id ||
      producer.cancellation !== "none" ||
      (!checkpoint && !(await scope.evidence(goal, producer)))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    if (producer.id !== current?.id && producer.status !== "succeeded")
      throw new DomainError("SCOPE_DENIED", 403);
    const { bytes } = await new Artifacts(lifecycle).download(id, workspace.id);
    fingerprints.set(id, JSON.stringify([artifact.name, artifact.sha256]));
    const check = requested.get(artifact.name);
    if (check)
      files.set(artifact.name, {
        id: artifact.id,
        bytes: check.exact_text !== undefined && bytes.byteLength <= 64 * 1024 ? bytes : null,
      });
  }
  if (!ids.length) throw new DomainError("CONFLICT");
  return { files, fingerprints };
}
