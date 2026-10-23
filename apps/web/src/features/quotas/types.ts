export type QuotaMeter = "chat";

export interface QuotaUsage {
  plan: "free" | "plus";
  unlimited: boolean;
  period: { starts_at: string; ends_at: string; policy_version: string };
  meters: Record<QuotaMeter, { limit: number; used: number; reserved: number; remaining: number }>;
}

export interface ComputeWork {
  id: string;
  kind: string;
  title: string;
  task_id: string | null;
  thread_id: string | null;
  state: "active" | "settled" | "refunded";
  created_at: string;
  cap: number;
  used: number;
  reserved: number;
  pending: number;
  refunded: boolean;
  sponsored: boolean;
}

export interface ComputeUsage {
  plan: "free" | "plus";
  unlimited: boolean;
  policy_version: string;
  period: { starts_at: string; ends_at: string };
  compute: { limit: number; used: number; reserved: number; remaining: number };
  storage: { bytes: number; limit_bytes: number };
  items: ComputeWork[];
  next_offset: number | null;
}

export interface WorkEstimate {
  maximum: number;
  remaining: number;
  available: boolean;
  unlimited: boolean;
  reset_at: string;
  policy_version: string;
  binding: false;
}
