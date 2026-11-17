import { z } from "zod";

/** Observed native progress. It never admits Goals, publishes artifacts, or changes grants. */
export const nativeProgress = z.strictObject({
  plans: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(1000),
        text: z.string().max(16000).nullable(),
        entries: z
          .array(
            z.strictObject({
              text: z.string().max(1000),
              priority: z.enum(["high", "medium", "low"]),
              state: z.enum(["pending", "in_progress", "completed"]),
            }),
          )
          .max(100),
      }),
    )
    .max(10),
  usage: z
    .strictObject({
      used: z.number().nonnegative(),
      size: z.number().nonnegative(),
      cost: z
        .strictObject({ amount: z.number().nonnegative(), currency: z.string().min(1).max(50) })
        .nullable(),
    })
    .nullable(),
  commands: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(100),
        description: z.string().max(2000),
        input_hint: z.string().max(1000).nullable(),
      }),
    )
    .max(100),
  compactions: z
    .array(
      z.strictObject({
        id: z.string().min(1).max(1000),
        state: z.enum(["in_progress", "completed", "failed", "cancelled", "unknown"]),
        summary: z.string().max(8000).nullable(),
        summary_truncated: z.boolean(),
        error: z.string().max(1000).nullable(),
      }),
    )
    .max(50),
  file_changes: z
    .array(
      z.strictObject({
        tool_id: z.string().min(1).max(1000),
        path: z.string().min(1).max(4000),
        old_text: z.string().max(4000).nullable(),
        new_text: z.string().max(4000),
        truncated: z.boolean(),
        provenance: z.literal("native_tool_preview"),
      }),
    )
    .max(10),
});
export type NativeProgress = z.infer<typeof nativeProgress>;
