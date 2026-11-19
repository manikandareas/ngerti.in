import { z } from "zod";
import { base } from "../contracts/base";
import {
  askUserInput,
  interactionReply,
  protectedAction,
  questionOptions,
} from "../interactions/contracts";
import { run } from "../runs/contracts";

const id = z.uuid();
const text = z.string().min(1).max(100_000);
export const groupMessage = z
  .strictObject({
    text: z.string().max(100_000).default(""),
    artifact_ids: z.array(id).max(20).default([]),
    submission_id: id.nullable().default(null),
    agent_id: id.nullable().default(null),
    router_agent_id: id.nullable().default(null),
  })
  .refine(
    (v) => v.text.trim().length > 0 || v.artifact_ids.length > 0,
    "A message requires text or attachments.",
  );
export const routeRetry = z.strictObject({
  expected_revision: z.int().positive(),
  agent_id: id.nullable().default(null),
});
export const membershipUpdate = z.strictObject({
  expected_revision: z.int().positive(),
  member_agent_ids: z
    .array(id)
    .min(1)
    .max(100)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const routeResult = z.union([
  z.strictObject({ agent_id: id }),
  z.strictObject({
    unresolved: z.literal(true),
    question: z.string().trim().min(1).max(1000).optional(),
  }),
]);
export const routeFields = {
  selection_only: z.boolean().default(false),
  thread_id: id,
  message_id: id,
  context_message_id: id.optional(),
  thread_revision: z.int().positive(),
  router_run_id: id.nullable(),
  selected_agent_id: id.nullable(),
  task_id: id.nullable(),
  state: z.enum(["pending", "selected", "rejected", "unknown"]),
  error_code: z.string().nullable(),
  clarification: z.string().max(1000).nullable().optional(),
  routing: z
    .strictObject({
      provider: z.enum(["jev", "member"]),
      attempt_id: id.nullable(),
      router_agent_id: id,
      request_revision: z.int().positive(),
      candidate_revisions: z.record(id, z.int().positive()),
      started_at: z.iso.datetime().nullable(),
      completed_at: z.iso.datetime().nullable(),
      duration_ms: z.int().nonnegative().nullable(),
      model: z.string().nullable(),
      confidence: z.number().min(0).max(1).nullable(),
      input_tokens: z.int().nonnegative().nullable(),
      probabilities: z.record(z.string(), z.number().min(0).max(1)).optional(),
      fallback_reason: z.enum(["ambiguous", "configuration"]).nullable(),
      policy_version: z.string().optional(),
      variant: z.enum(["single", "batch", "semantic"]).optional(),
      input_sha256: z.string().length(64).optional(),
      routing_kind: z.string().optional(),
      recipient_probability: z.number().min(0).max(1).optional(),
      context_version: z.string().optional(),
      context_scope: z.enum(["focused", "shared"]).optional(),
      model_calls: z.int().min(1).max(2).optional(),
      needs_context_probability: z.number().min(0).max(1).optional(),
      review_support: z.number().min(0).max(1).optional(),
      review_role: z.string().optional(),
      requested_peer_id: id.nullable().optional(),
      selection_basis: z.string().optional(),
      review_recipient_id: id.nullable().optional(),
      delegation_probability: z.number().min(0).max(1).optional(),
      phase: z.enum(["focused", "contextual", "reviewing", "completed"]).optional(),
      evidence: z
        .strictObject({
          top_probability: z.number(),
          margin: z.number(),
          reason: z.enum([
            "unresolved",
            "confidence",
            "probability",
            "margin",
            "recipient",
            "review",
            "context",
            "accepted",
          ]),
        })
        .optional(),
    })
    .optional(),
};
export const taskFields = {
  goal_ids: z.array(id).max(100).default([]),
  goal_generations: z.record(id, z.int().positive()).default({}),
  summary: z.string().max(240).nullable().default(null),
  result_artifact_ids: z.array(id).max(100).default([]),
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
  continuation_mode: z.enum(["synthesize", "finalize", "complete"]).default("synthesize"),
};
export const humanRequestFields = {
  thread_id: id,
  agent_id: id,
  task_id: id.nullable(),
  source_run_id: id,
  purpose: z.enum(["input", "review", "approval"]),
  message_id: id,
  state: z.enum(["pending", "answered", "cancelled"]),
  response_message_id: id.nullable(),
  continuation_run_id: id.nullable(),
  options: questionOptions.nullable().default(null),
  action: protectedAction.nullable().default(null),
  action_fingerprint: z.string().length(64).nullable().default(null),
  decision: z.enum(["approve", "reject"]).nullable().default(null),
  decision_evidence: z.string().max(2000).nullable().default(null),
  decision_source: z.enum(["owner", "conversation"]).nullable().default(null),
  effect_command_id: id.nullable().default(null),
};
export const handoffInput = z.strictObject({
  agent_id: id,
  instruction: text,
  purpose: z.enum(["handoff", "review"]),
  parallel: z
    .boolean()
    .optional()
    .describe(
      "Enable only for an independent read-only check by a Pi peer. Assign each independent check to a distinct peer in this turn, use synthesize, then finish the turn. Parallel checks can read their attached inputs and cannot change files or apps.",
    ),
  attachment_ids: z
    .array(id)
    .max(20)
    .optional()
    .describe("For a parallel check, optionally select a subset of the source task's attachments."),
  time_budget_seconds: z
    .int()
    .min(1)
    .max(3600)
    .optional()
    .describe("Optional elapsed-time limit for a parallel read-only check, excluding queue time."),
  summary: z.string().trim().min(1).max(240).nullable().default(null),
  announcement: z.string().trim().min(1).max(16_000).nullable().default(null),
  continuation: z
    .enum(["synthesize", "finalize", "complete"])
    .default("synthesize")
    .describe(
      "Use complete for an ordinary task without a Goal when the peer will deliver the entire remaining answer; this closes the parent task without another inference if the peer succeeds with useful output. Use synthesize for a combined response or finalize for Goal bookkeeping that requires its coordinator.",
    ),
});
export const askHumanInput = askUserInput;
export const humanReply = interactionReply;
export const groupCommands = {
  group_message: groupMessage,
  group_route_retry: routeRetry,
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
export const groupRouteView = groupRoute.extend({
  execution: z.strictObject({
    stage: z.enum([
      "classifying",
      "reviewing",
      "preparing",
      "retrying",
      "fallback",
      "blocked",
      "reconcile",
      "selected",
      "rejected",
    ]),
    run_id: id.nullable(),
    run_revision: z.int().positive().nullable(),
    diagnostic: run.shape.diagnostic,
    retry_preparation: z.boolean(),
  }),
});
export const peerTask = z.strictObject({ ...base, ...taskFields, kind: z.literal("peer_task") });
export const humanRequest = z.strictObject({
  ...base,
  ...humanRequestFields,
  kind: z.literal("human_request"),
});
