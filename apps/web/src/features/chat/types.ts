import type { BackgroundTask } from "@/features/tasks/types";

export interface ChatPart {
  id: string;
  type: "text" | "reasoning" | "tool";
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
  result?: string;
  status?: string;
}
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: ChatPart[];
  status: string;
  run_id: string;
  position?: number;
}
export interface ChatThread {
  id: string;
  kind: "main" | "side";
  title: string;
}
export interface ChatRun {
  id: string;
  request_key?: string;
  status: string;
  error?: string;
  attempt?: number;
}
export interface Approval {
  id: string;
  run_id: string;
  revision: number;
  status: string;
  expires_at: string;
  action: { name: string; args: Record<string, unknown> };
}
export interface Snapshot {
  thread: ChatThread;
  messages: ChatMessage[];
  approvals: Approval[];
  tasks: BackgroundTask[];
  run: ChatRun | null;
  through_seq: number;
  has_more: boolean;
}
export interface ChatEvent {
  version: number;
  thread_id: string;
  seq: number;
  type: "message.upsert" | "run.status" | "approval.upsert" | "task.upsert";
  message?: ChatMessage;
  run?: ChatRun;
  approval?: Approval;
  task?: BackgroundTask;
}
export const activeStatuses = new Set(["queued", "running", "waiting_approval", "cancelling"]);
