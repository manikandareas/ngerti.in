import type { AvatarConfig } from "@ngertiin/avatar/config";
import type { NativeInteraction } from "./native-interactions";
import type {
  Artifact,
  AttachmentDocument,
  Goal,
  HumanRequest,
  PeerTask,
  Routine,
  Workspace,
} from "./work";
// Consumer projections of the published Ngertiin API 1.29.0.
export interface Base {
  id: string;
  revision: number;
  created_at: string;
}
export interface Agent extends Base {
  name: string;
  handle: string | null;
  avatar: string | null;
  avatar_config?: AvatarConfig | null;
  soul: string;
  instructions: string;
  harness: "codex" | "muse";
  connection_id: string | null;
  model_id: string | null;
  reasoning: string | null;
  billing_source: "subscription" | "api_key" | null;
  system_role: "tobi" | null;
}
export interface Thread extends Base {
  type: "dm" | "group";
  purpose: string;
  name: string | null;
  member_agent_ids: string[];
  creation_operation_id: string | null;
  shared_instructions: string;
}
export interface Message extends Base {
  thread_id: string;
  author: string;
  author_agent_id: string | null;
  text: string;
  state: string;
  run_id: string | null;
  artifact_ids: string[];
  purpose: string;
}
export interface Run extends Base {
  active_tools?: { call_id: string; kind: string; target_agent_id: string | null }[];
  preparation?: {
    state: "preparing" | "ready" | "retrying" | "blocked";
    attempts: number;
    next_attempt_at: string | null;
  };
  timings?: Partial<
    Record<
      | "preparing_at"
      | "ready_at"
      | "dispatched_at"
      | "accepted_at"
      | "first_output_at"
      | "settled_at",
      string
    >
  >;
  input_message_id: string;
  agent_id: string;
  status: string;
  delivery: string;
  activity: string;
  cancellation: string;
  native_run_id: string | null;
  diagnostic: { code: string; category: string; outcome: string } | null;
  product_tools: string[];
  native_tools: { item_id: string; name: string; state: string }[];
  native_interactions: NativeInteraction[];
  sources: { url: string; title: string; operation: string }[];
  publication: string;
  goal_id: string | null;
  routine_id: string | null;
}
export interface AgentActivity {
  active_tools?: Run["active_tools"];
  preparation?: Run["preparation"];
  agent_id: string;
  thread_id: string;
  run_id: string;
  status: string;
  activity: string;
  waiting_for_user: boolean;
}
export interface AgentActivities {
  cursor: number;
  items: AgentActivity[];
}
export interface ConversationPreview {
  thread_id: string;
  latest_message: {
    id: string;
    text: string;
    author: string;
    author_agent_id: string | null;
    has_attachments: boolean;
  } | null;
}
export interface ConversationPreviews {
  cursor: number;
  items: ConversationPreview[];
}
export interface Connection extends Base {
  harness: "codex" | "muse";
  state: string;
  account_id: string | null;
  login: string;
  authentication: { method: string; billing_source: "subscription" | "api_key" };
  effective_billing_source: string;
  inference: string;
  discovery: string;
  models: { id: string; reasoning: string[]; input_modalities?: string[] }[];
  capabilities: Record<string, "supported" | "unsupported" | "unknown">;
}
export interface ConversationActor {
  id: string;
  name: string;
  handle: string | null;
  avatar_config: AvatarConfig | null;
}
export interface ConversationPart {
  id: string;
  sequence: number;
  source_cursor: number;
  thread_id: string;
  created_at: string;
  kind:
    | "message"
    | "goal_created"
    | "goal_completed"
    | "goal_blocked"
    | "goal_paused"
    | "goal_resumed"
    | "goal_stopped"
    | "routine_created"
    | "routine_paused"
    | "routine_resumed"
    | "routine_stopped"
    | "handoff_requested"
    | "handoff_failed";
  message_id: string | null;
  resource_id: string | null;
  source_message_id: string | null;
  actors: ConversationActor[];
  name: string;
  summary: string | null;
}
export interface ConversationTimeline {
  parts: ConversationPart[];
  messages: Message[];
  has_more: boolean;
  next_before: number | null;
}
export interface Snapshot {
  timeline: ConversationTimeline;
  cursor: number;
  thread: Thread;
  agents: Agent[];
  messages: Message[];
  runs: Run[];
  has_more: boolean;
  next_before: string | null;
  controls: { id: string; state: string; error_code: string | null }[];
  workspaces: Workspace[];
  artifacts: Artifact[];
  attachment_documents?: AttachmentDocument[];
  goals: Goal[];
  routines: Routine[];
  human_requests: HumanRequest[];
  tasks: PeerTask[];
  routes: {
    id: string;
    revision: number;
    state: string;
    message_id: string;
    selected_agent_id: string | null;
    error_code: string | null;
    clarification?: string | null;
    execution?: {
      stage:
        | "classifying"
        | "reviewing"
        | "preparing"
        | "retrying"
        | "fallback"
        | "blocked"
        | "reconcile"
        | "selected"
        | "rejected";
      run_id: string | null;
      run_revision: number | null;
      diagnostic: { code: string; category: string; outcome: string } | null;
      retry_preparation: boolean;
    };
  }[];
  occurrences: {
    id: string;
    routine_id: string;
    scheduled_for: string;
    run_id: string | null;
    state: string;
    selected_agent_id: string | null;
  }[];
}
export interface Opening {
  message?: Message | null;
  recovery: string;
  run: Run | null;
}
export interface Memory extends Base {
  text: string;
  visibility: string;
}
export interface Skills {
  application: (Base & {
    name: string;
    assignment: { enabled: boolean; version: number } | null;
  })[];
  harness: { key: string; name: string; description: string }[];
  native_catalog: { key: string; name: string; description: string; enabled: boolean }[];
  harness_state: string;
  native_state: string;
}
export interface Availability {
  harness: string;
  state: string;
  version: string | null;
  manifest: {
    minimum_version: string;
    tested_native_version: string;
    authentication_methods: string[];
  };
}
