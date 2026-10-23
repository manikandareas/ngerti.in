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
  computer_partial:
    "Hasil parsial tersimpan. Tujuan belum selesai seluruhnya; kekurangannya tercantum pada hasil.",
  computer_blocked: "Gwen menyimpan kemajuan dan menunggu bantuan untuk melanjutkan.",
  computer_upgrade_required: "Runtime browser perlu diperbarui. Profil login tetap dipertahankan.",
  upgrade_required: "Pekerjaan perlu diperiksa setelah pembaruan aplikasi. Draft tetap tersedia.",
  restore_required:
    "Pekerjaan dihentikan setelah pemulihan backup. Hasil terdahulu tetap tersedia.",
  computer_starting: "Menyiapkan browser pribadi dan profil tersimpan.",
  computer_continuing: "Progress tersimpan. Gwen melanjutkan langkah berikutnya.",
  computer_correcting: "Gwen sedang memperbaiki keputusan atau format hasil.",
  computer_verifying: "Gwen sedang memeriksa apakah hasil memenuhi permintaanmu.",
  computer_dom: "Gwen sedang membaca dan mengoperasikan halaman browser.",
  computer_observing: "Gwen sedang membaca keadaan layar terbaru.",
  computer_working: "Gwen sedang mengerjakan langkah browser.",
  computer_queue: "Menunggu giliran memakai komputer pribadi.",
  computer_handoff: "Menunggu aksi dan koneksi lama selesai sebelum menyerahkan kendali.",
  computer_human: "Gwen menunggu bantuanmu. Buka komputer untuk mengambil alih atau melanjutkan.",
  computer_resuming: "Gwen membaca perubahanmu sebelum melanjutkan.",
  computer_approval: "Periksa aksi yang diusulkan pada panel komputer.",
  computer_unknown: "Outcome atau penghentian komputer belum pasti. Periksa sebelum melanjutkan.",
  computer_unknown_resolved: "Diperiksa pengguna; aksi yang belum pasti tidak diulang otomatis.",
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

export function taskStatusLabel(task: Pick<BackgroundTask, "status" | "stage">) {
  if (task.stage === "computer_partial") return "Hasil parsial";
  if (task.stage === "rejected") return "Draft ditolak";
  if (task.stage === "expired") return "Persetujuan kedaluwarsa";
  return taskStatus[task.status];
}
