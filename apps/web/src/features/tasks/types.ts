export interface TaskAction {
  id: string;
  revision: number;
  kind: "finalize_text";
  target_id: string;
  content: string;
  content_hash: string;
  status: string;
  expires_at: string;
  outcome: Record<string, unknown> | null;
}

export interface BackgroundTask {
  id: string;
  thread_id: string;
  source_run_id: string | null;
  title: string;
  instruction: string;
  revision: number;
  review_required: boolean;
  status: "queued" | "running" | "waiting_user" | "succeeded" | "failed" | "cancelled";
  stage: string;
  draft: string;
  result: string | null;
  error: string | null;
  attempt: number;
  model_calls: number;
  budget_cap: number;
  usage_units: number;
  created_at: string;
  updated_at: string;
  action: TaskAction | null;
}

export interface TaskList {
  tasks: BackgroundTask[];
  budget: {
    used: number;
    reserved: number;
    policy: { account_daily_cap: number };
  };
}

export type TaskCommand = "approve" | "reject" | "cancel" | "retry" | "revise" | "reconcile";
