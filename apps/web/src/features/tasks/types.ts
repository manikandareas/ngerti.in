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

export const taskStatus: Record<BackgroundTask["status"], string> = {
  queued: "Dalam antrean",
  running: "Sedang dikerjakan",
  waiting_user: "Perlu keputusanmu",
  succeeded: "Selesai",
  failed: "Terhenti",
  cancelled: "Dibatalkan",
};

export const taskStage: Record<string, string> = {
  queued: "Menunggu giliran untuk mulai.",
  drafting: "Gwen sedang menyusun draft.",
  draft_ready: "Draft tersimpan; menyiapkan langkah berikutnya.",
  review: "Periksa draft sebelum difinalisasi. Kamu tetap bisa melanjutkan chat.",
  publishing: "Menyimpan hasil ke percakapan asal.",
  complete: "Hasil tersimpan di task dan percakapan asal.",
  rejected: "Draft ditolak; isinya tetap dapat dibaca.",
  cancelled: "Task dihentikan; bagian yang sudah diterima tetap tersimpan.",
  unknown: "Outcome belum pasti. Periksa status sebelum menjalankan ulang.",
  expired: "Proposal kedaluwarsa. Draft tersimpan dan cadangan kerja yang tersisa dilepas.",
};
