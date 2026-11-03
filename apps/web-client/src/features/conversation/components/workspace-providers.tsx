import type { ContextType, ReactNode } from "react";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import type { ConversationPart, Snapshot } from "@/types/workspace";
import { AvatarActivityContext } from "./avatar-activity";
import { InlineReferencesProvider } from "./inline-references";

export function WorkspaceProviders({
  settings,
  activity,
  snapshot,
  parts,
  children,
}: {
  settings: ContextType<typeof SettingsWorkspaceContext>;
  activity: ContextType<typeof AvatarActivityContext>;
  snapshot: Snapshot | null;
  parts: ConversationPart[];
  children: ReactNode;
}) {
  return (
    <SettingsWorkspaceContext.Provider value={settings}>
      <AvatarActivityContext.Provider value={activity}>
        <InlineReferencesProvider snapshot={snapshot} parts={parts}>
          {children}
        </InlineReferencesProvider>
      </AvatarActivityContext.Provider>
    </SettingsWorkspaceContext.Provider>
  );
}
