import type { FileInput, OutputSpec } from "@/features/files/types";
import type { GoalRef } from "@/features/goals/types";

export interface ScheduleSpec {
  title: string;
  instruction: string;
  timezone: string;
  frequency: "once" | "daily" | "weekly" | "interval";
  interval_hours?: number | null;
  start_date: string;
  local_time: string;
  weekdays: number[];
  runtime_kind: "text" | "code" | "browser";
  review_required: boolean;
  per_run_cap: number;
  inputs: FileInput[];
  outputs: OutputSpec[];
  goal?: GoalRef | null;
}
export type ScheduleOperation = "create" | "update" | "pause" | "resume" | "delete" | "run";
export interface Schedule {
  goal_state?: string | null;
  goal_plan_revision?: number | null;
  goal_title?: string | null;
  id: string;
  thread_id: string;
  thread_title: string;
  revision: number;
  state: "active" | "paused" | "deleted";
  spec: ScheduleSpec;
  next_due: string | null;
}
export interface ScheduleProposal {
  id: string;
  thread_id: string;
  expires_at: string;
  preview: {
    goal?: GoalRef & { title: string };
    operation: ScheduleOperation;
    spec: ScheduleSpec;
    target_thread_id: string;
    target_thread_title: string;
    next_times: string[];
    permissions: { scope: string; per_run_cap: number; resource_policy: string };
    inputs: Array<{
      id: string;
      filename: string;
      revision: number;
      start: number;
      end: number | null;
      sha256: string;
    }>;
    execution_policy: string;
    timing_policy: string;
  };
}
export interface ScheduleOccurrence {
  id: string;
  schedule_id: string;
  revision: number;
  title: string;
  thread_id: string;
  task_id: string | null;
  intended_at: string;
  trigger: "scheduled" | "manual";
  outcome: string;
  reason: string | null;
  error: string | null;
  usage_units: number | null;
  budget_cap: number | null;
  result_id: string | null;
}
export interface ScheduleList {
  schedules: Schedule[];
  proposals: ScheduleProposal[];
  occurrences: ScheduleOccurrence[];
}
