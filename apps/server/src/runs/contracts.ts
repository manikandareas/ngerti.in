import { z } from "zod";
import { agentSnapshot } from "../agents/contracts";
import { attachmentObservation } from "../attachments/contracts";
import { base, id, text } from "../contracts/base";
import { nativeInteractionJournal } from "../harness/interaction-contracts";
import { activeTool } from "./activity";

export const runStatus = z.enum([
  "queued",
  "dispatching",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
  "steered",
]);
export const run = z
  .strictObject({
    ...base,
    kind: z.literal("run"),
    thread_id: id,
    agent_id: id,
    input_message_id: id,
    task_id: id.nullable().default(null),
    thread_revision: z.int().positive().nullable().default(null),
    goal_id: id.nullable(),
    routine_id: id.nullable(),
    goal_generation: z.int().positive().nullable().default(null),
    goal_assignment_revision: z.int().positive().nullable().default(null),
    response_mode: z.enum(["answer", "finalize"]).default("answer"),
    tool_errors: z
      .array(z.strictObject({ name: z.string(), code: z.string(), created_at: z.iso.datetime() }))
      .max(50)
      .default([]),
    routine_generation: z.int().positive().nullable().default(null),
    publication: z.enum(["immediate", "deferred", "quiet"]).default("immediate"),
    pending_answer: z.string().max(100_000).nullable().default(null),
    status: runStatus,
    timings: z
      .partialRecord(
        z.enum([
          "preparing_at",
          "ready_at",
          "dispatched_at",
          "accepted_at",
          "first_output_at",
          "settled_at",
        ]),
        z.iso.datetime(),
      )
      .optional(),
    preparation: z
      .strictObject({
        state: z.enum(["preparing", "ready", "retrying", "blocked"]),
        attempts: z.int().positive(),
        next_attempt_at: z.iso.datetime().nullable(),
        configuration_revision: z.string().optional(),
        runtime_revision: z.string().optional(),
      })
      .optional(),
    cancellation: z.enum(["none", "requested", "confirmed"]),
    outcome: z.enum(["none", "succeeded", "failed", "cancelled", "unknown", "steered"]),
    delivery: z.enum(["pending", "steering", "unknown", "delivered", "removed"]).default("pending"),
    activity: z.enum(["idle", "generating", "tool_running", "stopping", "unknown"]).default("idle"),
    active_tools: z.array(activeTool).max(200).default([]),
    diagnostic: z
      .strictObject({
        code: z.string().regex(/^[A-Z_]+$/),
        category: z.enum(["temporary", "authentication", "configuration", "provider", "unknown"]),
        outcome: z.enum(["not_dispatched", "unknown", "failed"]),
      })
      .nullable()
      .default(null),
    native_dispatch_id: z.string().min(1).max(1000).nullable().default(null),
    grant_revision: z.int().positive(),
    dispatch_token: id.nullable(),
    authority_epoch: id.nullable(),
    binding_id: id.nullable(),
    native_run_id: z.string().min(1).max(1000).nullable().default(null),
    native_interactions: nativeInteractionJournal,
    agent_snapshot: agentSnapshot.nullable().default(null),
    workspace_id: id.nullable().default(null),
    workspace_revision: z.int().positive().nullable().default(null),
    product_tools: z.array(z.string().max(200)).max(200).default([]),
    attachment_observations: z.array(attachmentObservation).max(200).default([]),
    sources: z
      .array(
        z.strictObject({
          url: z.url().max(4000),
          title: z.string().max(500),
          operation: z.enum(["search", "openPage", "findInPage"]),
        }),
      )
      .max(100)
      .default([]),
    visual_inputs: z
      .array(
        z.strictObject({
          artifact_id: id,
          source_sha256: z.string().length(64),
          normalized_sha256: z.string().length(64),
          width: z.int().positive(),
          height: z.int().positive(),
        }),
      )
      .max(4)
      .default([]),
    native_tools: z
      .array(
        z.strictObject({
          item_id: z.string().max(1000),
          name: z.string().max(200),
          command: z.string().max(8000).nullable().default(null),
          state: z.enum(["started", "completed", "failed"]),
          exit_code: z.int().nullable(),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((value) => {
    const terminal = ["succeeded", "failed", "cancelled", "unknown", "steered"].includes(
      value.status,
    );
    if (value.outcome !== (terminal ? value.status : "none")) return false;
    if (value.cancellation === "confirmed" && value.status !== "cancelled") return false;
    if (value.status === "cancel_requested" && value.cancellation !== "requested") return false;
    if (value.status === "queued")
      return (
        value.dispatch_token === null && value.binding_id === null && value.authority_epoch === null
      );
    if (["dispatching", "running", "cancel_requested", "unknown"].includes(value.status))
      return (
        value.dispatch_token !== null && value.binding_id !== null && value.authority_epoch !== null
      );
    return true;
  }, "Invalid run state.");
export const steerInput = z
  .strictObject({
    text: text.optional(),
    queued_run_id: id.optional(),
    expected_native_run_id: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (value) => (value.text !== undefined) !== (value.queued_run_id !== undefined),
    "Choose one steering source.",
  );
export const queueEdit = z.strictObject({ expected_revision: z.int().positive(), text });
export const queueDelete = z.strictObject({ expected_revision: z.int().positive() });
export const control = z.strictObject({
  ...base,
  kind: z.literal("control"),
  thread_id: id,
  agent_id: id,
  run_id: id,
  message_id: id,
  queued_run_id: id.nullable(),
  native_run_id: z.string().min(1).max(1000),
  state: z.enum(["requested", "accepted", "rejected", "unknown"]),
  error_code: z
    .string()
    .regex(/^[A-Z_]+$/)
    .nullable(),
});
export const admissionInput = z.strictObject({
  submission_id: id.optional(),
  thread_id: id,
  agent_id: id,
  text,
  goal_id: id.nullable().default(null),
  routine_id: id.nullable().default(null),
  artifact_ids: z.array(id).max(20).default([]),
});
