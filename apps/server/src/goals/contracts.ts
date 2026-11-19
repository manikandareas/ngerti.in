import { z } from "zod";
import { base, text as domainText } from "../contracts/base";
import { providerSelection } from "../harness/selection-contracts";
import { relativePath } from "../workspaces/contracts";
import { routineDeliverySelection } from "./delivery-contracts";
import { routineMonitor } from "./monitor-contracts";
import {
  evidenceExactText,
  evidenceFileName,
  goalVerification,
  goalVerificationInput,
} from "./verification-contracts";

const id = z.uuid();
const text = z.string().trim().min(1).max(100_000);
export const timezone = z.string().refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, "Invalid timezone.");
export const executionTarget = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("auto") }),
  z.strictObject({ type: z.literal("agent"), agent_id: id }),
]);
const ownership = {
  provider_selection: providerSelection.nullable().optional(),
  scope: z.enum(["agent", "group"]).default("agent"),
  created_by_agent_id: id.nullable().default(null),
};
const periodic = {
  anchor_at: z.iso.datetime(),
  every_ms: z.int().min(1000).max(31_536_000_000),
};
export const schedule = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("once"), at: z.iso.datetime() }),
  z.strictObject({ type: z.literal("interval"), ...periodic }),
  z.strictObject({ type: z.literal("heartbeat"), ...periodic }),
  z
    .strictObject({
      type: z.literal("loop"),
      every_ms: periodic.every_ms,
      anchor_at: z.iso.datetime().optional(),
      self_paced: z
        .strictObject({ max_every_ms: periodic.every_ms.optional() })
        .optional()
        .describe("Double the delay on each identical result, up to the maximum interval."),
      max_runs: z
        .int()
        .positive()
        .max(10_000)
        .optional()
        .describe("Finish after this many checks."),
      until: z
        .strictObject({ artifact_name: evidenceFileName, exact_text: evidenceExactText })
        .optional()
        .describe(
          "Finish only when a successful loop check publishes this file with the exact UTF-8 content.",
        ),
    })
    .refine(
      (value) =>
        value.self_paced?.max_every_ms === undefined ||
        value.self_paced.max_every_ms >= value.every_ms,
      "A self-paced loop's maximum interval must be at least its starting interval.",
    ),
  z.strictObject({
    type: z.literal("calendar"),
    local_time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    weekdays: z
      .array(z.int().min(0).max(6))
      .min(1)
      .max(7)
      .refine((values) => new Set(values).size === values.length),
  }),
]);
export const goalFields = {
  objective: z.string().max(100_000).default(""),
  verification: goalVerification.nullable().default(null),
  checkpoint_evidence: z
    .strictObject({ assignment_revision: z.int().positive(), artifact_ids: z.array(id) })
    .nullable()
    .default(null),
  source_message_ids: z.array(id).max(200).default([]),
  source_run_ids: z.array(id).max(200).default([]),
  progress: z.string().max(100_000).default(""),
  work_state: z
    .enum(["ready", "waiting", "blocked", "waiting_assignment", "completion_pending"])
    .default("ready"),
  coordinator_agent_id: id.nullable().default(null),
  assignment_revision: z.int().positive().default(1),
  assignment_route_id: id.nullable().default(null),
  root_task_id: id.nullable().default(null),
  last_report_error: z.strictObject({ run_id: id, code: z.string() }).nullable().default(null),
  current_run_id: id.nullable().default(null),
  continuation_at: z.iso.datetime().nullable().default(null),
  continuation_instruction: z.string().max(100_000).default(""),
  continuation_sequence: z.int().nonnegative().default(0),
  report_run_id: id.nullable().default(null),
  deferred_by_run_id: id.nullable().default(null),
};
export const captureGoal = z.strictObject({
  goal_id: id,
  expected_revision: z.int().nonnegative(),
  title: z.string().trim().min(1).max(1000),
  objective: text,
  source_message_id: id,
  verification: goalVerificationInput.nullable().optional(),
});
export const reportGoal = z
  .strictObject({
    goal_id: id,
    expected_revision: z.int().positive(),
    progress: text,
    disposition: z.enum(["continue", "scheduled", "wait", "blocked", "completed"]),
    evidence_artifact_ids: z.array(id).max(100).default([]),
    continuation: z
      .strictObject({ at: z.iso.datetime(), instruction: text })
      .nullable()
      .default(null),
  })
  .refine(
    (value) => (value.disposition === "continue") === (value.continuation !== null),
    "Only a continuation has a wake time and instruction.",
  );
