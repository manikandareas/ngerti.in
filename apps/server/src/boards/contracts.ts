import { z } from "zod";
import { base, id } from "../contracts/base";

export const newBoardCard = z.strictObject({
  title: z.string().trim().min(1).max(120),
  instruction: z.string().trim().min(1).max(12_000),
  assignee_agent_id: id,
  reviewer_agent_id: id.nullable().optional(),
  dependency_ids: z.array(id).max(20).optional(),
  required_artifact_name: z
    .string()
    .trim()
    .min(1)
    .max(180)
    .refine((name) => name !== "." && name !== ".." && !/[\\/\r\n\0]/.test(name))
    .nullable()
    .default(null),
});

export const boardSubmission = z.strictObject({
  summary: z.string().trim().min(1).max(2_000),
  artifact_ids: z.array(id).max(20),
});
export const boardReview = z.strictObject({
  decision: z.enum(["approve", "request_changes"]),
  findings: z.string().trim().min(1).max(2_000),
});
export const boardBlock = z.strictObject({ blocker: z.string().trim().min(1).max(500) });
export const boardResume = z.strictObject({
  expected_revision: z.int().positive(),
  information: z.string().trim().max(8_000).default(""),
});

export const boardCard = newBoardCard.extend({
  ...base,
  kind: z.literal("board_card"),
  thread_id: id,
  assignee_name: z.string().min(1).max(200),
  reviewer_agent_id: id.nullable().default(null),
  reviewer_name: z.string().min(1).max(200).nullable().default(null),
  state: z.enum(["ready", "waiting", "running", "review", "blocked", "done"]),
  dependency_ids: z.array(id).max(20).default([]),
  input_artifact_ids: z.array(id).max(20).default([]),
  start_requested: z.boolean().default(false),
  current_run_id: id.nullable(),
  claim_heartbeat_at: z.iso.datetime().nullable().default(null),
  submission: boardSubmission.nullable(),
  review_decision: boardReview.nullable().default(null),
  review_feedback: z.string().max(2_000).nullable().default(null),
  resume_context: z.string().max(8_000).default(""),
  result_artifact_ids: z.array(id).max(20),
  blocker: z.string().max(500).nullable(),
});

export const boardArtifactView = z.strictObject({
  id,
  name: z.string(),
  workspace_id: id,
});
