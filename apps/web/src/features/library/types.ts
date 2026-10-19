export type ResourceKind = "thread" | "task" | "file" | "result" | "goal" | "schedule";
export interface ResourceRef {
  kind: ResourceKind;
  id: string;
  revision?: number | null;
  revision_id?: string | null;
}
export interface ResourceItem {
  ref: ResourceRef;
  title: string;
  status: string;
  thread_id?: string | null;
  updated_at?: string;
  snippet?: string;
}
export interface SearchSpec {
  query: string;
  kinds?: ResourceKind[];
  since?: string;
  until?: string;
  sort?: "relevance" | "recent" | "title";
}
export interface SearchPage {
  items: ResourceItem[];
  next_offset: number | null;
}
export interface ResourceSelection {
  ref: ResourceRef;
  title: string;
  unavailable?: boolean;
}
export const kindLabels: Record<ResourceKind, string> = {
  thread: "Percakapan",
  task: "Pekerjaan",
  file: "File",
  result: "Hasil",
  goal: "Tujuan",
  schedule: "Jadwal",
};

export const resourceStatusLabels: Record<string, string> = {
  ready: "Siap",
  queued: "Dalam antrean",
  running: "Dikerjakan",
  waiting_user: "Perlu keputusan",
  waiting_approval: "Perlu keputusan",
  succeeded: "Selesai",
  failed: "Gagal",
  cancelled: "Dihentikan",
  constructing: "Sedang dibuat",
  updating: "Diperbarui",
  interrupted: "Terhenti",
  active: "Aktif",
  paused: "Dijeda",
  completed: "Selesai",
  archived: "Diarsipkan",
  cancelling: "Menghentikan",
};