export const goalControl = z.strictObject({
  goal_id: id,
  expected_revision: z.int().positive(),
  state: z.enum(["active", "paused", "stopped"]),
});
const routineSource = {
  workspace_id: id,
  source_path: relativePath,
};
export const routinePrecheck = z.union([
  z.strictObject({ ...routineSource, exact_text: z.string().min(1).max(16_384) }),
  z.strictObject({ ...routineSource, on_change: z.literal(true) }),
  z.strictObject({ ...routineSource, source_routine_id: id }),
]);
export const routineCheck = z.strictObject({
  outcome: z.enum([
    "match",
    "mismatch",
    "unavailable",
    "unchanged",
    "recovery_blocked",
    "source_not_ready",
    "source_failed",
    "source_output_missing",
  ]),
  artifact_id: id.nullable(),
  sha256: z.string().length(64).nullable(),
  precheck_revision: z.int().positive().optional(),
  recovery_of: id.optional(),
  source_occurrence_id: id.optional(),
});
export const routineWrite = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("A short, plain-language Routine title, separate from execution instructions.")
    .optional(),
  routine_id: id,
  expected_revision: z.int().nonnegative(),
  goal_id: id.nullable().default(null),
  instruction: text,
  schedule,
  timezone,
  monitor: routineMonitor
    .nullable()
    .optional()
    .describe(
      "Configure an alert when a numeric metric rises above this threshold. Record each observation before producing an alert. A reading at or below the threshold re-arms the alert.",
    ),
  precheck: routinePrecheck
    .nullable()
    .optional()
    .describe(
      "Use exact_text for an exact condition, on_change: true to follow new published snapshots, or source_routine_id to require the named output from another Routine's latest execution in this conversation. The checked workspace snapshot is attached.",
    ),
  execution_target: executionTarget
    .nullable()
    .default(null)
    .describe(
      "Group schedules may select automatically or target an exact current member. For a DM omit this field or use null; the current agent is implicit and auto is invalid.",
    ),
});
export const goalAssignment = z.strictObject({
  goal_id: id,
  expected_revision: z.int().positive(),
  agent_id: id,
});
export const completionRecovery = z.strictObject({
  expected_revision: z.int().positive(),
  evidence_artifact_ids: z.array(id).min(1).max(100),
  progress: text,
});
export const routineControl = z.strictObject({
  routine_id: id,
  expected_revision: z.int().positive(),
  state: z.enum(["active", "paused", "stopped"]),
});
export const goalCommands = {
  capture_goal: captureGoal,
  report_goal: reportGoal,
  control_goal: goalControl,
  assign_goal: goalAssignment,
  write_routine: routineWrite,
  control_routine: routineControl,
};

export const goalInput = z.strictObject({
  thread_id: id,
  agent_id: id.nullable().default(null),
  title: z.string().min(1).max(1000),
});
export const goal = goalInput
  .extend({
    ...base,
    kind: z.literal("goal"),
    ...ownership,
    ...goalFields,
    state: z.enum(["active", "paused", "stopped", "completed"]),
    generation: z.int().positive(),
    evidence_artifact_ids: z.array(id),
  })
  .refine(
    (value) => value.state !== "completed" || value.evidence_artifact_ids.length > 0,
    "Completed goals require evidence.",
  );
export const routineInput = z.strictObject({
  name: z.string().trim().min(1).max(120).nullable().default(null),
  thread_id: id,
  agent_id: id.nullable().default(null),
  goal_id: id.nullable().default(null),
  instruction: domainText,
  schedule,
  timezone,
  execution_target: executionTarget.nullable().default(null),
});
export const routineState = z.enum(["active", "paused", "stopped", "completed"]);
export const routine = routineInput.extend({
  ...base,
  kind: z.literal("routine"),
  ...ownership,
  assignment_state: z.enum(["ready", "waiting_assignment", "blocked"]).default("ready"),
  error_code: z.string().nullable().default(null),
  source_message_id: id.nullable().default(null),
  source_run_id: id.nullable().default(null),
  paused_by_goal: z.boolean().default(false),
  monitor: routineMonitor.nullable().default(null),
  monitor_alert_active: z.boolean().default(false),
  delivery_target: routineDeliverySelection.nullable().default(null),
  precheck: routinePrecheck.nullable().default(null),
  precheck_revision: z.int().positive().default(1),
  precheck_baseline_sha256: z.string().length(64).nullable().default(null),
  loop_pacing: z
    .strictObject({ digest: z.string().length(64), delay_ms: periodic.every_ms })
    .nullable()
    .default(null),
  loop_progress: z
    .strictObject({
      runs: z.int().nonnegative(),
      budget_used: z.int().min(0).max(100),
      resume_at: z.iso.datetime().nullable(),
      reason: z.enum(["condition_met", "run_limit", "safety_limit", "paused_by_user"]).nullable(),
    })
    .nullable()
    .default(null),
  state: routineState,
  restore_pending: z.boolean().optional(),
  generation: z.int().positive(),
  next_run_at: z.iso.datetime().nullable(),
});
export const occurrence = z.strictObject({
  ...base,
  kind: z.literal("occurrence"),
  routine_id: id,
  routine_generation: z.int().positive(),
  trigger: z.enum(["schedule", "manual"]).default("schedule"),
  check: routineCheck.nullable().default(null),
  loop_condition: z
    .strictObject({
      status: z.enum(["matched", "missing", "mismatch", "unavailable"]),
      artifact_id: id.nullable(),
    })
    .nullable()
    .optional(),
  scheduled_for: z.iso.datetime(),
  run_id: id.nullable(),
  route_id: id.nullable().default(null),
  selected_agent_id: id.nullable().default(null),
  state: z
    .enum([
      "pending",
      "routing",
      "queued",
      "running",
      "completed",
      "skipped",
      "failed",
      "cancelled",
      "unknown",
      "waiting_assignment",
      "blocked",
    ])
    .default("queued"),
});
