import { useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useDesktopViewport } from "@/lib/use-desktop-viewport";
import { ConversationNavigation } from "./conversation-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  const desktop = useDesktopViewport();
  const conversation = useRouterState({
    select: (state) => state.location.pathname.startsWith("/conversations/"),
  });
  return (
    <div className="app-frame">
      {desktop && <ConversationNavigation />}
      <div className="app-surface">
        {!desktop && !conversation && (
          <header className="flex shrink-0 items-center gap-3 border-b p-3">
            <ConversationNavigation mobile />
            <span className="text-sm font-medium">Ngertiin</span>
          </header>
        )}
        {children}
      </div>
    </div>
  );
}
