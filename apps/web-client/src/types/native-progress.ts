export interface NativeProgress {
  plans: {
    id: string;
    text: string | null;
    entries: {
      text: string;
      priority: "high" | "medium" | "low";
      state: "pending" | "in_progress" | "completed";
    }[];
  }[];
  usage: { used: number; size: number; cost: { amount: number; currency: string } | null } | null;
  commands: { name: string; description: string; input_hint: string | null }[];
  compactions: {
    id: string;
    state: "in_progress" | "completed" | "failed" | "cancelled" | "unknown";
    summary: string | null;
    summary_truncated: boolean;
    error: string | null;
  }[];
  file_changes: {
    tool_id: string;
    path: string;
    old_text: string | null;
    new_text: string;
    truncated: boolean;
    provenance: "native_tool_preview";
  }[];
}
