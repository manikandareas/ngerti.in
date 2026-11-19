import { z } from "zod";
import { base, harness } from "../contracts/base";
import { externalMemoryChange } from "./external-memory-contracts";

export const learningContext = z.strictObject({ agent_id: z.uuid(), thread_id: z.uuid() });
export type LearningContext = z.infer<typeof learningContext>;
export const learningVisibility = z.enum(["dm_private", "group", "shared"]);
const scopeFields = {
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  visibility: learningVisibility,
};
export const memoryWrite = z.strictObject({
  memory_id: z.uuid(),
  expected_revision: z.int().min(0),
  visibility: learningVisibility,
  text: z.string().trim().min(1).max(8000),
});
export const memoryDelete = z.strictObject({
  memory_id: z.uuid(),
  expected_revision: z.int().positive(),
});
export const memoryQuery = z.strictObject({
  query: z.string().max(1000).default(""),
  after: z.uuid().nullable().default(null),
  limit: z.int().min(1).max(100).default(50),
  include_deleted: z.boolean().default(false),
});
export const memoryFields = {
  ...scopeFields,
  text: z.string().max(8000),
  state: z.enum(["active", "deleted"]),
  source_run_id: z.uuid().nullable(),
};
export const skillName = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const assetPath = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (path) =>
      !path.includes("\\") &&
      !path.includes("\0") &&
      !path.startsWith("/") &&
      path
        .split("/")
        .every((part) => /^[a-zA-Z0-9_.-]+$/.test(part) && ![".", ".."].includes(part)) &&
      path.toLowerCase() !== "skill.md",
    "Invalid skill asset path.",
  );
export const skillAsset = z.union([
  z.strictObject({ path: assetPath, text: z.string().max(64_000) }),
  z.strictObject({
    path: assetPath,
    content_base64: z
      .string()
      .max(90_000)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  }),
]);
export type SkillAsset = z.infer<typeof skillAsset>;
export const skillPackage = z
  .strictObject({
    description: z.string().trim().min(1).max(1024),
    instructions: z.string().trim().min(1).max(64_000),
    assets: z.array(skillAsset).max(32).default([]),
  })
  .refine(
    (value) =>
      new Set(value.assets.map((asset) => asset.path.toLowerCase())).size === value.assets.length &&
      Buffer.byteLength(JSON.stringify(value)) <= 200_000,
    "Duplicate assets or oversized package.",
  );
export const skillCreate = z.strictObject({
  name: skillName,
  visibility: learningVisibility,
  package: skillPackage,
});
export const skillRevise = z.strictObject({
  skill_id: z.uuid(),
  expected_revision: z.int().positive(),
  package: skillPackage,
});
export const skillRead = z.strictObject({ skill_id: z.uuid(), version: z.int().positive() });
export const skillToolRead = skillRead
  .extend({
    view: z.literal("overview").optional(),
    asset_path: assetPath.optional(),
  })
  .refine((input) => !(input.view && input.asset_path), "Choose the overview or one asset.");
export const optionalSkillInstall = z.strictObject({
  context: learningContext,
  name: skillName,
});
export const optionalSkillView = z.strictObject({
  name: skillName,
  description: z.string(),
  setup: z.string(),
  app_actions_available: z.boolean(),
  installed_skill_id: z.uuid().nullable(),
  enabled: z.boolean(),
});
export const skillConsolidation = z.strictObject({ target: skillRead, source: skillRead });
export const skillConsolidationRequest = skillConsolidation
  .extend({ context: learningContext })
  .refine(
    ({ target, source }) => target.skill_id !== source.skill_id,
    "Choose two different skills.",
  );
export type SkillConsolidation = z.infer<typeof skillConsolidation>;
export const skillAssign = z.strictObject({
  skill_id: z.uuid(),
  version: z.int().positive(),
  expected_revision: z.int().min(0),
  enabled: z.boolean(),
});
export const teamSkillPublication = z.strictObject({
  skill_id: z.uuid().nullable().default(null),
  expected_revision: z.int().nonnegative(),
  name: skillName,
  package: skillPackage,
  enabled: z.boolean().default(true),
});
export const skillFields = {
  ...scopeFields,
  thread_id: z.uuid().nullable(),
  name: skillName,
  source: z.literal("application"),
  distribution: z.enum(["built_in", "optional"]).optional(),
};
export const skillRevisionFields = {
  agent_id: z.uuid().optional(),
  skill_id: z.uuid(),
  version: z.int().positive(),
  package: skillPackage,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  source_run_id: z.uuid().nullable(),
};
export const skillAssignmentFields = {
  ...scopeFields,
  thread_id: z.uuid().nullable(),
  skill_id: z.uuid(),
  version: z.int().positive(),
  enabled: z.boolean(),
};
export const inheritedSkill = z.strictObject({
  key: z.string().max(200),
  name: skillName,
  location: z.string().max(500),
  package: skillPackage,
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const nativeSkillMetadata = z.strictObject({
  key: z.string().max(300),
  name: z.string().min(1).max(200),
  description: z.string().max(4000),
  native_source: z.string().max(100),
  enabled: z.boolean(),
});
export type NativeSkillMetadata = z.infer<typeof nativeSkillMetadata>;
export const harnessInventoryFields = {
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  connection_id: z.uuid(),
  binding_id: z.uuid(),
  harness,
  state: z.enum(["supported", "unknown"]),
  skills: z.array(inheritedSkill).max(100),
  rejected_packages: z.int().min(0),
  native_catalog: z.array(nativeSkillMetadata).max(500).default([]),
  native_state: z.enum(["supported", "unknown"]).default("unknown"),
};
export const learningCommands = {
  memory_write: memoryWrite,
  memory_delete: memoryDelete,
  memory_query: memoryQuery,
  external_memory_change: externalMemoryChange,
  skill_create: skillCreate,
  skill_revise: skillRevise,
  skill_read: skillRead,
  skill_assign: skillAssign,
};

export const memory = z.strictObject({ ...base, ...memoryFields, kind: z.literal("memory") });
export const skill = z.strictObject({ ...base, ...skillFields, kind: z.literal("skill") });
export const skillRevision = z.strictObject({
  ...base,
  ...skillRevisionFields,
  kind: z.literal("skill_revision"),
});
export const skillAssignment = z.strictObject({
  ...base,
  ...skillAssignmentFields,
  kind: z.literal("skill_assignment"),
});
export const skillMaintenance = z.strictObject({
  ...base,
  ...scopeFields,
  thread_id: z.uuid().nullable(),
  kind: z.literal("skill_maintenance"),
  state: z.enum(["active", "stale", "archived"]),
  locked: z.boolean(),
  restored_at: z.iso.datetime().nullable(),
  last_used_at: z.iso.datetime().nullable().default(null),
});
export const skillMaintenanceAction = z.strictObject({
  context: learningContext,
  skill_id: z.uuid(),
  action: z.enum(["lock", "unlock", "restore"]),
});
export const skillCuratorState = z.strictObject({
  ...base,
  kind: z.literal("skill_curator_state"),
  next_pass_at: z.iso.datetime(),
});
export const skillLibraryReview = z.strictObject({
  active: z.int().nonnegative(),
  stale: z.int().nonnegative(),
  archived: z.int().nonnegative(),
});
export const harnessInventory = z.strictObject({
  ...base,
  ...harnessInventoryFields,
  kind: z.literal("harness_inventory"),
});
