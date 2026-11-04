import type { Base } from "./workspace";

export interface Machine extends Base {
  state: "unconfigured" | "offline" | "ready" | "unknown";
  root: string;
  generation: number;
  lease: {
    holder: "none" | "agent" | "human";
    agent_id: string | null;
    run_id: string | null;
    revision: number;
    state: "active" | "unknown";
    expires_at: string | null;
  };
}
export interface MachineView {
  viewer_id: string;
  viewer_url: string;
  expires_at: string;
  interactive: boolean;
  control_revision: number;
  machine_id: string;
}
export interface MachineFiles {
  entries: { name: string; path: string; type: string; size_bytes?: number }[];
  next_after: string | null;
}
