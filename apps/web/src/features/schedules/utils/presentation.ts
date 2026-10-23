import type { ScheduleSpec } from "@/features/schedules/types";

export const operationLabels = {
  create: "Aktifkan jadwal",
  update: "Simpan perubahan",
  pause: "Jeda jadwal",
  resume: "Lanjutkan jadwal",
  delete: "Hapus jadwal",
  run: "Jalankan sekarang",
};
export const outcomeLabels: Record<string, string> = {
  pending: "Menunggu",
  queued: "Mengantre",
  running: "Berjalan",
  waiting_user: "Perlu keputusanmu",
  succeeded: "Selesai",
  failed: "Gagal",
  cancelled: "Dihentikan",
  skipped: "Dilewati",
  blocked_budget: "Batas kerja habis",
};
export function timeLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: timezone,
  }).format(new Date(value));
}
export function recurrenceLabel(spec: ScheduleSpec) {
  if (spec.frequency === "interval")
    return `Setiap ${spec.interval_hours} jam · mulai ${spec.start_date} ${spec.local_time} · ${spec.timezone}`;
  const days = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
  return `${spec.frequency === "once" ? `Sekali · ${spec.start_date}` : spec.frequency === "daily" ? "Setiap hari" : spec.weekdays.map((day) => days[day]).join(", ")} · ${spec.local_time} · ${spec.timezone}`;
}
