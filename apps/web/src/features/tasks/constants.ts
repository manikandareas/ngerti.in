import type { BackgroundTask } from "./types";

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
