export interface TaskAction {
  id: string;
  revision: number;
  kind: "finalize_text" | "finalize_result";
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
  output_spec: Array<{ filename: string; format: string }>;
  result_id: string | null;
  inputs: Array<{
    revision_id: string;
    file_id: string;
    filename: string;
    revision: number;
    sha256: string;
    selection: { start: number; end: number | null; unit: "page" | "line" };
    file_status: string;
    extraction_status: string;
    error: string | null;
    reserved_pages: number;
    charged_pages: number;
    extraction_model: string;
  }>;
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
