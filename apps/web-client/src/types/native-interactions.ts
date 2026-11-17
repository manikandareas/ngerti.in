/** Bounded display projections from the published Ngertiin API 2.3.0. */
export interface NativeQuestion {
  id: string;
  header: string;
  question: string;
  options: { label: string; description?: string }[];
  selection: { mode: "single" | "multiple"; min?: number; max?: number };
  input?: {
    type: "string" | "number" | "integer" | "boolean" | "array";
    required: boolean;
    choices_only: boolean;
    min_length?: number;
    max_length?: number;
    minimum?: number;
    maximum?: number;
    format?: "email" | "uri" | "date" | "date-time";
  };
}
export interface NativeUserInput {
  userInputId: string;
  questions: NativeQuestion[];
  elicitation?: boolean;
}
export interface NativeApproval {
  approvalId: string;
  toolName?: string;
  rawArgs?: string;
  currentRequirementId: { approvalId: string; sourceIndex: number };
  availableChoices: {
    choiceId: string;
    decision: string;
    scope: string;
    label?: string;
    rulePreview?: string;
  }[];
  subject: { kind: string; toolName?: string; command?: string; path?: string };
}
export interface NativeInteractionSnapshot {
  user_inputs: NativeUserInput[];
  approvals: NativeApproval[];
}
export type NativeInteractionAnswer =
  | { type: "approval"; request_id: string; source_index: number; choice_id: string }
  | {
      type: "user_input";
      request_id: string;
      action?: "accept" | "decline" | "cancel";
      answers: {
        questionId: string;
        freeText?: string;
        selectedLabel?: string;
        selectedLabels?: string[];
      }[];
    };
interface NativeInteractionRecord {
  id: string;
  request_id: string;
  anchor_message_id: string | null;
  /** Immutable first-observed offset measured in UTF-16 code units. */
  anchor_text_offset: number | null;
  anchor_prefix_sha256: string | null;
  observed_at: string;
  last_observed_at: string;
  observed_state: "pending" | "not_pending";
  submission: {
    attempt_id: string;
    fingerprint: string;
    /** Redacted display only. Never reuse this value as a dispatch payload. */
    answer: NativeInteractionAnswer;
    state: "submitting" | "submitted" | "not_dispatched" | "unknown";
    started_at: string;
    updated_at: string;
    diagnostic: {
      code: string;
      category: "temporary" | "authentication" | "configuration" | "provider" | "unknown";
      outcome: "not_dispatched" | "unknown";
    } | null;
  } | null;
}
export type NativeInteraction = NativeInteractionRecord &
  (
    | { type: "approval"; source_index: number; request: NativeApproval }
    | { type: "user_input"; source_index: null; request: NativeUserInput }
  );
export interface NativeInteractionHistory {
  run_id: string;
  run_status: string;
  cancellation: "none" | "requested" | "confirmed";
  coverage: "observed_requests_only";
  records: NativeInteraction[];
}
