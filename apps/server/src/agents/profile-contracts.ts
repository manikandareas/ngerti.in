import { z } from "zod";
import { routineInput } from "../goals/contracts";
import { memoryWrite, skillName, skillPackage } from "../learning/contracts";
import { agentInput } from "./contracts";

export const profilePersona = agentInput.pick({
  name: true,
  avatar_config: true,
  soul: true,
  instructions: true,
  harness: true,
});
export const profileRoutine = routineInput.pick({
  name: true,
  instruction: true,
  schedule: true,
  timezone: true,
});
export const profileBackup = z.strictObject({
  memories: z
    .array(
      memoryWrite.pick({ text: true }).extend({ visibility: z.enum(["shared", "dm_private"]) }),
    )
    .max(100),
  routines: profileRoutine.array().max(50),
});
export const portableProfile = z
  .strictObject({
    format: z.literal("ngertiin-agent-profile"),
    version: z.literal(1),
    persona: profilePersona,
    skills: z
      .array(
        z.strictObject({
          name: skillName,
          visibility: z.enum(["shared", "dm_private"]).default("shared"),
          package: skillPackage,
        }),
      )
      .max(50)
      .default([]),
    backup: profileBackup.optional(),
  })
  .refine(
    (profile) =>
      new Set(profile.skills.map((skill) => skill.name)).size === profile.skills.length &&
      Buffer.byteLength(JSON.stringify(profile)) <= 900_000,
    "Duplicate skills or oversized profile.",
  );
export const cloneProfile = profilePersona.pick({ name: true });
export const profileExport = z.strictObject({
  mode: z.enum(["export", "backup"]).default("export"),
});
