import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowDown, SlidersHorizontal, Target } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type Components, defaultComponents, Streamdown } from "streamdown";
import { ChatMessage, LoadingState } from "@/components/beautiful-ui/conversation";
import { ConversationNavigation } from "@/components/conversation-navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import { GroupAvatar } from "@/features/agents/group-avatar";
import { PortableExport } from "@/features/agents/portable-export";
import { ThreadInfo } from "@/features/agents/thread-info";
import { providerFailureMessage } from "@/features/connections/client";
import { ConversationConnections } from "@/features/connections/conversation-connections";
import { useDesktopViewport } from "@/lib/use-desktop-viewport";
import { ArtifactResults } from "./artifact-results";
import { ClarificationPrompts } from "./clarification-prompts";
import { command, submit } from "./client";
import { CollaborationProgress } from "./collaboration-progress";
import { Composer } from "./composer";
import { GoalProgress } from "./goal-progress";
import { HistoryControls } from "./history-controls";
import { LearningControls } from "./learning-controls";
import { RetryRun } from "./retry-run";
import { ScreenControls } from "./screen-controls";
import { SessionControls } from "./session-controls";
import { activeRun, type Run, runLabels } from "./state";
import { useDirectMessage } from "./use-direct-message";
import { useReadState } from "./use-read-state";
import { WorkspaceControls } from "./workspace-controls";

