import type { Base } from "./workspace";
export interface Goal extends Base {
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  coordinator_agent_id: string | null;
  created_by_agent_id: string | null;
  title: string;
  objective: string;
  verification?: {
    checks: { title: string; artifact_name: string; exact_text?: string }[];
    attempt_limit: number;
    attempts_used: number;
    last_check: {
      run_id: string;
      results: {
        title: string;
        artifact_name: string;
        status: "passed" | "missing" | "mismatch";
        artifact_id: string | null;
      }[];
    } | null;
  } | null;
  progress: string;
  state: "active" | "paused" | "stopped" | "completed";
  work_state: string;
  source_message_ids: string[];
  evidence_artifact_ids: string[];
  continuation_at: string | null;
}
export type Schedule =
  | { type: "once"; at: string }
  | { type: "interval" | "heartbeat"; anchor_at: string; every_ms: number }
  | {
      type: "loop";
      anchor_at?: string;
      every_ms: number;
      self_paced?: { max_every_ms?: number };
      max_runs?: number;
      until?: { artifact_name: string; exact_text: string };
    }
  | { type: "calendar"; local_time: string; weekdays: number[] };
export interface Routine extends Base {
  name: string | null;
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  execution_target: { type: "auto" } | { type: "agent"; agent_id: string } | null;
  assignment_state: string;
  goal_id: string | null;
  instruction: string;
  state: string;
  restore_pending?: boolean;
  schedule: Schedule;
  loop_pacing?: { delay_ms: number } | null;
  loop_progress?: {
    runs: number;
    reason: "condition_met" | "run_limit" | "safety_limit" | "paused_by_user" | null;
  } | null;
  timezone: string;
  monitor?: { metric: string; above: number } | null;
  delivery_target?: { id: string; label: string } | null;
  precheck?:
    | ({
        workspace_id: string;
        source_path: string;
      } & ({ exact_text: string } | { on_change: true } | { source_routine_id: string }))
    | null;
  next_run_at: string | null;
  source_message_id: string | null;
}
export interface Workspace extends Base {
  machine_id?: string | null;
  machine_root?: string | null;
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  name: string;
  project_path: string | null;
  project_directory?: string | null;
  state: "active" | "revoked";
}
export interface Artifact extends Base {
  materialization?: "pending" | "ready";
  thread_id: string;
  agent_id: string | null;
  created_by_agent_id?: string | null;
  workspace_id: string | null;
  run_id: string | null;
  name: string;
  media_type: string;
  size_bytes: number | null;
  sha256: string;
  origin: string;
  source_artifact_id: string | null;
}
export interface AttachmentDocument extends Base {
  artifact_id: string;
  state: "ready" | "partial" | "empty" | "unsupported" | "failed";
}
export interface HumanRequest extends Base {
  thread_id: string;
  agent_id: string;
  task_id: string | null;
  source_run_id: string;
  purpose: string;
  options?: {
    choices: { id: string; label: string }[];
    min: number;
    max: number;
    allow_custom: boolean;
  } | null;
  action?: { tool_name: string; arguments: Record<string, unknown> } | null;
  decision?: "approve" | "reject" | null;
  message_id: string;
  state: string;
  response_message_id: string | null;
  continuation_run_id: string | null;
}
export interface PeerTask extends Base {
  agent_id: string;
  source_agent_id: string | null;
  state: string;
  request_message_id: string;
  current_run_id: string;
  summary: string | null;
}
export interface BrowserProfile extends Base {
  name: string;
  state: string;
  grants: { agent_id: string; thread_id: string; actions: boolean }[];
}
export interface BrowserSession extends Base {
  profile_id: string;
  generation: number;
  state: string;
  active_run_id: string | null;
}
export interface BrowserObservation {
  session: BrowserSession;
  auth: "authenticated" | "required" | "unknown";
  binding: {
    native_session_id: string;
    target_id: string | null;
    tabs: { target_id: string; tab_id: string }[];
  };
  content: ({ type: "text"; text: string } | { type: "image"; data: string; mimeType: string })[];
}
export interface AppConnection extends Base {
  ownership?: "personal" | "organization";
  audience_id?: string | null;
  toolkit: string;
  state: string;
  grants: {
    agent_id: string;
    thread_id: string | null;
    tools: string[];
    resources?: Record<string, (string | number | boolean)[]>;
    action_budget?: { allow_writes: boolean; limit_units: number };
  }[];
}
export interface AppEffect extends Base {
  connection_id: string;
  thread_id: string;
  agent_id: string;
  run_id: string;
  tool: string;
  budget_units?: number;
  state: string;
  error_code: string | null;
  log_id: string | null;
  request_id: string | null;
  result: unknown;
}
