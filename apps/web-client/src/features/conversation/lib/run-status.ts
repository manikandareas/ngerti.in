import type { Run } from "@/types/workspace";

const labels: Record<string, string> = {
  queued: "Menunggu giliran",
  dispatching: "Menyiapkan agent",
  running: "Sedang bekerja",
  cancel_requested: "Stop diminta",
  cancelled: "Dihentikan",
  succeeded: "Selesai",
  failed: "Gagal",
  unknown: "Hasil belum diketahui",
  steered: "Arahan diterima",
};
export function runStatusLabel(run: Pick<Run, "status" | "preparation">) {
  if (run.status === "queued") {
    if (run.preparation?.state === "blocked") return "Agent belum siap";
    if (run.preparation?.state === "preparing") return "Menyiapkan agent";
    if (run.preparation?.state === "retrying") return "Menunggu koneksi";
  }
  return labels[run.status] ?? run.status;
}
