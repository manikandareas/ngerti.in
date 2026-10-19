export interface GoalRef {
  id: string;
  revision: number;
}
export interface GoalSpec {
  title: string;
  target: string;
  criteria: string[];
  horizon: string;
  next_action: string;
  budget_cap: number;
}
export type GoalState = "active" | "paused" | "completed" | "archived";
export type GoalOperation =
  | "create"
  | "update"
  | "pause"
  | "resume"
  | "complete"
  | "archive"
  | "evidence";
export interface Goal {
  id: string;
  thread_id: string;
  thread_title?: string;
  revision: number;
  plan_revision: number;
  state: GoalState;
  spec: GoalSpec;
}
export interface EvidenceInput {
  criterion: number;
  state: "unmet" | "in_progress" | "met";
  note: string;
  task_id?: string;
  result_id?: string;
  result_revision?: number;
}
export interface EvidenceSource {
  kind: "user_report" | "task" | "result";
  task_id?: string;
  revision?: number;
  title?: string;
  status?: string;
  thread_id?: string;
  result_id?: string;
  result_revision?: number;
}
export interface GoalEvidence extends EvidenceInput {
  id: string;
  plan_revision: number;
  source: EvidenceSource;
  available: boolean;
}
export interface GoalProposal {
  id: string;
  thread_id: string;
  goal_id: string | null;
  expires_at: string;
  preview: {
    plan_changed?: boolean;
    operation: GoalOperation;
    spec: GoalSpec;
    previous_spec: GoalSpec | null;
    goal_revision: number | null;
    plan_revision: number;
    state: GoalState;
    policy: string;
    evidence: EvidenceInput | null;
    source: EvidenceSource | null;
  };
}
export interface GoalList {
  goals: Goal[];
  proposals: GoalProposal[];
}
export interface GoalDetail extends Goal {
  evidence: GoalEvidence[];
  met: number;
  needs_review: boolean;
  budget: { used: number; committed: number };
  tasks: Array<{
    id: string;
    title: string;
    thread_id: string;
    status: string;
    goal_revision: number;
    result_id: string | null;
    revision: number;
    usage_units: number;
  }>;
  schedules: Array<{
    id: string;
    revision: number;
    state: string;
    next_due: string | null;
    thread_id: string;
    spec: { title: string; goal: GoalRef };
  }>;
  history: Array<{
    revision: number;
    plan_revision: number;
    state: GoalState;
    spec: GoalSpec;
    operation: GoalOperation;
    created_at: string;
  }>;
  evidence_history: GoalEvidence[];
}
export const goalStateLabels: Record<GoalState, string> = {
  active: "Aktif",
  paused: "Dijeda",
  completed: "Selesai",
  archived: "Diarsipkan",
};
export const goalOperationLabels: Record<GoalOperation, string> = {
  create: "Simpan tujuan",
  update: "Simpan target baru",
  pause: "Jeda tujuan",
  resume: "Lanjutkan tujuan",
  complete: "Selesaikan tujuan",
  archive: "Arsipkan tujuan",
  evidence: "Simpan bukti",
};
export const evidenceLabels = {
  unmet: "Belum terpenuhi",
  in_progress: "Dalam proses",
  met: "Terpenuhi",
};
