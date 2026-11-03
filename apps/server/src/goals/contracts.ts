import { z } from "zod";
import { base, text as domainText } from "../contracts/base";

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
export const routineWrite = z.strictObject({
  routine_id: id,
  expected_revision: z.int().nonnegative(),
  goal_id: id.nullable().default(null),
  instruction: text,
  schedule,
  timezone,
  execution_target: executionTarget.nullable().default(null),
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
  thread_id: id,
  agent_id: id.nullable().default(null),
  goal_id: id.nullable().default(null),
  instruction: domainText,
  schedule,
  timezone,
  execution_target: executionTarget.nullable().default(null),
});
export const routine = routineInput.extend({
  ...base,
  kind: z.literal("routine"),
  ...ownership,
  assignment_state: z.enum(["ready", "waiting_assignment", "blocked"]).default("ready"),
  error_code: z.string().nullable().default(null),
  source_message_id: id.nullable().default(null),
  source_run_id: id.nullable().default(null),
  paused_by_goal: z.boolean().default(false),
  state: z.enum(["active", "paused", "stopped"]),
  generation: z.int().positive(),
  next_run_at: z.iso.datetime().nullable(),
});
export const occurrence = z.strictObject({
  ...base,
  kind: z.literal("occurrence"),
  routine_id: id,
  routine_generation: z.int().positive(),
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
      "failed",
      "cancelled",
      "unknown",
      "waiting_assignment",
      "blocked",
    ])
    .default("queued"),
});
