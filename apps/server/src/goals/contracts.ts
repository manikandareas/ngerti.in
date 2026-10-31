import { z } from "zod";

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
  work_state: z.enum(["ready", "waiting", "blocked", "completion_pending"]).default("ready"),
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
  write_routine: routineWrite,
  control_routine: routineControl,
};
