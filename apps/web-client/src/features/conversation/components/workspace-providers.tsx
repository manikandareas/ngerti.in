import type { ContextType, ReactNode } from "react";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import type { ConversationPart, Snapshot } from "@/types/workspace";
import { ComposerRequestContext } from "../lib/composer-requests";
import { AvatarActivityContext } from "./avatar-activity";
import { InlineReferencesProvider } from "./inline-references";

export function WorkspaceProviders({
  settings,
  activity,
  snapshot,
  parts,
  children,
  input,
}: {
  settings: ContextType<typeof SettingsWorkspaceContext>;
  activity: ContextType<typeof AvatarActivityContext>;
  snapshot: Snapshot | null;
  parts: ConversationPart[];
  children: ReactNode;
  input?: ContextType<typeof ComposerRequestContext>;
}) {
  return (
    <SettingsWorkspaceContext.Provider value={settings}>
      <AvatarActivityContext.Provider value={activity}>
        <InlineReferencesProvider snapshot={snapshot} parts={parts}>
          <ComposerRequestContext.Provider value={input ?? null}>
            {children}
          </ComposerRequestContext.Provider>
        </InlineReferencesProvider>
      </AvatarActivityContext.Provider>
    </SettingsWorkspaceContext.Provider>
  );
}
