import { useAuth } from "@clerk/tanstack-react-start";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Menu } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { postChatCommand } from "@/features/chat/api/chat-api";
import { AgentProfile } from "@/features/chat/components/agent-profile";
import { Thread } from "@/features/chat/components/thread";
import { ThreadList } from "@/features/chat/components/thread-list";
import { useChatHistory } from "@/features/chat/hooks/use-chat-history";
import { useChatThreads } from "@/features/chat/hooks/use-chat-threads";
import type { ChatThread } from "@/features/chat/types";
import { ResourceProvider } from "@/features/library/components/resource-context";
import { ResourceSurface } from "@/features/library/components/resource-surface";
import { SearchDialog } from "@/features/library/components/search-dialog";
import { libraryCommand } from "@/features/library/hooks/use-library";
import { useResourceView } from "@/features/library/hooks/use-resource-view";
import { AssistantPanel } from "@/features/persona/components/assistant-panel";
import { AssistantSurface } from "@/features/persona/components/assistant-surface";
import { PersonaAvatar } from "@/features/persona/components/persona-avatar";
import { usePersona } from "@/features/persona/hooks/use-persona";
import { DesktopNavigation } from "@/features/workspace/components/workspace-navigation";
import { api } from "@/lib/api";
import type { Goal } from "../types";
import { GoalsSurface } from "./goals-surface";

