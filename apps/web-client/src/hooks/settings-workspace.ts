import { createContext, useContext } from "react";
import type { Agent, Connection } from "@/types/workspace";

export type SettingsWorkspace = {
  agents: Agent[];
  connections: Connection[];
  refresh: () => Promise<unknown>;
  openAgent: (agent: Agent) => void;
};
export const SettingsWorkspaceContext = createContext<SettingsWorkspace | null>(null);
export function useSettingsWorkspace() {
  const workspace = useContext(SettingsWorkspaceContext);
  if (!workspace) throw new Error("Settings requires the workspace layout.");
  return workspace;
}
