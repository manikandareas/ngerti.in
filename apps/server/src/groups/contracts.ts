import { z } from "zod";
import { base } from "../contracts/base";

const id = z.uuid();
const text = z.string().min(1).max(100_000);
export const groupMessage = z.strictObject({
  text,
  agent_id: id.nullable().default(null),
  router_agent_id: id.nullable().default(null),
});
export const membershipUpdate = z.strictObject({
  expected_revision: z.int().positive(),
  member_agent_ids: z
    .array(id)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const routeResult = z.strictObject({ agent_id: id });
export const routeFields = {
  thread_id: id,
  message_id: id,
  thread_revision: z.int().positive(),
  router_run_id: id.nullable(),
  selected_agent_id: id.nullable(),
  task_id: id.nullable(),
  state: z.enum(["pending", "selected", "rejected", "unknown"]),
  error_code: z.string().nullable(),
};
export const taskFields = {
  goal_ids: z.array(id).max(100).default([]),
  thread_id: id,
  agent_id: id,
  source_agent_id: id.nullable(),
  source_run_id: id.nullable(),
  parent_task_id: id.nullable(),
  root_task_id: id,
  request_message_id: id,
  current_run_id: id,
  state: z.enum([
    "working",
    "waiting_peer",
    "waiting_user",
    "completed",
    "failed",
    "cancelled",
    "unknown",
  ]),
  result_message_id: id.nullable(),
  continuation: z.int().nonnegative(),
};
export const humanRequestFields = {
  thread_id: id,
  agent_id: id,
  task_id: id,
  source_run_id: id,
  purpose: z.enum(["input", "review", "approval"]),
  message_id: id,
  state: z.enum(["pending", "answered", "cancelled"]),
  response_message_id: id.nullable(),
  continuation_run_id: id.nullable(),
};
export const handoffInput = z.strictObject({
  agent_id: id,
  instruction: text,
  purpose: z.enum(["handoff", "review"]),
});
export const askHumanInput = z.strictObject({
  purpose: humanRequestFields.purpose,
  question: text,
});
export const humanReply = z.strictObject({
  expected_revision: z.int().positive(),
  text,
});
export const groupCommands = {
  group_message: groupMessage,
  group_membership: membershipUpdate,
  group_handoff: handoffInput,
  group_ask_user: askHumanInput,
  group_user_reply: humanReply,
};

export const groupRoute = z.strictObject({
  ...base,
  ...routeFields,
  kind: z.literal("group_route"),
});
export const peerTask = z.strictObject({ ...base, ...taskFields, kind: z.literal("peer_task") });
export const humanRequest = z.strictObject({
  ...base,
  ...humanRequestFields,
  kind: z.literal("human_request"),
});
