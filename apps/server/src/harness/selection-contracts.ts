import { z } from "zod";
import { base, billingSource, harness, id } from "../contracts/base";

export const providerSelection = z.strictObject({
  connection_id: id,
  connection_generation: z.int().positive(),
  account_id: z.string().nullable(),
  harness,
  // Preserve the exact frozen snapshot shape of runs admitted before provider metadata existed.
  provider_id: z.string().min(1).max(100).nullable().optional(),
  model_id: z.string().min(1).max(200),
  reasoning: z.string().max(100).nullable(),
  billing_source: billingSource,
});
export type ProviderSelection = z.infer<typeof providerSelection>;
export const selectionInput = z
  .strictObject({
    scope: z.enum(["conversation", "user", "organization"]),
    harness,
    thread_id: id.nullable().default(null),
    agent_id: id.nullable().default(null),
    selection: z
      .strictObject({
        connection_id: id,
        model_id: z.string().min(1).max(200),
        reasoning: z.string().max(100).nullable().default(null),
      })
      .nullable(),
  })
  .refine(
    (value) =>
      value.scope === "conversation"
        ? value.thread_id !== null && value.agent_id !== null
        : value.thread_id === null && value.agent_id === null,
    "Invalid selection scope.",
  );
export const aiSelection = z.strictObject({
  ...base,
  kind: z.literal("ai_selection"),
  ...selectionInput.shape,
});
