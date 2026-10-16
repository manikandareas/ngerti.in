import { UserButton, useAuth } from "@clerk/tanstack-react-start";
import { LoaderCircle, MessageCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { AgentProfile } from "./agent-profile";
import { Thread } from "./thread";
import { ThreadList } from "./thread-list";
import { useChatHistory } from "./use-chat-history";
import { useChatThreads } from "./use-chat-threads";

interface ChatPageProps {
  selectedThread?: string;
  onSelect: (id: string) => void;
}

export function ChatPage({ selectedThread, onSelect }: ChatPageProps) {
  const { userId } = useAuth();
  const {
    mobile,
    panelOpen,
    drawerOpen,
    setDrawerOpen,
    historyToggle,
    chatArea,
    toggleHistory,
    closePanel,
    closeDrawer,
  } = useChatHistory();
  function selectThread(id: string): void {
    onSelect(id);
    if (mobile) closeDrawer();
  }
  const { threads, search, setSearch, create } = useChatThreads(selectThread);
  const threadId =
    selectedThread ?? threads.data?.threads.find((item) => item.kind === "main")?.id ?? null;
  const list = (
    <ThreadList
      threads={threads.data?.threads ?? []}
      selectedId={threadId}
      search={search}
      onSearch={setSearch}
      onSelect={selectThread}
      onCreate={() => create.mutate()}
      onClose={mobile ? closeDrawer : closePanel}
      creating={create.isPending}
      loading={threads.isPending}
      mobile={mobile}
    />
  );
  return (
    <div className="flex h-dvh overflow-hidden">
      <aside
        className="hidden w-14 shrink-0 flex-col items-center border-r py-4 min-[701px]:flex"
        aria-label="Navigasi utama"
      >
        <div className="h-8 shrink-0" aria-hidden="true" />
        <nav
          className="flex flex-1 flex-col items-center justify-center gap-2"
          aria-label="Menu utama"
        >
          <Button
            ref={historyToggle}
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 rounded-full bg-muted text-foreground hover:bg-muted/80"
            onClick={toggleHistory}
            aria-label={panelOpen ? "Tutup riwayat chat" : "Buka riwayat chat"}
            aria-controls="chat-history-panel"
            aria-expanded={panelOpen}
          >
            <MessageCircle className="size-6" />
          </Button>
        </nav>
        <div className="flex h-8 shrink-0 items-center justify-center">
          <UserButton />
        </div>
      </aside>
      {!mobile && panelOpen ? (
        <aside
          id="chat-history-panel"
          className="flex min-h-0 w-[272px] shrink-0 border-r bg-card max-lg:w-60"
          aria-label="Riwayat chat"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closePanel();
            }
          }}
        >
          {list}
        </aside>
      ) : null}
      <main ref={chatArea} id="main" className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-28 items-start gap-3 bg-linear-to-b from-background via-background/90 to-transparent px-4 pt-4">
          {!(mobile ? drawerOpen : panelOpen) ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="pointer-events-auto h-8 gap-1.5 rounded-full px-3 text-xs"
              onClick={toggleHistory}
              aria-expanded={false}
              aria-controls={mobile ? "chat-history-drawer" : "chat-history-panel"}
            >
              <MessageCircle className="size-3.5" /> Chats
            </Button>
          ) : null}
          <div className="pointer-events-auto absolute left-1/2 top-3 -translate-x-1/2">
            <AgentProfile />
          </div>
          <span className="sr-only">
            {threads.data?.threads.find((item) => item.id === threadId)?.title ?? "Ruang belajarmu"}
          </span>
        </header>
        {create.error ? (
          <p
            role="alert"
            className="my-2.5 rounded-xl bg-danger-subtle px-4 py-3 text-sm text-danger"
          >
            {create.error.message}
          </p>
        ) : null}
        <ChatContent
          threadId={threadId}
          userId={userId}
          error={threads.error}
          onRetry={() => void threads.refetch()}
        />
      </main>
      {mobile ? (
        <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DrawerContent id="chat-history-drawer" className="max-h-[90dvh]">
            <DrawerHeader>
              <DrawerTitle>Percakapan</DrawerTitle>
              <DrawerDescription>Lanjutkan chat atau mulai topik baru.</DrawerDescription>
            </DrawerHeader>
            {list}
          </DrawerContent>
        </Drawer>
      ) : null}
    </div>
  );
}

interface ChatContentProps {
  threadId: string | null;
  userId: string | null | undefined;
  error: Error | null;
  onRetry: () => void;
}

function ChatContent({ threadId, userId, error, onRetry }: ChatContentProps) {
  if (error) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-7 text-center text-muted-foreground">
        <p>{error.message}</p>
        <Button variant="outline" onClick={onRetry}>
          <RefreshCw /> Coba lagi
        </Button>
      </div>
    );
  }
  if (threadId) return <Thread key={`${userId}:${threadId}`} threadId={threadId} />;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-7 text-center text-muted-foreground">
      <LoaderCircle className="animate-spin" />
      <p>Menyiapkan percakapanmu…</p>
    </div>
  );
}
