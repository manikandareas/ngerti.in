export interface ComputerState {
  workspace: {
    id: string;
    state: string;
    active_task_id: string | null;
    control: "agent" | "handoff" | "human" | "resuming";
    control_version: number;
    unknown_effect: boolean;
    deadline: string | null;
    retain_until: string;
    error: string | null;
  } | null;
  action: {
    id: string;
    state: string;
    control_version: number;
    expires_at: string;
    decision?: {
      reason_code?: string;
      target?: { label?: string; href?: string; preview?: Array<{ label: string; value: string }> };
    };
    action: {
      kind: string;
      description: string;
      url: string;
      text: string;
      x: number;
      y: number;
      key: string;
      dom?: { operation: string; value: string } | null;
    };
  } | null;
  sessions: Array<{
    id: string;
    state: string;
    charged_microusd: number;
    storage_microusd: number;
    cost_state: string;
  }>;
}
