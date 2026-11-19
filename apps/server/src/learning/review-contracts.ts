import { z } from "zod";
import { providerSelection, providerUsage } from "../harness/selection-contracts";
import { skillAsset, skillName } from "./contracts";

export const learningCadence = z
  .strictObject({
    memory_turns: z.coerce.number().int().min(1).max(100).default(10),
    skill_steps: z.coerce.number().int().min(1).max(1000).default(10),
    review_ms: z.coerce.number().int().min(100).max(60_000).default(60_000),
    curator_interval_ms: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60 * 1000),
    stale_skill_ms: z.coerce
      .number()
      .int()
      .positive()
      .default(14 * 24 * 60 * 60 * 1000),
    archive_skill_ms: z.coerce
      .number()
      .int()
      .positive()
      .default(30 * 24 * 60 * 60 * 1000),
  })
  .refine(
    (cadence) => cadence.stale_skill_ms < cadence.archive_skill_ms,
    "Skill archive age must exceed stale age.",
  );
export type LearningCadence = z.infer<typeof learningCadence>;
const sourceRuns = z.array(z.uuid()).max(8);
export const learningProgress = z.strictObject({
  memory_turns: z.int().nonnegative(),
  skill_steps: z.int().nonnegative(),
  memory_sources: sourceRuns,
  skill_sources: sourceRuns,
  membership_generation: z.int().positive(),
  authorization_generation: z.int().positive(),
});

export const learningReview = z.strictObject({
  state: z.enum(["pending", "running", "applied", "no_change", "failed", "cancelled"]),
  attempts: z.int().min(0).max(2),
  authority_epoch: z.uuid().nullable(),
  attempt_id: z.uuid().nullable(),
  provider_selection: providerSelection.nullable().optional(),
  usage: providerUsage.optional(),
  membership_generation: z.int().positive(),
  authorization_generation: z.int().positive(),
  scopes: z
    .strictObject({ memory: z.boolean(), skill: z.boolean() })
    .default({ memory: true, skill: true }),
  memory_sources: sourceRuns.default([]),
  skill_sources: sourceRuns.default([]),
  skill_versions: z.array(z.object({ skill_id: z.uuid(), version: z.int().positive() })).max(1),
  memory_saved: z.boolean(),
  memory_superseded: z.boolean().default(false),
});

export const learningReviewResult = z.strictObject({
  memory: z.string().trim().min(1).max(800).nullable(),
  skill: z
    .strictObject({
      name: skillName,
      description: z.string().trim().min(1).max(280),
      instructions: z.string().trim().min(1).max(4000),
      assets: z
        .array(skillAsset.refine((asset) => "text" in asset && asset.text.length <= 4000))
        .max(2)
        .default([]),
    })
    .nullable(),
});
