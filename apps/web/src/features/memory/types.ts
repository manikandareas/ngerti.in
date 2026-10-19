export type MemoryKind = "fact" | "preference" | "observation";
export type MemoryEvidence = {
  id: string;
  source_kind: "message" | "file" | "result" | "editor";
  source_revision: string;
  source_label?: string;
  anchor: string | null;
  available: boolean;
  created_at: string;
};
export type MemoryEntry = {
  id: string;
  revision: number;
  kind: MemoryKind;
  statement: string;
  status: string;
  usable: boolean;
  created_at: string;
  updated_at: string;
  evidence: MemoryEvidence[];
};
export type MemoryList = {
  settings: { capture_enabled: boolean; revision: number };
  entries: MemoryEntry[];
  next_cursor: string | null;
  cleanup_pending: number;
  capture_pending?: number;
};
export type MemoryHistory = {
  revisions: {
    id: string;
    revision: number;
    statement: string | null;
    status: string;
    created_at: string;
  }[];
};
