import { z } from "zod";

/** Owner diagnostics are separate from public conversation/domain events. */
export const routingDecisionTrace = z.strictObject({
  route_id: z.uuid(),
  attempt_id: z.uuid(),
  policy_version: z.string(),
  events: z
    .array(
      z.strictObject({
        at: z.iso.datetime(),
        phase: z.enum(["focused", "contextual", "reviewing"]),
        input_sha256: z.string().length(64),
        request: z.json(),
        response: z.json().optional(),
        duration_ms: z.int().nonnegative().optional(),
      }),
    )
    .max(4),
});
export type RoutingDecisionTrace = z.infer<typeof routingDecisionTrace>;
