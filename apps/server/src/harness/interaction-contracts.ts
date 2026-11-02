import { z } from "zod";
import { id } from "../contracts/base";
import { interactionAnswer } from "./contracts";
import { approval, userInput } from "./muse/protocol";

// Bounded display projections only. Opaque provider events and response bodies are excluded.
export const approvalDisplay = approval.extend({
  toolName: z.string().max(200).optional(),
  rawArgs: z.string().max(16000).optional(),
  availableChoices: z
    .array(
      approval.shape.availableChoices.element.extend({
        decision: z.string().max(200),
        scope: z.string().max(200),
        label: z.string().max(1000).optional(),
        rulePreview: z.string().max(8000).optional(),
      }),
    )
    .max(100),
  subject: approval.shape.subject.extend({
    kind: z.string().max(200),
    toolName: z.string().max(200).optional(),
    command: z.string().max(8000).optional(),
    path: z.string().max(4000).optional(),
  }),
});
export const userInputDisplay = userInput.extend({
  questions: z
    .array(
      userInput.shape.questions.element.extend({
        header: z.string().max(500),
        question: z.string().max(8000),
        options: z
          .array(
            z.object({ label: z.string().max(1000), description: z.string().max(4000).optional() }),
          )
          .max(100),
      }),
    )
    .max(100),
});
export const interactionSnapshot = z.strictObject({
  approvals: z.array(approvalDisplay).max(100),
  user_inputs: z.array(userInputDisplay).max(100),
});
const submission = z.strictObject({
  attempt_id: id,
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  answer: interactionAnswer,
  state: z.enum(["submitting", "submitted", "not_dispatched", "unknown"]),
  started_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
  diagnostic: z
    .strictObject({
      code: z.string().regex(/^[A-Z_]+$/),
      category: z.enum(["temporary", "authentication", "configuration", "provider", "unknown"]),
      outcome: z.enum(["not_dispatched", "unknown"]),
    })
    .nullable(),
});
const common = {
  id,
  request_id: z.string().min(1).max(1000),
  anchor_message_id: id.nullable().default(null),
  anchor_text_offset: z.int().nonnegative().nullable().default(null),
  anchor_prefix_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable()
    .default(null),
  observed_at: z.iso.datetime(),
  last_observed_at: z.iso.datetime(),
  observed_state: z.enum(["pending", "not_pending"]),
  submission: submission.nullable(),
};
export const nativeInteraction = z
  .discriminatedUnion("type", [
    z.strictObject({
      ...common,
      type: z.literal("approval"),
      source_index: z.int(),
      request: approvalDisplay,
    }),
    z.strictObject({
      ...common,
      type: z.literal("user_input"),
      source_index: z.null(),
      request: userInputDisplay,
    }),
  ])
  .refine(
    (value) =>
      value.type === "approval"
        ? value.request_id === value.request.approvalId &&
          value.source_index === value.request.currentRequirementId.sourceIndex
        : value.request_id === value.request.userInputId,
    "Interaction identity must match its observed request.",
  )
  .refine(
    (value) =>
      value.anchor_prefix_sha256 === null ||
      (value.anchor_message_id !== null && value.anchor_text_offset !== null),
    "A prefix hash requires an observed message and offset.",
  );
export const nativeInteractionJournal = z.array(nativeInteraction).max(1000).default([]);
export type NativeInteraction = z.infer<typeof nativeInteraction>;
export type InteractionAnswer = z.infer<typeof interactionAnswer>;
export type InteractionSnapshot = z.infer<typeof interactionSnapshot>;
