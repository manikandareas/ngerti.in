import { z } from "zod";
import { id } from "../contracts/base";

export const questionOption = z.strictObject({
  id: z.string().min(1).max(100),
  label: z.string().trim().min(1).max(500),
});
export const questionOptions = z
  .strictObject({
    choices: z.array(questionOption).min(1).max(20),
    min: z.int().min(0).max(20).default(1),
    max: z.int().min(1).max(20).default(1),
    allow_custom: z.boolean().default(false),
  })
  .refine(
    (v) =>
      v.min <= v.max &&
      v.max <= v.choices.length &&
      new Set(v.choices.map((c) => c.id)).size === v.choices.length,
    "Invalid selection bounds.",
  );
export const protectedAction = z.strictObject({
  tool_name: z.string().regex(/^ngertiin\.[a-z_]+$/),
  arguments: z.record(z.string(), z.unknown()),
});
export const askUserInput = z
  .strictObject({
    purpose: z.enum(["input", "review", "approval"]),
    question: z.string().trim().min(1).max(16_000),
    options: questionOptions.nullable().default(null),
    action: protectedAction.nullable().default(null),
  })
  .refine(
    (v) => (v.purpose === "approval" ? v.options === null && v.action !== null : v.action === null),
    "An approval requires an exact protected action and no options; other questions cannot bind an action.",
  );
export const interactionReply = z.strictObject({
  expected_revision: z.int().positive(),
  text: z.string().trim().max(16_000).default(""),
  selected_ids: z.array(z.string().max(100)).max(20).default([]),
  decision: z.enum(["approve", "reject"]).nullable().default(null),
});
export const resolveUserInput = z.strictObject({
  command_id: id,
  request_id: id,
  expected_revision: z.int().positive(),
  user_message_id: id,
  disposition: z.enum(["answer", "defer", "cancel"]),
  decision: z.enum(["approve", "reject"]).nullable().default(null),
  evidence: z.string().trim().min(1).max(2000).nullable().default(null),
});
