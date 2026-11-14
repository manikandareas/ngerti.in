import { avatarColors, avatarFaces, avatarShapes } from "@ngertiin/avatar/catalog";
import { z } from "zod";
import { base, harness, id } from "../contracts/base";

export const avatarConfig = z.strictObject({
  version: z.literal(1),
  seed: z.string().min(1).max(128),
  shape: z.enum(
    Object.keys(avatarShapes) as [keyof typeof avatarShapes, ...Array<keyof typeof avatarShapes>],
  ),
  color: z.enum(
    Object.keys(avatarColors) as [keyof typeof avatarColors, ...Array<keyof typeof avatarColors>],
  ),
  face: z.enum(
    Object.keys(avatarFaces) as [keyof typeof avatarFaces, ...Array<keyof typeof avatarFaces>],
  ),
});

const agentFields = {
  name: z.string().trim().min(1).max(200),
  handle: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .nullable(),
  avatar: z
    .string()
    .max(2000)
    .nullable()
    .describe("Legacy text avatar. Use avatar_config for procedural agent identity."),
  avatar_config: avatarConfig.nullable(),
  soul: z.string().max(100_000),
  skills: z
    .array(
      z.strictObject({
        source: z.enum(["harness", "application"]),
        name: z.string().min(1).max(200),
        revision: z.int().positive().nullable(),
      }),
    )
    .max(100),
  harness,
  connection_id: id.nullable(),
  billing_source: z.enum(["subscription", "api_key"]).nullable(),
  instructions: z.string().max(100_000),
  workspace_id: id.nullable(),
  model_id: z.string().min(1).max(200).nullable(),
  reasoning: z.string().max(100).nullable(),
};
export const agentInput = z.strictObject({
  ...agentFields,
  billing_source: agentFields.billing_source.default(null),
  handle: agentFields.handle.default(null),
  avatar: agentFields.avatar.default(null),
  avatar_config: agentFields.avatar_config.default(null),
  soul: agentFields.soul.default(""),
  skills: agentFields.skills.default([]),
  instructions: agentFields.instructions.default(""),
  workspace_id: agentFields.workspace_id.default(null),
  model_id: agentFields.model_id.default(null),
  reasoning: agentFields.reasoning.default(null),
});
export const agent = agentInput.extend({
  ...base,
  kind: z.literal("agent"),
  ownership: z.enum(["personal", "organization"]).optional(),
  grant_revision: z.int().positive(),
  system_role: z.literal("tobi").nullable().default(null),
  configuration_access: z.enum(["self", "owner"]).default("self"),
});
export const agentUpdate = z.strictObject({
  expected_revision: z.int().positive(),
  changes: z
    .strictObject(agentFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Empty update."),
});
export const agentSnapshot = agentInput.extend({ agent_id: id, revision: z.int().positive() });
