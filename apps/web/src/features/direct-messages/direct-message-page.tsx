import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowLeft, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import { providerFailureMessage } from "@/features/connections/client";
import { ArtifactResults } from "./artifact-results";
import { command, listThreads, submit, type ThreadItem } from "./client";
import { Composer } from "./composer";
import { GoalProgress } from "./goal-progress";
import { SessionControls } from "./session-controls";
import { activeRun, type Run, runLabels } from "./state";
import { useDirectMessage } from "./use-direct-message";

export function DirectMessagePage({ threadId }: { threadId: string }) {
  const { getToken } = useAuth();
  const { snapshot, connection, error, refresh, loadEarlier, loadingEarlier } =
    useDirectMessage(threadId);
  const [threads, setThreads] = useState<ThreadItem[]>([]);
  const [listError, setListError] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [stopping, setStopping] = useState<string | null>(null);
  const cancels = useRef(new Map<string, ReturnType<typeof command>>());
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const [away, setAway] = useState(false);
  const agent = snapshot?.thread.agents[0];
  const group = snapshot?.thread.kind === "group";
  const nameOf = (id?: string) =>
    snapshot?.thread.agents.find((a) => a.agent_id === id)?.display_name ?? "Agent";
  const working = snapshot?.runs.some(activeRun) ?? false;
  const activity = snapshot?.runs.slice().reverse().find(activeRun);
  useEffect(() => {
    let alive = true;
    void getToken()
      .then(listThreads)
      .then((items) => {
        if (alive) setThreads(items);
      })
      .catch(() => {
        if (alive) setListError(true);
      });
    return () => {
      alive = false;
    };
  }, [getToken]);
  useEffect(() => {
    if (snapshot && follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [snapshot]);
  async function cancel(run: Run) {
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
    <main id="main" className="flex h-dvh min-h-0 bg-background">
      <aside
        className="hidden w-64 shrink-0 flex-col border-r bg-card p-5 md:flex"
        aria-label="DM dan grup"
      >
        <Link to="/agents" className="flex min-h-11 items-center gap-2 text-sm font-semibold">
          <ArrowLeft className="size-4" /> Agent dan percakapan
        </Link>
        <h2 className="mt-8 mb-3 text-sm">DM dan grup</h2>
        <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto">
          {threads.map((thread) => (
            <Link
              key={thread.thread_id}
              to="/conversations/$threadId"
              params={{ threadId: thread.thread_id }}
              aria-current={thread.thread_id === threadId ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-lg px-3 py-3 text-sm hover:bg-muted ${thread.thread_id === threadId ? "bg-secondary font-semibold" : ""}`}
            >
              <MessageCircle className="size-4 shrink-0" />
              <span className="break-words [overflow-wrap:anywhere]">
                {thread.kind === "group" ? "Grup · " : "DM · "}
                {thread.title}
              </span>
            </Link>
          ))}
          {listError && (
            <p className="text-sm text-muted-foreground">
              Daftar belum dimuat.{" "}
              <Link to="/agents" className="underline">
                Buka daftar agent
              </Link>
              .
            </p>
          )}
        </nav>
      </aside>
      <section
        className="flex min-w-0 flex-1 flex-col"
        aria-label={group ? "Percakapan grup" : "Percakapan langsung"}
      >
        <header className="flex shrink-0 items-center gap-3 border-b bg-card px-4 py-3 sm:px-6">
          <Button asChild variant="ghost" size="icon" className="size-11 md:hidden">
            <Link to="/agents" aria-label="Kembali ke agent dan percakapan">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          {group ? (
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary font-bold"
              aria-hidden="true"
            >
              G
            </div>
          ) : (
            <AgentAvatar name={agent?.display_name ?? ""} url={agent?.config.avatar_url} />
          )}
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-lg font-bold [overflow-wrap:anywhere]">
              {group ? snapshot?.thread.title : (agent?.display_name ?? "Percakapan langsung")}
            </h1>
            <p className="text-xs text-muted-foreground">
              {group
                ? snapshot?.thread.agents.map((a) => `@${a.handle}`).join(" · ")
                : agent
                  ? `@${agent.handle} · DM`
                  : "Memuat agent…"}
            </p>
          </div>
          <Link to="/agents" className="hidden text-sm underline sm:block">
            Semua agent
          </Link>
        </header>
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2 text-xs sm:px-6"
          role="status"
        >
          <span>
            {connection !== "connected"
              ? connectionText
              : activity
                ? `${nameOf(activity.agent_id)}: ${activity.activity ?? runLabels[activity.status]}`
                : snapshot?.discussion?.status === "bounded"
                  ? "Batas diskusi tercapai · Kirim arahan untuk melanjutkan"
                  : snapshot?.discussion?.status === "cancelled"
                    ? "Diskusi dihentikan · Riwayat tersimpan"
                    : "Tersambung · Riwayat tersimpan"}
          </span>
          {(connection === "reconnecting" || connection === "error") && (
            <Button variant="ghost" size="sm" onClick={refresh}>
              Sambungkan kembali
            </Button>
          )}
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
        <div
          ref={scroll}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6"
          onScroll={() => {
            const el = scroll.current;
            if (el) {
              follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              setAway(!follow.current);
            }
          }}
        >
          <div className="mx-auto max-w-3xl space-y-7 py-6">
            {snapshot && (
              <SessionControls key={threadId} thread={snapshot.thread} working={working} />
            )}
            <ArtifactResults artifacts={snapshot?.artifacts ?? []} />
            {snapshot && (
              <GoalProgress
                goals={snapshot.goals ?? []}
                messages={snapshot.messages}
                agents={snapshot.thread.agents}
              />
            )}
            {!snapshot && !error && (
              <div role="status" className="space-y-5">
                <p className="text-sm text-muted-foreground">Memuat riwayat…</p>
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
                <div key={message.message_id} className="space-y-6">
                  <article
                    id={`message-${message.message_id}`}
                    aria-label={`Pesan ${author}`}
                    className={
                      message.author_kind === "user"
                        ? "ml-auto max-w-[90%] rounded-xl bg-secondary px-4 py-3 sm:max-w-[85%]"
                        : "min-w-0"
                    }
                  >
                    <h2 className="mb-2 text-xs font-bold">{author}</h2>
                    <MessageText text={message.content} />
                    {message.author_kind === "agent" && run?.status === "indeterminate" && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Jawaban tersimpan. Hasil salah satu tindakan belum diketahui; periksa
                        hasilnya sebelum mengulang tindakan tersebut.
                      </p>
                    )}
                    {message.author_kind === "agent" && run?.continuation_required && (
                      <p className="mt-3 text-sm text-muted-foreground">
                        Batas eksekusi tercapai. Hasil sementara tersimpan; kirim arahan untuk
                        melanjutkan.
                      </p>
                    )}
                  </article>
                  {!group && message.author_kind === "user" && run && !hasReply && (
                    <article
                      aria-label={`Aktivitas ${agent?.display_name}`}
                      className="min-w-0 space-y-3"
                    >
                      <h2 className="text-xs font-bold">{agent?.display_name}</h2>
                      {run.text && activeRun(run) && <MessageText text={run.text} streaming />}
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span>{run.activity ?? runLabels[run.status]}</span>
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
                      <span>{run.activity ?? runLabels[run.status]}</span>
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
        </div>
        <footer className="shrink-0 border-t bg-card px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">
          <div className="mx-auto max-w-3xl space-y-3">
            {away && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  follow.current = true;
                  setAway(false);
                  if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
                }}
              >
                <ArrowDown className="size-4" /> Pesan terbaru
              </Button>
            )}
            {cancelError && (
              <p role="alert" className="text-sm text-danger">
                {cancelError}
              </p>
            )}
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
      </section>
    </main>
  );
}
function MessageText({ text, streaming = false }: { text: string; streaming?: boolean }) {
  return (
    <div className="min-w-0 wrap-anywhere text-sm leading-relaxed [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_h1]:text-xl [&_h2]:text-lg [&_table]:block [&_table]:overflow-x-auto">
      <Streamdown mode={streaming ? "streaming" : "static"} isAnimating={streaming}>
        {text}
      </Streamdown>
    </div>
  );
}