export function DirectMessagePage({ threadId }: { threadId: string }) {
  const { getToken } = useAuth();
  const desktop = useDesktopViewport();
  const { snapshot, connection, error, refresh, loadEarlier, loadingEarlier } =
    useDirectMessage(threadId);
  const [cancelError, setCancelError] = useState("");
  const [stopping, setStopping] = useState<string | null>(null);
  const cancels = useRef(new Map<string, ReturnType<typeof command>>());
  const scroll = useRef<HTMLElement>(null);
  const surface = useRef<HTMLElement>(null);
  const topEdge = useRef<HTMLDivElement>(null);
  const bottomEdge = useRef<HTMLElement>(null);
  const follow = useRef(true);
  const historyAnchor = useRef<{ height: number; top: number } | null>(null);
  const [away, setAway] = useState(false);
  useReadState(threadId, snapshot?.messages.at(-1)?.message_seq, away);
  const [panel, setPanel] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const agent = snapshot?.thread.agents[0];
  const group = snapshot?.thread.kind === "group";
  const nameOf = (id?: string) =>
    snapshot?.thread.agents.find((a) => a.agent_id === id)?.display_name ?? "Agent";
  const working = snapshot?.runs.some(activeRun) ?? false;
  useEffect(() => {
    if (snapshot && historyAnchor.current && scroll.current && !loadingEarlier) {
      scroll.current.scrollTop =
        historyAnchor.current.top + scroll.current.scrollHeight - historyAnchor.current.height;
      historyAnchor.current = null;
    } else if (snapshot && follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot, loadingEarlier]);
  useLayoutEffect(() => {
    const root = surface.current;
    const top = topEdge.current;
    const bottom = bottomEdge.current;
    if (!root || !top || !bottom) return;
    const resize = () => {
      root.style.setProperty("--conversation-top", `${top.offsetHeight}px`);
      root.style.setProperty("--conversation-bottom", `${bottom.offsetHeight}px`);
      if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(top);
    observer.observe(bottom);
    return () => observer.disconnect();
  }, []);
  async function cancel(run: Pick<Run, "run_id">) {
    if (stopping) return;
    setStopping(run.run_id);
    setCancelError("");
    const body =
      cancels.current.get(run.run_id) ??
      command("run.cancel", { run_id: run.run_id, reason: "Stopped by the user" });
    cancels.current.set(run.run_id, body);
    try {
      await submit(body, await getToken());
    } catch {
      setCancelError("Permintaan berhenti belum terkonfirmasi. Coba hentikan kembali.");
    } finally {
      setStopping(null);
    }
  }
  const connectionText = {
    connecting: "Menyambungkan…",
    connected: "Tersambung",
    reconnecting: "Menyambungkan kembali… Pekerjaan tetap berjalan di server.",
    error: "Koneksi terputus",
  }[connection];
  return (
    <main
      id="main"
      ref={surface}
      className="conversation-surface relative grid min-h-0 flex-1"
      aria-label={group ? "Percakapan grup" : "Percakapan langsung"}
    >
      <div ref={topEdge} className="conversation-edge conversation-edge-top">
        <ConversationFade />
        <header className="relative flex h-[92px] shrink-0 items-center gap-1 px-3 py-1.5 md:justify-center md:px-8">
          {!desktop && <ConversationNavigation mobile />}
          <div className="absolute left-1/2 flex min-w-0 max-w-[calc(100%-12rem)] -translate-x-1/2 translate-y-1 flex-col items-center justify-center gap-1 md:static md:max-w-none md:flex-1 md:translate-x-0">
            {group ? (
              <GroupAvatar agents={snapshot?.thread.agents ?? []} />
            ) : (
              <AgentAvatar
                name={agent?.display_name ?? ""}
                url={agent?.config.avatar_url}
                className="size-8 text-sm md:size-10 md:text-base"
              />
            )}
            <div className="min-w-0 max-w-full text-center">
              <h1 className="max-w-full truncate rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-sm font-medium text-secondary-foreground md:max-w-64 [overflow-wrap:anywhere]">
                {group || snapshot?.thread.title_customized
                  ? snapshot?.thread.title
                  : (agent?.display_name ?? "Percakapan langsung")}
              </h1>
              <p className="sr-only">
                {group
                  ? snapshot?.thread.agents.map((a) => `@${a.handle}`).join(" · ")
                  : agent
                    ? `@${agent.handle} · DM`
                    : "Memuat agent…"}
              </p>
            </div>
          </div>
          <div className="ml-auto flex items-center md:absolute md:right-4 md:top-5">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Opsi percakapan"
              title="Opsi percakapan"
              aria-expanded={toolsOpen}
              aria-controls="conversation-tools"
              onClick={() => setToolsOpen(!toolsOpen)}
            >
              <SlidersHorizontal className="size-4" />
            </Button>
            {snapshot && <ThreadInfo thread={snapshot.thread} refresh={refresh} />}
          </div>
        </header>
        <div id="conversation-tools" hidden={!toolsOpen} className="shrink-0 px-4 sm:px-6">
          <nav aria-label="Alat percakapan" className="flex flex-wrap justify-end gap-1 py-2">
            <Dialog open={panel} onOpenChange={setPanel}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm">
                  <Target className="size-4" />
                  Goals{snapshot?.goals?.length ? ` · ${snapshot.goals.length}` : ""}
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85dvh] overflow-y-auto rounded-[20px] sm:max-w-[480px]">
                <DialogHeader>
                  <DialogTitle>Goals dan jadwal</DialogTitle>
                  <DialogDescription className="sr-only">
                    Agent menangkap tujuan dari percakapan. Ubah, jeda, atau lanjutkan dengan
                    mengirim pesan.
                  </DialogDescription>
                </DialogHeader>
                <div className="px-4 pb-6">
                  {snapshot && (
                    <GoalProgress
                      onNavigate={() => setPanel(false)}
                      goals={snapshot.goals ?? []}
                      messages={snapshot.messages}
                      agents={snapshot.thread.agents}
                    />
                  )}
                  {!snapshot?.goals?.length && (
                    <p className="py-6 text-sm text-muted-foreground">
                      Belum ada goal. Ceritakan hasil yang ingin kamu capai di percakapan.
                    </p>
                  )}
                </div>
              </DialogContent>
            </Dialog>
            {snapshot && <LearningControls key={`learning:${threadId}`} thread={snapshot.thread} />}
            {snapshot && (
              <WorkspaceControls
                key={`workspace:${threadId}`}
                thread={snapshot.thread}
                working={working}
              />
            )}
            {snapshot && <ScreenControls key={`screen:${threadId}`} thread={snapshot.thread} />}
            <ConversationConnections />
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Konteks dan file hasil"
                  title="Konteks dan file hasil"
                >
                  <SlidersHorizontal className="size-4" /> Konteks dan file hasil
                </Button>
              </SheetTrigger>
              <SheetContent
                data-context-editor="true"
                overlayClassName="lg:hidden"
                className="w-full sm:max-w-[360px]"
              >
                <SheetHeader>
                  <SheetTitle>Opsi percakapan</SheetTitle>
                  <SheetDescription>
                    Konteks, memori, workspace dan layar untuk percakapan ini.
                  </SheetDescription>
                </SheetHeader>
                <div className="px-4 pb-6">
                  <div className="space-y-4 py-4">
                    <Link
                      to="/connections"
                      className="inline-flex min-h-11 items-center text-sm underline"
                    >
                      Permintaan aplikasi dan koneksi
                    </Link>
                    {snapshot && (
                      <SessionControls
                        key={`session:${threadId}`}
                        thread={snapshot.thread}
                        working={working}
                      />
                    )}
                    {snapshot && (
                      <HistoryControls
                        key={`history:${threadId}`}
                        thread={snapshot.thread}
                        messages={snapshot.messages}
                        refresh={refresh}
                      />
                    )}
                    {snapshot && (
                      <PortableExport
                        key={`portable:${threadId}`}
                        thread={snapshot.thread}
                        messages={snapshot.messages}
                        artifacts={snapshot.artifacts ?? []}
                      />
                    )}
                    <ArtifactResults artifacts={snapshot?.artifacts ?? []} threadId={threadId} />
                  </div>
                </div>
              </SheetContent>
            </Sheet>
          </nav>
        </div>
        {error && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 border-b bg-warning px-4 py-3 text-sm text-warning-foreground"
          >
            <p>{error}</p>
            <Button variant="outline" size="sm" onClick={refresh}>
              Muat ulang
            </Button>
          </div>
        )}
        {connection !== "connected" && (
          <p role="status" className="px-4 py-2 text-center text-xs text-muted-foreground">
            {connectionText}
          </p>
        )}
      </div>
      <section
        ref={scroll}
        aria-label="Riwayat pesan"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users need a focusable scroll region.
        tabIndex={0}
        className="conversation-transcript relative min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6"
        onScroll={() => {
          const el = scroll.current;
          if (el) {
            follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
            setAway(!follow.current);
          }
        }}
      >
        <div className="mx-auto max-w-[766px] space-y-2.5">
          {snapshot ? (
            <CollaborationProgress
              snapshot={snapshot}
              stopping={stopping}
              onStop={(runId) => void cancel({ run_id: runId })}
            />
          ) : null}
          {!snapshot && !error && (
            <div role="status" className="space-y-5">
              <LoadingState label="Memuat riwayat…" />
              <div className="h-16 rounded-lg bg-muted motion-safe:animate-pulse" />
              <div className="h-24 rounded-lg bg-muted motion-safe:animate-pulse" />
            </div>
          )}
          {snapshot?.next_before_message_seq && (
            <Button
              variant="ghost"
              className="mx-auto flex"
              disabled={loadingEarlier}
              onClick={() => {
                follow.current = false;
                if (scroll.current)
                  historyAnchor.current = {
                    height: scroll.current.scrollHeight,
                    top: scroll.current.scrollTop,
                  };
                void loadEarlier();
              }}
            >
              {loadingEarlier ? "Memuat…" : "Muat pesan sebelumnya"}
            </Button>
          )}
          {snapshot?.messages.length === 0 && (
            <div className="py-10 text-center">
              <h2 className="text-xl">
                Mulai percakapan{" "}
                {group ? `di ${snapshot?.thread.title}` : `dengan ${agent?.display_name}`}
              </h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
                Ceritakan apa yang ingin kamu kerjakan. {agent?.display_name} memakai karakter dan
                kemampuan yang sudah kamu simpan.
              </p>
            </div>
          )}
          {snapshot?.messages.map((message) => {
            const run = snapshot.runs.find((item) => item.run_id === message.run_id);
            const hasReply = snapshot.messages.some(
              (item) => item.run_id === message.run_id && item.author_kind === "agent",
            );
            const author =
              message.author_kind === "user"
                ? "Kamu"
                : message.author_kind === "system"
                  ? "Sistem"
                  : (snapshot.thread.agents.find(
                      (item) => item.agent_id === message.author_agent_id,
                    )?.display_name ?? "Agent");
            return (
              <div key={message.message_id} className="space-y-2.5">
                <ChatMessage
                  id={`message-${message.message_id}`}
                  author={author}
                  user={message.author_kind === "user"}
                  showIdentity={!!group || message.author_kind === "system"}
                  avatar={
                    <AgentAvatar
                      name={author}
                      url={
                        snapshot.thread.agents.find(
                          (item) => item.agent_id === message.author_agent_id,
                        )?.config.avatar_url
                      }
                    />
                  }
                >
                  {message.origin === "selected_history" && (
                    <p className="mb-2 text-xs opacity-90">
                      Riwayat pilihan · tidak menjalankan pekerjaan lama
                    </p>
                  )}
                  <MessageText text={message.content} />
                  {!!message.attachments?.length && (
                    <div className="mt-3">
                      <ArtifactResults
                        artifacts={message.attachments}
                        threadId={threadId}
                        label="Lampiran"
                      />
                    </div>
                  )}
                  {message.author_kind === "agent" && run?.status === "indeterminate" && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Jawaban tersimpan. Hasil salah satu tindakan belum diketahui; periksa hasilnya
                      sebelum mengulang tindakan tersebut.
                    </p>
                  )}
                  {message.author_kind === "agent" && run?.continuation_required && (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Batas eksekusi tercapai. Hasil sementara tersimpan; kirim arahan untuk
                      melanjutkan.
                    </p>
                  )}
                </ChatMessage>
                {!group && message.author_kind === "user" && run && !hasReply && (
                  <article
                    aria-label={`Aktivitas ${agent?.display_name}`}
                    className="min-w-0 space-y-3"
                  >
                    <h2 className="text-xs font-bold">{agent?.display_name}</h2>
                    {run.text && activeRun(run) && <MessageText text={run.text} streaming />}
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {activeRun(run) ? (
                        <LoadingState label={run.activity ?? runLabels[run.status]} />
                      ) : (
                        <span>{runLabels[run.status]}</span>
                      )}
                      {activeRun(run) && (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={stopping !== null}
                          onClick={() => void cancel(run)}
                        >
                          {stopping === run.run_id ? "Menghentikan…" : "Hentikan jawaban"}
                        </Button>
                      )}
                    </div>
                    {run.status === "failed" && (
                      <div className="space-y-2 text-sm text-danger">
                        <p>
                          {run.error_code?.startsWith("PROVIDER_")
                            ? providerFailureMessage(run.error_code)
                            : "Jawaban tidak selesai. Kamu dapat mengirim arahan baru untuk mencoba lagi."}
                        </p>
                        {run.error_code?.startsWith("PROVIDER_") && (
                          <Link to="/connections" className="underline underline-offset-4">
                            Kelola koneksi model
                          </Link>
                        )}
                      </div>
                    )}
                    {!group && run.status === "failed" && (
                      <RetryRun runId={run.run_id} refresh={refresh} />
                    )}
                    {run.status === "indeterminate" && (
                      <p className="text-sm text-muted-foreground">
                        Pekerjaan tidak diulang otomatis karena hasil sebelumnya belum diketahui.
                        Periksa hasil sebelum meminta tindakan yang sama.
                      </p>
                    )}
                  </article>
                )}
              </div>
            );
          })}
          {group &&
            snapshot?.runs
              .filter(
                (run) =>
                  !snapshot.messages.some(
                    (m) => m.run_id === run.run_id && m.author_kind === "agent",
                  ),
              )
              .map((run) => (
                <article
                  key={run.run_id}
                  aria-label={`Aktivitas ${nameOf(run.agent_id)}`}
                  className="space-y-3"
                >
                  <h2 className="text-xs font-bold">{nameOf(run.agent_id)}</h2>
                  {run.text && activeRun(run) && <MessageText text={run.text} streaming />}
                  <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                    {activeRun(run) ? (
                      <LoadingState label={run.activity ?? runLabels[run.status]} />
                    ) : (
                      <span>{runLabels[run.status]}</span>
                    )}
                    {activeRun(run) && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={stopping !== null}
                        onClick={() => void cancel(run)}
                      >
                        {stopping ? "Menghentikan…" : "Hentikan diskusi"}
                      </Button>
                    )}
                  </div>
                  {run.status === "indeterminate" && (
                    <p className="rounded-lg bg-warning p-3 text-sm text-warning-foreground">
                      Hasil tindakan belum diketahui. Pekerjaan tidak diulang otomatis; periksa
                      hasil sebelum meminta tindakan yang sama.
                    </p>
                  )}
                  {!group && run.status === "failed" && (
                    <RetryRun runId={run.run_id} refresh={refresh} />
                  )}
                  {run.continuation_required && (
                    <p className="text-sm text-muted-foreground">
                      Hasil sementara tersimpan. Kirim arahan untuk melanjutkan.
                    </p>
                  )}
                  {run.error_code?.startsWith("PROVIDER_") ? (
                    <div className="space-y-2 text-sm text-muted-foreground">
                      <p>{providerFailureMessage(run.error_code)}</p>
                      <Link to="/connections" className="underline underline-offset-4">
                        Kelola koneksi model
                      </Link>
                    </div>
                  ) : run.error_code ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Detail kendala</summary>
                      <p className="mt-2">{run.error_code}</p>
                    </details>
                  ) : null}
                </article>
              ))}
        </div>
      </section>
      <footer
        ref={bottomEdge}
        className="conversation-edge conversation-edge-bottom px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:px-6 md:pb-6"
      >
        <ConversationFade />
        <div className="relative mx-auto max-w-[766px] space-y-3">
          {away && (
            <Button
              variant="outline"
              size="icon"
              className="absolute right-0 bottom-full mb-3 size-9 rounded-full bg-background/90"
              aria-label="Ke pesan terbaru"
              title="Ke pesan terbaru"
              onClick={() => {
                follow.current = true;
                setAway(false);
                if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
              }}
            >
              <ArrowDown className="size-4" aria-hidden="true" />
            </Button>
          )}
          {cancelError && (
            <p role="alert" className="text-sm text-danger">
              {cancelError}
            </p>
          )}
          {snapshot && <ClarificationPrompts thread={snapshot.thread} working={working} />}
          {snapshot && (
            <Composer
              key={threadId}
              thread={snapshot.thread}
              working={working}
              connected={connection === "connected"}
            />
          )}
        </div>
      </footer>
    </main>
  );
}
const messageComponents: Components = {
  code: (props) => (
    <defaultComponents.code {...props} tabIndex={"data-block" in props ? 0 : undefined} />
  ),
  table: (props) => <defaultComponents.table {...props} tabIndex={0} />,
};

function MessageText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="min-w-0 wrap-anywhere text-sm leading-relaxed [&_pre]:max-w-full [&_pre]:text-xs [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:block [&_table]:overflow-x-auto">
      <Streamdown
        components={messageComponents}
        mode={streaming ? "streaming" : "static"}
        isAnimating={streaming}
      >
        {text}
      </Streamdown>
    </div>
  );
}

function ConversationFade() {
  return <div className="conversation-fade" aria-hidden="true" />;
}
