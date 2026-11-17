import { z } from "zod";

export const activityKind = z.enum([
  "working",
  "searching",
  "reading",
  "updating",
  "creating",
  "browsing",
  "asking_agent",
]);
export const activeTool = z.strictObject({
  call_id: z.string().min(1).max(1200),
  kind: activityKind,
  target_agent_id: z.uuid().nullable().default(null),
});
export type ActiveTool = z.infer<typeof activeTool>;
