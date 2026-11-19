import { createHash } from "node:crypto";
import type { Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { learningProgress } from "./review-contracts";

type Run = Entity<"run">;

const routineTools = new Set([
  "ngertiin.assign_skill",
  "ngertiin.create_file",
  "ngertiin.create_skill",
  "ngertiin.delete_memory",
  "ngertiin.describe_tools",
  "ngertiin.get_workspace",
  "ngertiin.list_files",
  "ngertiin.list_memories",
  "ngertiin.list_skills",
  "ngertiin.publish_artifact",
  "ngertiin.read_file",
  "ngertiin.read_run_context",
  "ngertiin.read_skill",
  "ngertiin.read_harness_skill",
  "ngertiin.revise_skill",
  "ngertiin.write_memory",
]);

export const learningPathDigest = (path: string) => createHash("sha256").update(path).digest("hex");

/** A response and a file receipt alone can describe literal delivery with no method to learn. */
export async function learningReviewCandidate(
  lifecycle: Lifecycle,
  run: Run,
): Promise<{ progress: Run["learning_progress"]; review: Run["learning_review"] } | null> {
  const store = lifecycle.store;
  const scope = store.dataContext;
  const workSteps =
    run.sources.length +
    run.tool_errors.filter(({ name }) => !routineTools.has(name)).length +
    run.product_tools.filter((tool) => !routineTools.has(tool)).length;
  if (
    !scope ||
    !run.provider_selection ||
    run.cancellation !== "none" ||
    run.routine_id ||
    run.task_id ||
    (!workSteps && !run.learning_file_reads.length)
  )
    return null;
  const thread = await store.get("thread", run.thread_id);
  const input = await store.get("message", run.input_message_id);
  if (thread.type !== "dm" || input.author !== "user") return null;
  const outputs = (await store.list("artifact", { run_id: run.id })).filter(
    (item) => item.origin === "native_output" && item.workspace_id === run.workspace_id,
  );
  if (!outputs.length) return null;
  const deliveryPaths = new Set(
    outputs.flatMap((item) => (item.source_path ? [learningPathDigest(item.source_path)] : [])),
  );
  const sourceReads = new Set(run.learning_file_reads.filter((path) => !deliveryPaths.has(path)));
  const newSteps = workSteps + sourceReads.size;
  if (!newSteps) return null;
  const latest = (
    await store.query<{ progress: unknown; selection: unknown }>(
      `SELECT body->'learning_progress' AS progress, body->'provider_selection' AS selection
     FROM entities WHERE kind='run' AND body->>'thread_id'=$1 AND body->>'agent_id'=$2
       AND jsonb_typeof(body->'learning_progress')='object'
     ORDER BY seq DESC LIMIT 1`,
      [run.thread_id, run.agent_id],
    )
  ).rows[0];
  const previous =
    latest && canonical(latest.selection) === canonical(run.provider_selection)
      ? learningProgress.parse(latest.progress)
      : null;
  const generations = {
    membership_generation: scope.membershipGeneration,
    authorization_generation: scope.authorizationGeneration,
  };
  const prior =
    previous?.membership_generation === generations.membership_generation &&
    previous?.authorization_generation === generations.authorization_generation
      ? previous
      : null;
  const memoryTurns = (prior?.memory_turns ?? 0) + 1;
  const skillSteps = (prior?.skill_steps ?? 0) + newSteps;
  const memorySources = [...(prior?.memory_sources ?? []), run.id].slice(-8);
  const skillSources = [...(prior?.skill_sources ?? []), run.id].slice(-8);
  const scopes = {
    memory: memoryTurns >= lifecycle.reviewCadence.memory_turns,
    skill: skillSteps >= lifecycle.reviewCadence.skill_steps,
  };
  return {
    progress: {
      ...generations,
      memory_turns: scopes.memory ? 0 : memoryTurns,
      skill_steps: scopes.skill ? 0 : skillSteps,
      memory_sources: scopes.memory ? [] : memorySources,
      skill_sources: scopes.skill ? [] : skillSources,
    },
    review:
      scopes.memory || scopes.skill
        ? {
            ...generations,
            scopes,
            memory_sources: scopes.memory ? memorySources : [],
            skill_sources: scopes.skill ? skillSources : [],
            state: "pending",
            attempts: 0,
            authority_epoch: null,
            attempt_id: null,
            skill_versions: [],
            memory_saved: false,
            memory_superseded: false,
          }
        : null,
  };
}
