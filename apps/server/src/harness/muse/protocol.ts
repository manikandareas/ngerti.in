import { z } from "zod";

export const nativeId = z.string().min(1).max(1000);
export const item = z.object({
  itemId: nativeId,
  kind: z.string(),
  phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
  turnId: nativeId.nullable().optional(),
  revision: z.int(),
  status: z.string(),
  text: z.string().max(100_000).optional(),
  tool: z.string().max(200).optional(),
});
export const approval = z.object({
  approvalId: nativeId,
  toolName: z.string().optional(),
  rawArgs: z.string().optional(),
  currentRequirementId: z.object({ approvalId: nativeId, sourceIndex: z.int() }),
  availableChoices: z.array(
    z.object({
      choiceId: nativeId,
      decision: z.string(),
      scope: z.string(),
      label: z.string().optional(),
      rulePreview: z.string().optional(),
    }),
  ),
  subject: z.object({
    kind: z.string(),
    toolName: z.string().optional(),
    command: z.string().optional(),
    path: z.string().optional(),
  }),
});
export const userInput = z.object({
  userInputId: nativeId,
  questions: z.array(
    z.object({
      id: nativeId,
      header: z.string(),
      question: z.string(),
      options: z.array(z.object({ label: z.string(), description: z.string().optional() })),
      selection: z.object({
        mode: z.enum(["single", "multiple"]),
        min: z.number().optional(),
        max: z.number().optional(),
      }),
    }),
  ),
});
