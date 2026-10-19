export type ProactiveJudgment = Record<
  string,
  { type: "score" | "noul"; score?: number; confidence?: number; noul?: number }
>;

export type ProactiveCandidate = {
  id: string;
  evaluation_id: string;
  thread_id: string;
  state: "eligible" | "discarded" | "expired";
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
