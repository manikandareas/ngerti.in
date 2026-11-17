import { z } from "zod";

// Native configuration imports contain data only. Never inherit extensions, hooks,
// shell credential commands, ambient accounts or another provider's configuration.
export const piProviderConfiguration = z.strictObject({
  baseUrl: z.url().refine((value) => /^https?:\/\//.test(value)),
  api: z.string().regex(/^[a-z][a-z0-9-]{0,99}$/),
  apiKey: z
    .string()
    .min(1)
    .max(16384)
    .refine((value) => !/^[!$]|[\r\n\0]/.test(value)),
  models: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(200),
        name: z.string().max(200).optional(),
        reasoning: z.boolean().optional(),
        input: z.array(z.literal("text")).min(1).max(1).optional(),
        contextWindow: z.int().positive().max(16_777_216).optional(),
        maxTokens: z.int().positive().max(1_048_576).optional(),
      }),
    )
    .min(1)
    .max(32),
});
export type PiProviderConfiguration = z.infer<typeof piProviderConfiguration>;