export function GoalsPage({ initialThread }: { initialThread?: string }) {
  const { getToken, userId } = useAuth();
  const navigate = useNavigate();
  const [threadId, setThreadId] = useState<string | null>(initialThread ?? null);
  const [chatOpen, setChatOpen] = useState(Boolean(initialThread));
  const persona = usePersona();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const assistantTrigger = useRef<HTMLButtonElement>(null);
  const [draftRequest, setDraftRequest] = useState<{ id: string; text: string } | null>(null);
  function closeAssistant() {
    setAssistantOpen(false);
    requestAnimationFrame(() => assistantTrigger.current?.focus());
  }
  const chatHistory = useChatHistory();
  const mobile = chatHistory.mobile;
  const [searchOpen, setSearchOpen] = useState(false);
  function selectThread(id: string) {
    setThreadId(id);
    setChatOpen(true);
    if (mobile) chatHistory.closeDrawer();
    else chatHistory.closePanel();
    void navigate({ to: "/goals", search: { thread: id }, replace: true });
  }
  const history = useChatThreads(selectThread);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!chatOpen || threadId || busy) return;
    const main = history.threads.data?.threads.find((thread) => thread.kind === "main");
    if (main) setThreadId(main.id);
  }, [chatOpen, threadId, busy, history.threads.data]);
  const request = useRef<{
    text: string;
    goal?: Goal;
    key: string;
    threadKey: string;
    threadId?: string;
  } | null>(null);
  const inflight = useRef(false);
  const resource = useResourceView(userId, threadId);
  async function send(text: string, goal?: Goal, retry = false) {
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    setError("");
    setChatOpen(true);
    const pending =
      retry && request.current
        ? request.current
        : {
            text,
            goal,
            key: crypto.randomUUID(),
            threadKey: crypto.randomUUID(),
            threadId: goal?.thread_id ?? threadId ?? undefined,
          };
    request.current = pending;
    try {
      const token = await getToken();
      if (!pending.threadId) {
        const thread = await api<ChatThread>("/chat/threads", token, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_key: pending.threadKey }),
        });
        pending.threadId = thread.id;
      }
      setThreadId(pending.threadId);
      void navigate({ to: "/goals", search: { thread: pending.threadId }, replace: true });
      await libraryCommand(`threads/${pending.threadId}/selection`, token, {
        ref: pending.goal
          ? { kind: "goal", id: pending.goal.id, revision: pending.goal.revision }
          : null,
      });
      await postChatCommand(`/chat/threads/${pending.threadId}/runs`, token, {
        text: pending.text,
        request_key: pending.key,
        inputs: [],
        outputs: [],
        runtime_kind: "text",
      });
      request.current = null;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Pesan belum terkirim. Coba lagi.");
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }
  const historyList = (
    <ThreadList
      threads={history.threads.data?.threads ?? []}
      selectedId={threadId}
      search={history.search}
      onSearch={history.setSearch}
      onSelect={selectThread}
      onCreate={() => history.create.mutate()}
      onClose={mobile ? chatHistory.closeDrawer : chatHistory.closePanel}
      creating={history.create.isPending}
      loading={history.threads.isPending}
      failed={history.threads.isError}
      onRetry={() => void history.threads.refetch()}
      mobile={mobile}
    />
  );
  return (
    <ResourceProvider
      threadId={threadId}
      opened={resource.opened}
      setOpened={(ref) => {
        if (ref) setAssistantOpen(false);
        resource.open(ref);
      }}
      discuss={() => {
        setChatOpen(true);
        resource.discuss();
      }}
      prepare={(text) => void send(text)}
    >
      <main id="main" className="goals-surface relative flex h-dvh overflow-hidden bg-background">
        <DesktopNavigation
          view="goals"
          onSearch={() => setSearchOpen(true)}
          onNavigate={(view) => {
            if (view === "goals") return;
            void navigate({ to: "/", search: { view, thread: threadId ?? undefined } });
          }}
          header={
            <button
              type="button"
              aria-label="Buka percakapan dengan Gwen"
              onClick={() => setChatOpen(true)}
              className="rounded-full [&>img]:size-16 [&>span]:size-16"
            >
              <PersonaAvatar profile={persona.data?.profile} />
            </button>
          }
        />
        {!mobile && chatHistory.panelOpen && chatOpen && (
          <aside
            id="goals-history-panel"
            aria-label="Riwayat chat"
            className="flex min-h-0 w-[272px] shrink-0 bg-muted/60 max-lg:w-60"
          >
            {historyList}
          </aside>
        )}
        {(chatOpen || threadId) && (
          <aside
            ref={chatHistory.chatArea}
            id="goals-chat"
            aria-label="Percakapan tujuan"
            hidden={!chatOpen}
            className={`${chatOpen ? "flex" : "hidden"} relative min-h-0 w-[30%] min-w-[320px] shrink-0 flex-col bg-card/40 max-[700px]:absolute max-[700px]:inset-0 max-[700px]:z-20 max-[700px]:w-full max-[700px]:min-w-0 max-[700px]:bg-background`}
          >
            <header className="chat-floating-header absolute inset-x-0 top-0 z-20 flex h-[104px] items-start justify-center pt-3 [&>div]:pointer-events-auto">
              <div className="absolute left-3 top-4 flex gap-2">
                <button
                  type="button"
                  aria-label="Buka Main chat"
                  disabled={!history.threads.data?.threads.some((thread) => thread.kind === "main")}
                  onClick={() => {
                    const main = history.threads.data?.threads.find(
                      (thread) => thread.kind === "main",
                    );
                    if (main) selectThread(main.id);
                  }}
                  className="flex size-9 items-center justify-center rounded-full bg-muted hover:bg-accent"
                >
                  <ArrowLeft size={21} />
                </button>
                <button
                  ref={chatHistory.historyToggle}
                  type="button"
                  className="flex size-9 items-center justify-center rounded-full bg-muted hover:bg-accent"
                  aria-label="Riwayat percakapan Goals"
                  aria-expanded={mobile ? chatHistory.drawerOpen : chatHistory.panelOpen}
                  aria-controls={mobile ? "goals-history-drawer" : "goals-history-panel"}
                  onClick={chatHistory.toggleHistory}
                >
                  <Menu size={21} />
                </button>
              </div>
              <div className={assistantOpen ? "invisible pointer-events-none" : ""}>
                <AgentProfile
                  triggerRef={assistantTrigger}
                  open={assistantOpen}
                  onClick={() => {
                    resource.open(null);
                    chatHistory.closePanel();
                    setAssistantOpen(true);
                  }}
                />
              </div>
            </header>
            {error && (
              <div
                role="alert"
                className="mx-4 mb-3 rounded-xl bg-danger-subtle p-3 text-sm text-danger"
              >
                <p>{error}</p>
                <button
                  className="mt-2 underline"
                  type="button"
                  disabled={busy}
                  onClick={() => void send("", undefined, true)}
                >
                  Coba kirim lagi
                </button>
              </div>
            )}
            {threadId ? (
              <Thread
                key={threadId}
                threadId={threadId}
                draftRequest={draftRequest ?? undefined}
                onDraftRequestConsumed={() => setDraftRequest(null)}
              />
            ) : (
              <p role="status" className="m-auto px-6 text-sm text-muted-foreground">
                {busy ? "Menyiapkan percakapan…" : "Pilih kategori untuk memulai tujuan."}
              </p>
            )}
          </aside>
        )}
        <GoalsSurface
          onToggleChat={() => setChatOpen(!chatOpen)}
          obscured={chatOpen && mobile}
          split={chatOpen}
          busy={busy}
          onDiscuss={(text, goal) => void send(text, goal)}
        />
        {assistantOpen && (
          <AssistantSurface mobile={mobile} onClose={closeAssistant} overlay>
            <AssistantPanel
              threadId={threadId}
              onClose={closeAssistant}
              onNavigate={(view) =>
                void navigate({ to: "/", search: { view, thread: threadId ?? undefined } })
              }
              onDiscuss={(section, revision) => {
                setDraftRequest({
                  id: crypto.randomUUID(),
                  text: `Aku ingin membahas ${section} (versi ${revision}).`,
                });
                setChatOpen(true);
                closeAssistant();
              }}
            />
          </AssistantSurface>
        )}
        {mobile && (
          <Sheet open={chatHistory.drawerOpen} onOpenChange={chatHistory.setDrawerOpen}>
            <SheetContent
              id="goals-history-drawer"
              side="right"
              className="w-[min(360px,calc(100%-24px))] gap-0"
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                chatHistory.historyToggle.current?.focus();
              }}
            >
              <SheetHeader className="pt-8">
                <SheetTitle>Percakapan</SheetTitle>
                <SheetDescription>Lanjutkan chat atau mulai topik baru.</SheetDescription>
              </SheetHeader>
              {historyList}
            </SheetContent>
          </Sheet>
        )}
        <SearchDialog
          open={searchOpen}
          onOpenChange={setSearchOpen}
          onSelectThread={selectThread}
        />
        <ResourceSurface
          mobile={mobile}
          discussing={resource.discussing}
          discussionRequest={resource.discussionRequest}
          overlay
        />
      </main>
    </ResourceProvider>
  );
}
