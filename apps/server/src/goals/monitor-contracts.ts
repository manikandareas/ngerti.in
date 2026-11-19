import { z } from "zod";

export const routineMonitor = z.strictObject({
  metric: z.string().trim().min(1).max(120),
  above: z.number(),
});

export const routineReading = z.strictObject({ value: z.number() });

export const routineObservation = routineReading.extend({
  decision: z.enum(["below_threshold", "already_alerted", "alert"]),
});
