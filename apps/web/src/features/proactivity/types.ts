export type ProactiveJudgment = Record<
  string,
  { type: "score" | "noul"; score?: number; confidence?: number; noul?: number }
>;

export type ProactiveCandidate = {
  id: string;
  evaluation_id: string;
  thread_id: string;
  state: "eligible" | "delivered" | "discarded" | "expired";
  reason: string;
  expires_at: string;
  rank_score: number;
  judgment: ProactiveJudgment;
  evidence_refs: { key: string; kind: string; id: string; revision: number; hash: string }[];
  payload: {
    title?: string;
    preview?: string;
    why_relevant?: string;
    why_now?: string;
    what_is_new?: string;
    evidence_ids?: string[];
  };
};

export type ProactivityIntensity = "off" | "quiet" | "normal" | "active";
export const intensityLabels = {
  off: "Nonaktif",
  quiet: "Lebih tenang",
  normal: "Normal",
  active: "Lebih aktif",
} as const;

export interface ProactivityScope {
  revision: number;
  intensity: ProactivityIntensity | null;
  snoozed_until: string | null;
}

export interface ProactivityPreference extends ProactivityScope {
  intensity: ProactivityIntensity;
  timezone: string;
  quiet_enabled: boolean;
  quiet_start: number;
  quiet_end: number;
  onboarded_at: string | null;
}

export interface ProactivitySettings {
  preferences: ProactivityPreference;
  scopes: (ProactivityScope & { scope: "thread" | "goal"; scope_id: string; title: string })[];
  deliveries: {
    candidate_id: string;
    thread_id: string;
    thread_title: string;
    title: string | null;
    created_at: string;
  }[];
  pending: number;
}

export type ProactiveList = {
  controls: { enabled: boolean; revision: number };
  delivery_enabled: boolean;
  provider_ready: boolean;
  evaluations: {
    id: string;
    status: string;
    reason: string | null;
    created_at: string;
  }[];
  candidates: ProactiveCandidate[];
};
