import { useAuth } from "@clerk/tanstack-react-start";
import { MessageCircle, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { WorkspaceState } from "@/components/workspace-state";
import { AgentProfile } from "@/features/chat/components/agent-profile";
import { Thread } from "@/features/chat/components/thread";
import { ThreadList } from "@/features/chat/components/thread-list";
import { useChatHistory } from "@/features/chat/hooks/use-chat-history";
import { useChatThreads } from "@/features/chat/hooks/use-chat-threads";
import { ResourceProvider } from "@/features/library/components/resource-context";
import { ResourceSurface } from "@/features/library/components/resource-surface";
import { SearchDialog } from "@/features/library/components/search-dialog";
import { useResourceView } from "@/features/library/hooks/use-resource-view";
import { AssistantPanel } from "@/features/persona/components/assistant-panel";
import { AssistantSurface } from "@/features/persona/components/assistant-surface";
import type { AssistantTab } from "@/features/persona/types";
import { ContextPanel } from "@/features/workspace/components/context-panel";
import { SettingsDialog } from "@/features/workspace/components/settings-dialog";
import {
  DesktopNavigation,
  MobileNavigation,
} from "@/features/workspace/components/workspace-navigation";
import { workspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { WorkspacePanel } from "./workspace-panel";

interface WorkspacePageProps {
  selectedThread?: string;
  prompt?: string;
  onPromptConsumed?: () => void;
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onSelect: (id: string) => void;
}

export function WorkspacePage({
  selectedThread,
  view: routeView,
  onNavigate: navigateRoute,
  onSelect,
  prompt,
  onPromptConsumed,
}: WorkspacePageProps) {
  const { userId } = useAuth();
  const history = useChatHistory();
  const backgroundView = useRef<WorkspaceView>("chat");
  const settingsTrigger = useRef<HTMLElement | null>(null);
  const settingsOpen = routeView === "settings" || routeView === "usage";
  const view = settingsOpen ? backgroundView.current : routeView;
  useEffect(() => {
    if (!settingsOpen) backgroundView.current = routeView;
  }, [routeView, settingsOpen]);
  function onNavigate(next: WorkspaceView) {
    if (next === "settings" || next === "usage") {
      settingsTrigger.current = document.activeElement as HTMLElement;
    }
    navigateRoute(next);
  }
  const [assistantTab, setAssistantTab] = useState<AssistantTab>("activity");
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draftRequest, setDraftRequest] = useState<{ id: string; text: string }>();
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const focusComposerAfterClose = useRef(false);
  function closeAssistant() {
    setAssistantOpen(false);
    if (!assistantOpen) return;
    requestAnimationFrame(() => {
      if (focusComposerAfterClose.current) {
        focusComposerAfterClose.current = false;
        history.chatArea.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
      } else assistantTrigger.current?.focus();
    });
  }
  function openAssistant(tab: AssistantTab = "activity") {
    setAssistantTab(tab);
    setOpenedResource(null);
    history.closePanel();
    history.closeDrawer();
    setAssistantOpen(true);
  }
  function toggleHistory() {
    if (assistantOpen) closeAssistant();
    history.toggleHistory();
  }
  function navigateFromAssistant(next: WorkspaceView) {
    if (next !== "settings" && next !== "usage") closeAssistant();
    onNavigate(next);
  }
  function discuss(section: string, revision: number) {
    focusComposerAfterClose.current = history.mobile;
    setDraftRequest({
      id: crypto.randomUUID(),
      text: `Aku ingin membahas ${section} versi ${revision}. Bantu aku meninjau perubahan sebelum menerapkannya.`,
    });
    onNavigate("chat");
    if (history.mobile) closeAssistant();
  }
  const previousView = useRef(view);
  useEffect(() => {
    if (view === "chat" && previousView.current !== "chat" && !prompt)
      history.chatArea.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    previousView.current = view;
  }, [view, history.chatArea, prompt]);
  function selectThread(id: string): void {
    onSelect(id);
    if (history.mobile) history.closeDrawer();
  }
  const { threads, search, setSearch, create } = useChatThreads(selectThread);
  const threadId =
    selectedThread ?? threads.data?.threads.find((item) => item.kind === "main")?.id ?? null;
  const resourceView = useResourceView(userId, threadId);
  const openedResource = resourceView.opened;
  const resourceDiscussing = resourceView.discussing;
  const setOpenedResource = resourceView.open;
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
    <ResourceProvider
      opened={openedResource}
      setOpened={(ref) => {
        if (ref) setAssistantOpen(false);
        setOpenedResource(ref);
      }}
      onOpen={() => {
        setSearchOpen(false);
        setAssistantOpen(false);
        history.closePanel();
      }}
      threadId={threadId}
      prepare={(text) => {
        setDraftRequest({ id: crypto.randomUUID(), text });
        onNavigate("chat");
      }}
      discuss={() => {
        resourceView.discuss();
        setSearchOpen(false);
        onNavigate("chat");
        requestAnimationFrame(() =>
          history.chatArea.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
        );
      }}
    >
      <div className="relative flex h-dvh overflow-hidden">
        <DesktopNavigation
          view={view}
          onSearch={() => setSearchOpen(true)}
          onNavigate={(next) => {
            if (next !== "settings" && next !== "usage") {
              setOpenedResource(null);
              closeAssistant();
            }
            onNavigate(next);
          }}
        />
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
          style={
            history.mobile && openedResource && resourceDiscussing
              ? { paddingTop: "45dvh" }
              : undefined
          }
          ref={history.chatArea}
          id="main"
          tabIndex={-1}
          className="relative flex min-h-0 min-w-0 flex-1 flex-col pb-[calc(56px+env(safe-area-inset-bottom))] outline-none min-[701px]:pb-0"
        >
          <header className="chat-floating-header absolute inset-x-0 top-0 z-20 flex h-[104px] items-start justify-between gap-2 px-3 pt-3 min-[701px]:px-4 [&>div]:pointer-events-auto [&>button]:pointer-events-auto">
            <div className="flex min-w-0 max-w-[calc(50%-56px)] flex-1 items-center gap-1">
              <MobileNavigation
                view={view}
                onNavigate={(next) => {
                  if (next !== "settings" && next !== "usage") {
                    setOpenedResource(null);
                    closeAssistant();
                  }
                  onNavigate(next);
                }}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 min-[701px]:hidden"
                aria-label="Cari pekerjaan dan hasil"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="size-5" />
              </Button>
              <Button
                ref={!history.mobile ? history.historyToggle : undefined}
                type="button"
                variant="ghost"
                className="hidden h-9 max-w-[240px] gap-2 rounded-full bg-muted px-3 min-[701px]:inline-flex"
                onClick={toggleHistory}
                aria-label={history.panelOpen ? "Tutup riwayat chat" : "Buka riwayat chat"}
                aria-controls="chat-history-panel"
                aria-expanded={history.panelOpen}
              >
                <MessageCircle className="size-4 shrink-0" />
                <span className="truncate text-sm font-normal">{title}</span>
              </Button>
            </div>
            <div
              className={`absolute left-1/2 -translate-x-1/2 ${assistantOpen ? "invisible pointer-events-none" : ""}`}
            >
              <AgentProfile
                triggerRef={assistantTrigger}
                open={assistantOpen}
                onClick={() => (assistantOpen ? closeAssistant() : openAssistant())}
              />
            </div>
            <Button
              ref={history.mobile ? history.historyToggle : undefined}
              type="button"
              variant="ghost"
              size="icon"
              className="mr-10 size-11 min-[701px]:invisible"
              onClick={toggleHistory}
              aria-label="Buka riwayat chat"
              aria-controls="chat-history-drawer"
              aria-expanded={history.drawerOpen}
            >
              <MessageCircle className="size-5" />
            </Button>
          </header>
          <div className="flex min-h-0 flex-1 flex-col">
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
              <Thread
                key={`${userId}:${threadId}`}
                threadId={threadId}
                draftRequest={prompt ? { id: prompt, text: prompt } : draftRequest}
                onDraftRequestConsumed={() => {
                  setDraftRequest(undefined);
                  if (prompt) onPromptConsumed?.();
                }}
              />
            ) : (
              <WorkspaceState kind="loading" title="Menyiapkan percakapanmu…" />
            )}
          </div>
        </main>
        {view !== "chat" ? (
          <ContextPanel
            title={workspaceLinks.find((item) => item.view === view)?.label ?? "Panel"}
            mobile={history.mobile}
            onClose={() => onNavigate("chat")}
          >
            <WorkspacePanel
              key={view}
              view={view}
              onNavigate={onNavigate}
              threadId={threadId}
              onOpenAssistant={openAssistant}
            />
          </ContextPanel>
        ) : null}
        <SettingsDialog
          open={settingsOpen}
          initialCategory={routeView === "usage" ? "usage" : "general"}
          onClose={() => navigateRoute(backgroundView.current)}
          onRestoreFocus={() => {
            const target = settingsTrigger.current;
            if (target?.isConnected) target.focus();
            else assistantTrigger.current?.focus();
          }}
        />
        <ResourceSurface
          mobile={history.mobile}
          discussing={resourceDiscussing}
          discussionRequest={resourceView.discussionRequest}
          overlay={view !== "chat"}
        />
        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectThread={(id) => {
            selectThread(id);
          }}
        />
        {assistantOpen ? (
          <AssistantSurface
            mobile={history.mobile}
            overlay={view !== "chat"}
            onClose={closeAssistant}
          >
            <AssistantPanel
              key={assistantTab}
              initialTab={assistantTab}
              threadId={threadId}
              onClose={closeAssistant}
              onNavigate={navigateFromAssistant}
              onDiscuss={discuss}
            />
          </AssistantSurface>
        ) : null}
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
    </ResourceProvider>
  );
}
