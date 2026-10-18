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
  planning_code: "Gwen sedang menyiapkan langkah pengolahan data.",
  provisioning: "Menyiapkan ruang komputasi terisolasi.",
  executing_code: "Menghitung dan mengolah data yang dipilih.",
  collecting_outputs: "Memeriksa dan menyimpan berkas hasil komputasi.",
  sandbox_unknown:
    "Resource komputasi masih diperiksa. Eksekusi baru menunggu cleanup terkonfirmasi.",
  preparing_inputs: "Menunggu isi lampiran siap. Kamu tetap bisa melanjutkan chat.",
  inputs_ready: "Isi lampiran siap. Task akan dilanjutkan.",
  input_deleted: "Input telah dihapus. Task tidak memakai revision pengganti.",
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
