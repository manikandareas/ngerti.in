import { useAuth } from "@clerk/tanstack-react-start";
import { MessageCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DesktopNavigation, MobileNavigation } from "@/features/workspace/workspace-navigation";
import { WorkspacePanel } from "@/features/workspace/workspace-panel";
import { WorkspaceState } from "@/features/workspace/workspace-state";
import type { WorkspaceView } from "@/features/workspace/workspace-views";
import { cn } from "@/lib/utils";
import { AgentProfile } from "./agent-profile";
import { Thread } from "./thread";
import { ThreadList } from "./thread-list";
import { useChatHistory } from "./use-chat-history";
import { useChatThreads } from "./use-chat-threads";

interface ChatPageProps {
  selectedThread?: string;
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onSelect: (id: string) => void;
}

export function ChatPage({ selectedThread, view, onNavigate, onSelect }: ChatPageProps) {
  const { userId } = useAuth();
  const history = useChatHistory();
  const previousView = useRef(view);
  useEffect(() => {
    if (view === "chat" && previousView.current !== "chat") history.chatArea.current?.focus();
    previousView.current = view;
  }, [view, history.chatArea]);
  function selectThread(id: string): void {
    onSelect(id);
    if (history.mobile) history.closeDrawer();
  }
  const { threads, search, setSearch, create } = useChatThreads(selectThread);
  const threadId =
    selectedThread ?? threads.data?.threads.find((item) => item.kind === "main")?.id ?? null;
  const title = threads.data?.threads.find((item) => item.id === threadId)?.title ?? "Percakapanmu";
  const list = (
    <ThreadList
      threads={threads.data?.threads ?? []}
      selectedId={threadId}
      search={search}
      onSearch={setSearch}
      onSelect={selectThread}
      onCreate={() => create.mutate()}
      onClose={history.mobile ? history.closeDrawer : history.closePanel}
      creating={create.isPending}
      loading={threads.isPending}
      failed={threads.isError}
      onRetry={() => void threads.refetch()}
      mobile={history.mobile}
    />
  );
  return (
    <div className="flex h-dvh overflow-hidden">
      <DesktopNavigation view={view} onNavigate={onNavigate} />
      {!history.mobile && history.panelOpen && view === "chat" ? (
        <aside
          id="chat-history-panel"
          className="flex min-h-0 w-[272px] shrink-0 border-r bg-card max-lg:w-60"
          aria-label="Riwayat chat"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              history.closePanel();
            }
          }}
        >
          {list}
        </aside>
      ) : null}
      <main
        ref={history.chatArea}
        id="main"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col outline-none"
      >
        <header className="flex h-[76px] shrink-0 items-center justify-between gap-2 border-b px-3 min-[701px]:px-6">
          <div className="flex min-w-11 items-center gap-1">
            <MobileNavigation view={view} onNavigate={onNavigate} />
            {view === "chat" ? (
              <Button
                ref={!history.mobile ? history.historyToggle : undefined}
                type="button"
                variant="ghost"
                size="icon"
                className="hidden size-11 min-[701px]:inline-flex"
                onClick={history.toggleHistory}
                aria-label={history.panelOpen ? "Tutup riwayat chat" : "Buka riwayat chat"}
                aria-controls="chat-history-panel"
                aria-expanded={history.panelOpen}
              >
                <MessageCircle className="size-5" />
              </Button>
            ) : null}
          </div>
          {view === "chat" ? (
            <div className="min-w-0 text-center">
              <AgentProfile />
              <p className="max-w-[160px] truncate text-xs text-muted-foreground min-[701px]:max-w-xs">
                {title}
              </p>
            </div>
          ) : (
            <span className="text-sm font-bold">Gwen · Ngertiin</span>
          )}
          {view === "chat" ? (
            <Button
              ref={history.mobile ? history.historyToggle : undefined}
              type="button"
              variant="ghost"
              size="icon"
              className="size-11 min-[701px]:invisible"
              onClick={history.toggleHistory}
              aria-label="Buka riwayat chat"
              aria-controls="chat-history-drawer"
              aria-expanded={history.drawerOpen}
            >
              <MessageCircle className="size-5" />
            </Button>
          ) : (
            <span className="w-11" />
          )}
        </header>
        <div className={cn("flex min-h-0 flex-1 flex-col", view !== "chat" && "hidden")}>
          {create.error ? (
            <p
              role="alert"
              className="m-3 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger"
            >
              Chat baru belum dapat dibuat. Periksa koneksi, lalu coba lagi.
            </p>
          ) : null}
          {threads.error && !threads.data ? (
            <WorkspaceState
              kind="error"
              title="Percakapan belum dapat dimuat"
              description="Periksa koneksi lalu coba lagi. Kamu tetap bisa membuka pengaturan dan penggunaan."
              onRetry={() => void threads.refetch()}
            />
          ) : threadId ? (
            <Thread key={`${userId}:${threadId}`} threadId={threadId} />
          ) : (
            <WorkspaceState kind="loading" title="Menyiapkan percakapanmu…" />
          )}
        </div>
        {view !== "chat" ? (
          <WorkspacePanel key={view} view={view} onNavigate={onNavigate} threadId={threadId} />
        ) : null}
      </main>
      {history.mobile ? (
        <Sheet open={history.drawerOpen} onOpenChange={history.setDrawerOpen}>
          <SheetContent
            id="chat-history-drawer"
            side="right"
            className="w-[min(360px,calc(100%-24px))] gap-0"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              history.historyToggle.current?.focus();
            }}
          >
            <SheetHeader className="pt-8">
              <SheetTitle>Percakapan</SheetTitle>
              <SheetDescription>Lanjutkan chat atau mulai topik baru.</SheetDescription>
            </SheetHeader>
            {list}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
