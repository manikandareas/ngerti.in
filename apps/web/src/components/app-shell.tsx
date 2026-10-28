import type { ReactNode } from "react";
import { ConversationNavigation } from "./conversation-navigation";
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <ConversationNavigation />
      <div className="app-surface">
        <header className="flex shrink-0 items-center gap-3 border-b p-3 md:hidden">
          <ConversationNavigation mobile />
          <span className="text-sm font-medium">Ngertiin</span>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
