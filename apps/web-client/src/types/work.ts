import type { Base } from "./workspace";
export interface Goal extends Base {
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  coordinator_agent_id: string | null;
  created_by_agent_id: string | null;
  title: string;
  objective: string;
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
  | { type: "calendar"; local_time: string; weekdays: number[] };
export interface Routine extends Base {
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  execution_target: { type: "auto" } | { type: "agent"; agent_id: string } | null;
  assignment_state: string;
  goal_id: string | null;
  instruction: string;
  state: string;
  schedule: Schedule;
  timezone: string;
  next_run_at: string | null;
  source_message_id: string | null;
}
export interface Workspace extends Base {
  thread_id: string;
  agent_id: string | null;
  scope: "agent" | "group";
  name: string;
  project_path: string | null;
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
  task_id: string;
  source_run_id: string;
  purpose: string;
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
  toolkit: string;
  state: string;
  grants: { agent_id: string; thread_id: string; tools: string[] }[];
}
export interface AppEffect extends Base {
  connection_id: string;
  thread_id: string;
  agent_id: string;
  run_id: string;
  tool: string;
  state: string;
  error_code: string | null;
  log_id: string | null;
  request_id: string | null;
  result: unknown;
}
