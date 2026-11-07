import type { ContextType, ReactNode } from "react";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import type { ConversationPart, Snapshot } from "@/types/workspace";
import { ComposerRequestContext } from "../lib/composer-requests";
import { type ContentViewer, ContentViewerContext } from "../lib/content-viewer";
import { AvatarActivityContext } from "./avatar-activity";
import { InlineReferencesProvider } from "./inline-references";

export function WorkspaceProviders({
  settings,
  activity,
  snapshot,
  parts,
  children,
  input,
  viewer,
}: {
  settings: ContextType<typeof SettingsWorkspaceContext>;
  activity: ContextType<typeof AvatarActivityContext>;
  snapshot: Snapshot | null;
  parts: ConversationPart[];
  children: ReactNode;
  input?: ContextType<typeof ComposerRequestContext>;
  viewer?: ContentViewer;
}) {
  return (
    <SettingsWorkspaceContext.Provider value={settings}>
      <AvatarActivityContext.Provider value={activity}>
        <InlineReferencesProvider snapshot={snapshot} parts={parts}>
          <ComposerRequestContext.Provider value={input ?? null}>
            <ContentViewerContext.Provider value={viewer ?? null}>
              {children}
            </ContentViewerContext.Provider>
          </ComposerRequestContext.Provider>
        </InlineReferencesProvider>
      </AvatarActivityContext.Provider>
    </SettingsWorkspaceContext.Provider>
  );
}
