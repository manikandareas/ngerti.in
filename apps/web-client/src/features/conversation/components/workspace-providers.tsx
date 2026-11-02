import type { ContextType, ReactNode } from "react";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import type { Snapshot } from "@/types/workspace";
import { AvatarActivityContext } from "./avatar-activity";
import { InlineReferencesProvider } from "./inline-references";

export function WorkspaceProviders({
  settings,
  activity,
  snapshot,
  children,
}: {
  settings: ContextType<typeof SettingsWorkspaceContext>;
  activity: ContextType<typeof AvatarActivityContext>;
  snapshot: Snapshot | null;
  children: ReactNode;
}) {
  return (
    <SettingsWorkspaceContext.Provider value={settings}>
      <AvatarActivityContext.Provider value={activity}>
        <InlineReferencesProvider snapshot={snapshot}>{children}</InlineReferencesProvider>
      </AvatarActivityContext.Provider>
    </SettingsWorkspaceContext.Provider>
  );
}
