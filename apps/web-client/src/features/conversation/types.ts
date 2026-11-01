// Consumer projections of the published Ngertiin API 1.16.0.
export interface Base {
  id: string;
  revision: number;
  created_at: string;
}
export interface Agent extends Base {
  name: string;
  avatar: string | null;
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
}
export interface Message extends Base {
  thread_id: string;
  author: string;
  author_agent_id: string | null;
  text: string;
  state: string;
  run_id: string | null;
}
export interface Run extends Base {
  input_message_id: string;
  agent_id: string;
  status: string;
  activity: string;
  cancellation: string;
  native_run_id: string | null;
  diagnostic: { code: string; category: string; outcome: string } | null;
  product_tools: string[];
  native_tools: { item_id: string; name: string; state: string }[];
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
  models: { id: string; reasoning: string[] }[];
  capabilities: Record<string, "supported" | "unsupported" | "unknown">;
}
export interface Snapshot {
  cursor: number;
  thread: Thread;
  agents: Agent[];
  messages: Message[];
  runs: Run[];
  has_more: boolean;
  next_before: string | null;
  controls: { id: string; state: string; error_code: string | null }[];
}
export interface Opening {
  recovery: string;
  run: Run | null;
}
export interface Memory extends Base {
  text: string;
  visibility: string;
}
export interface Skills {
  application: (Base & { name: string })[];
  harness: { key: string; name: string; description: string }[];
  native_catalog: { key: string; name: string; description: string; enabled: boolean }[];
  harness_state: string;
  native_state: string;
}
export interface Availability {
  harness: string;
  state: string;
  version: string | null;
  manifest: { minimum_version: string; tested_native_version: string };
}
