import { z } from "zod";
import { avatarConfig } from "../agents/contracts";
import { id } from "../contracts/base";

export const conversationActor = z.strictObject({
  id,
  name: z.string(),
  handle: z.string().nullable(),
  avatar_config: avatarConfig.nullable(),
});
export const conversationPart = z.strictObject({
  id: z.string().min(1).max(240),
  sequence: z.int().positive(),
  source_cursor: z.int().nonnegative(),
  thread_id: id,
  created_at: z.iso.datetime(),
  kind: z.enum([
    "message",
    "goal_created",
    "goal_completed",
    "goal_blocked",
    "goal_paused",
    "goal_resumed",
    "goal_stopped",
    "routine_created",
    "routine_paused",
    "routine_resumed",
    "routine_stopped",
    "handoff_requested",
    "handoff_failed",
  ]),
  message_id: id.nullable(),
  resource_id: id.nullable(),
  source_message_id: id.nullable(),
  actors: z.array(conversationActor).max(2),
  name: z.string().max(1000),
  summary: z.string().max(1000).nullable(),
});
export type ConversationPart = z.infer<typeof conversationPart>;
