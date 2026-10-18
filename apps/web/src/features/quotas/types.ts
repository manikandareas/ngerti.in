export type QuotaMeter = "chat";

export interface QuotaUsage {
  plan: "free" | "plus";
  period: { starts_at: string; ends_at: string; policy_version: string };
  meters: Record<QuotaMeter, { limit: number; used: number; reserved: number; remaining: number }>;
}
