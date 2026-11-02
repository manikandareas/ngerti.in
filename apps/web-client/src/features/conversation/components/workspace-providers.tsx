import type { ContextType, ReactNode } from "react";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import { AvatarActivityContext } from "./avatar-activity";

export function WorkspaceProviders({
  settings,
  activity,
  children,
}: {
  settings: ContextType<typeof SettingsWorkspaceContext>;
  activity: ContextType<typeof AvatarActivityContext>;
  children: ReactNode;
}) {
  return (
    <SettingsWorkspaceContext.Provider value={settings}>
      <AvatarActivityContext.Provider value={activity}>{children}</AvatarActivityContext.Provider>
    </SettingsWorkspaceContext.Provider>
  );
}
