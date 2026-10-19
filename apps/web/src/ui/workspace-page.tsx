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
import { SearchPanel } from "@/features/library/components/search-panel";
import type { ResourceRef } from "@/features/library/types";
import { AssistantPanel } from "@/features/persona/components/assistant-panel";
import {
  DesktopNavigation,
  MobileNavigation,
} from "@/features/workspace/components/workspace-navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { cn } from "@/lib/utils";
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
  view,
  onNavigate,
  onSelect,
  prompt,
  onPromptConsumed,
}: WorkspacePageProps) {
  const { userId } = useAuth();
  const history = useChatHistory();
  const [openedResource, setOpenedResource] = useState<ResourceRef | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [draftRequest, setDraftRequest] = useState<{ id: string; text: string }>();
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const assistantRegion = useRef<HTMLElement>(null);
  const focusComposerAfterClose = useRef(false);
  useEffect(() => {
    if (assistantOpen && !history.mobile)
      assistantRegion.current
        ?.querySelector<HTMLButtonElement>('[role="tab"][data-state="active"]')
        ?.focus();
  }, [assistantOpen, history.mobile]);
  function closeAssistant() {
    setAssistantOpen(false);
    assistantTrigger.current?.focus();
  }
  function openAssistant() {
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
    closeAssistant();
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
      history.chatArea.current?.focus();
    previousView.current = view;
  }, [view, history.chatArea, prompt]);
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
    <ResourceProvider
      opened={openedResource}
      setOpened={setOpenedResource}
      onOpen={() => {
        setSearchOpen(false);
        if (assistantOpen) closeAssistant();
        history.closePanel();
      }}
      threadId={threadId}
      discuss={() => {
        setSearchOpen(false);
        onNavigate("chat");
        requestAnimationFrame(() =>
          history.chatArea.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus(),
        );
      }}
    >
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
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11"
                aria-label="Cari pekerjaan dan hasil"
                onClick={() => setSearchOpen(true)}
              >
                <Search className="size-5" />
              </Button>
              {view === "chat" ? (
                <Button
                  ref={!history.mobile ? history.historyToggle : undefined}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="hidden size-11 min-[701px]:inline-flex"
                  onClick={toggleHistory}
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
                <AgentProfile
                  triggerRef={assistantTrigger}
                  open={assistantOpen}
                  onClick={() => (assistantOpen ? closeAssistant() : openAssistant())}
                />
                <p className="max-w-[160px] truncate text-xs text-muted-foreground min-[701px]:max-w-xs">
                  {title}
                </p>
              </div>
            ) : (
              <AgentProfile
                triggerRef={assistantTrigger}
                open={assistantOpen}
                onClick={() => (assistantOpen ? closeAssistant() : openAssistant())}
              />
            )}
            {view === "chat" ? (
              <Button
                ref={history.mobile ? history.historyToggle : undefined}
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 min-[701px]:invisible"
                onClick={toggleHistory}
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
          {view !== "chat" ? (
            <WorkspacePanel
              key={view}
              view={view}
              onNavigate={onNavigate}
              threadId={threadId}
              onOpenAssistant={openAssistant}
            />
          ) : null}
        </main>
        <ResourceSurface mobile={history.mobile} />
        <Sheet open={searchOpen} onOpenChange={setSearchOpen}>
          <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
            <SheetHeader className="border-b pr-12">
              <SheetTitle>Cari pekerjaan dan hasil</SheetTitle>
              <SheetDescription>
                Temukan percakapan, pekerjaan, file, hasil, tujuan, atau jadwal.
              </SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <SearchPanel />
            </div>
          </SheetContent>
        </Sheet>
        {assistantOpen && !history.mobile ? (
          <aside
            ref={assistantRegion}
            id="assistant-panel"
            aria-label="Panel asisten"
            className="min-h-0 w-[min(440px,46vw)] shrink-0 border-l bg-background"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                closeAssistant();
              }
            }}
          >
            <AssistantPanel
              onClose={closeAssistant}
              onNavigate={navigateFromAssistant}
              onDiscuss={discuss}
            />
          </aside>
        ) : null}
        {history.mobile ? (
          <Sheet open={assistantOpen} onOpenChange={setAssistantOpen}>
            <SheetContent
              id="assistant-panel"
              showCloseButton={false}
              className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                if (focusComposerAfterClose.current) {
                  focusComposerAfterClose.current = false;
                  history.chatArea.current
                    ?.querySelector<HTMLTextAreaElement>('textarea[aria-label="Pesan untuk Gwen"]')
                    ?.focus();
                } else assistantTrigger.current?.focus();
              }}
            >
              <SheetHeader className="sr-only">
                <SheetTitle>Asisten personalmu</SheetTitle>
                <SheetDescription>
                  Aktivitas, jadwal mendatang, profil, karakter dan ingatan.
                </SheetDescription>
              </SheetHeader>
              <AssistantPanel
                onClose={closeAssistant}
                onNavigate={navigateFromAssistant}
                onDiscuss={discuss}
              />
            </SheetContent>
          </Sheet>
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
