import { z } from "zod";

export const evidenceFileName = z
  .string()
  .regex(/^[^/\\\r\n]{1,160}$/)
  .refine((name) => !name.includes("\0") && ![".", ".."].includes(name));
export const evidenceExactText = z.string().min(1).max(16_384);
const requirement = z.strictObject({
  title: z.string().trim().min(1).max(160),
  artifact_name: evidenceFileName,
  exact_text: evidenceExactText
    .optional()
    .describe("Exact UTF-8 content, allowing a final line break. Omit to require the file alone."),
});

export const goalVerificationInput = z.strictObject({
  checks: z
    .array(requirement)
    .min(1)
    .max(8)
    .refine((checks) => new Set(checks.map((check) => check.artifact_name)).size === checks.length),
  attempt_limit: z
    .int()
    .min(1)
    .max(20)
    .default(3)
    .describe("Number of settled verification attempts, including the first."),
});

const checkResult = requirement.pick({ title: true, artifact_name: true }).extend({
  status: z.enum(["passed", "missing", "mismatch"]),
  artifact_id: z.uuid().nullable(),
});
export const goalVerification = goalVerificationInput.extend({
  attempts_used: z.int().min(0).max(20),
  last_check: z
    .strictObject({
      run_id: z.uuid(),
      results: z.array(checkResult).min(1).max(8),
    })
    .nullable(),
});
export type GoalVerification = z.infer<typeof goalVerification>;
