import { Link } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { AgentPanel } from "./agent-panel";
import { Answer } from "./answer";
import { command, durableCommand, pendingMessage, request } from "./api";
import { repairMessage } from "./errors";
import { ConnectionSettings } from "./settings";
import { ToolChips } from "./tool-chips";
import type { Message as MessageEntity, Thread } from "./types";
import { useWorkspace } from "./use-workspace";

const statusText: Record<string, string> = {
  queued: "Menunggu",
  dispatching: "Menghubungkan",
  running: "Sedang bekerja",
  cancel_requested: "Stop diminta",
  cancelled: "Dihentikan",
  succeeded: "Selesai",
  failed: "Gagal",
  unknown: "Hasil belum diketahui",
  steered: "Arahan diterima",
};
export default function Workspace() {
  const workspace = useWorkspace();
  const {
    agents,
    threads,
    connections,
    snapshot,
    opening,
    threadId,
    select,
    refresh,
    error,
    setError,
    online,
  } = workspace;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [navigation, setNavigation] = useState(false);
  const [details, setDetails] = useState(false);
  const [settings, setSettings] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [editing, setEditing] = useState<MessageEntity | null>(null);
  const [editText, setEditText] = useState("");
  const [older, setOlder] = useState<MessageEntity[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const mobile = useIsMobile();
  const pending = threadId ? pendingMessage(threadId) : null;
  const agent = snapshot?.agents[0];
  const connection = connections.find((c) => c.id === agent?.connection_id);
  const activeRun = snapshot?.runs.find((run) =>
    ["running", "dispatching", "cancel_requested"].includes(run.status),
  );
  const report = useCallback((message: string) => setError(message), [setError]);
  function choose(id: string) {
    select(id);
    setOlder([]);
    setBefore(null);
    setHistoryLoaded(false);
    setNavigation(false);
    setDetails(false);
    setDraft("");
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Permintaan gagal");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function createAgent() {
    setCreateMenu(false);
    void act(async () => {
      const defaults = agents.find((a) => a.system_role === "tobi");
      const defaultConnection = connections.find((c) => c.id === defaults?.connection_id);
      const result = await durableCommand<{ thread: Thread }>(
        "create-agent",
        "/v1/creation/agents",
        {
          connection_id: defaults?.connection_id ?? null,
          harness: defaults?.harness ?? "codex",
          model_id: defaults?.model_id ?? null,
          reasoning: defaults?.reasoning ?? null,
          billing_source:
            defaults?.billing_source ??
            defaultConnection?.authentication.billing_source ??
            "subscription",
        },
      );
      choose(result.thread.id);
    });
  }
  function send() {
    if (!agent || !threadId || !(pending ?? draft).trim()) return;
    const text = pending ?? draft;
    void act(async () => {
      await durableCommand(`message:${threadId}`, "/v1/runs", {
        thread_id: threadId,
        agent_id: agent.id,
        text,
      });
      setDraft("");
    });
  }
  const nav = (
    <div className="flex h-full min-h-0 flex-col bg-background p-4">
      <div className="mb-8 flex items-center justify-between px-2 pt-2 max-md:pr-10">
        <Link to="/" className="text-lg font-semibold tracking-tight">
          ngertiin<span className="text-primary">.</span>
        </Link>
        <Popover open={createMenu} onOpenChange={setCreateMenu}>
          <PopoverTrigger asChild>
            <Button size="icon-sm" variant="outline" aria-label="Buat baru" disabled={busy}>
              +
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 p-1">
            <Button variant="ghost" className="w-full justify-start" onClick={createAgent}>
              Create agent
            </Button>
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled
              title="Flow grup tersedia pada NMA-062"
            >
              Create group
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <p className="mb-3 px-2 text-caption font-medium text-muted-foreground">Percakapan</p>
      <nav aria-label="Percakapan" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {threads.map((thread) => {
          const member = agents.find((a) => a.id === thread.member_agent_ids[0]);
          const name = thread.name ?? member?.name ?? "Percakapan";
          return (
            <button
              type="button"
              key={thread.id}
              aria-current={thread.id === threadId ? "page" : undefined}
              onClick={() => choose(thread.id)}
              className={cn(
                "flex w-full items-center gap-3 rounded-nav px-3 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-ring",
                thread.id === threadId && "bg-accent text-foreground",
              )}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-card">
                {thread.type === "group" ? "♧" : (member?.avatar ?? name[0])}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{name}</span>
                <span className="block truncate text-caption text-muted-foreground">
                  {thread.type === "group"
                    ? `${thread.member_agent_ids.length} agent`
                    : member?.system_role === "tobi"
                      ? "Asisten personal"
                      : member?.harness}
                </span>
              </span>
            </button>
          );
        })}
      </nav>
      <div className="mt-4 space-y-2 border-t pt-4">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => {
            setSettings(true);
            setNavigation(false);
          }}
        >
          Pengaturan
        </Button>
        <div className="flex items-center justify-between gap-2 px-2">
          <Link
            to="/design-system"
            className="text-caption text-muted-foreground hover:text-foreground"
          >
            Design system
          </Link>
          <span className="text-caption text-muted-foreground" role="status">
            {online ? "Terhubung" : "Menghubungkan…"}
          </span>
        </div>
      </div>
    </div>
  );
  const panel = (
    <Tabs defaultValue="agent" className="min-w-0">
      <TabsList className="w-full">
        <TabsTrigger value="agent">
          {snapshot?.thread.type === "group" ? "Anggota" : "Agent"}
        </TabsTrigger>
        <TabsTrigger value="files" disabled>
          File
        </TabsTrigger>
        <TabsTrigger value="goals" disabled>
          Goals
        </TabsTrigger>
        <TabsTrigger value="routine" disabled>
          Routine
        </TabsTrigger>
      </TabsList>
      <TabsContent value="agent">
        {agent && threadId && snapshot?.thread.type === "dm" ? (
          <AgentPanel
            key={agent.id}
            agent={agent}
            threadId={threadId}
            cursor={snapshot.cursor}
            connections={connections}
            refresh={refresh}
            report={report}
          />
        ) : (
          <p className="py-6 text-sm text-muted-foreground">
            Detail grup tersedia pada tahap berikutnya.
          </p>
        )}
      </TabsContent>
    </Tabs>
  );
  const messages = [
    ...older.filter((m) => !snapshot?.messages.some((current) => current.id === m.id)),
    ...(snapshot?.messages ?? []),
  ];
  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-background">
      {!mobile && <aside className="hidden w-64 shrink-0 border-r md:block">{nav}</aside>}
      <Sheet open={navigation} onOpenChange={setNavigation}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Percakapan</SheetTitle>
            <SheetDescription>Pilih agent atau percakapan.</SheetDescription>
          </SheetHeader>
          {nav}
        </SheetContent>
      </Sheet>
      <main className="flex min-w-0 flex-1 flex-col bg-card">
        <header className="flex h-20 shrink-0 items-center gap-3 border-b px-4 sm:px-7">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Buka percakapan"
            onClick={() => setNavigation(true)}
          >
            ☰
          </Button>
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            disabled={!agent}
            aria-label={`Detail ${agent?.name ?? "agent"}`}
            className="flex min-w-0 items-center gap-3 rounded-lg text-left"
          >
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border bg-background">
              {agent?.avatar ?? agent?.name[0] ?? "n"}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {snapshot?.thread.name ?? agent?.name ?? "Percakapan"}
              </span>
              <span className="block text-caption text-muted-foreground">
                {activeRun
                  ? statusText[activeRun.status]
                  : agent
                    ? `${agent.harness} · ${agent.model_id ?? "Default model"}`
                    : "Workspace personal kamu"}
              </span>
            </span>
          </button>
          <div className="ml-auto hidden sm:block">
            <ThemeSwitcher />
          </div>
        </header>
        {error && (
          <Alert variant="destructive" className="mx-4 mt-4 w-auto">
            <AlertDescription className="flex flex-wrap items-center gap-2">
              {error}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  workspace.retry();
                  void refresh().catch((e) => report(e.message));
                }}
              >
                Coba hubungkan lagi
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSettings(true)}>
                Periksa pengaturan
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!snapshot ? (
          <div className="grid flex-1 place-content-center gap-3 p-6 text-center">
            <Spinner className="mx-auto" />
            <p className="text-sm text-muted-foreground">Membuka percakapan…</p>
          </div>
        ) : (
          <>
            <Conversation key={threadId} className="min-h-0 flex-1">
              <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-5 py-8 sm:px-10">
                {(historyLoaded ? before : snapshot.next_before) && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      void act(async () => {
                        const result = await request<{
                          messages: MessageEntity[];
                          next_before: string | null;
                        }>(
                          `/v1/threads/${threadId}/history?before=${historyLoaded ? before : snapshot.next_before}`,
                        );
                        setOlder((current) => [...result.messages, ...current]);
                        setBefore(result.next_before);
                        setHistoryLoaded(true);
                      })
                    }
                  >
                    Pesan sebelumnya
                  </Button>
                )}
                {messages
                  .filter((message) => message.state !== "deleted")
                  .map((message) => {
                    const run = snapshot.runs.findLast(
                      (run) => run.input_message_id === message.id,
                    );
                    const author = agents.find((a) => a.id === message.author_agent_id);
                    return (
                      <Message key={message.id} align={message.author === "user" ? "end" : "start"}>
                        <MessageContent>
                          <MessageHeader>
                            {message.author === "user" ? "Kamu" : (author?.name ?? "Agent")}
                          </MessageHeader>
                          <Bubble variant={message.author === "user" ? "secondary" : "ghost"}>
                            <BubbleContent className="whitespace-pre-wrap text-[15px] leading-7">
                              {message.author === "user" ? (
                                message.text
                              ) : (
                                <Answer text={message.text || "Sedang menulis…"} />
                              )}
                            </BubbleContent>
                          </Bubble>
                          {run && (
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
                                <span>{statusText[run.status] ?? run.status}</span>
                                {run.status === "cancelled" && (
                                  <span>
                                    {run.cancellation === "confirmed"
                                      ? "Stop terkonfirmasi"
                                      : "Menunggu konfirmasi"}
                                  </span>
                                )}
                                {run.diagnostic && run.status !== "succeeded" && (
                                  <span>
                                    {repairMessage(run.diagnostic.code)}{" "}
                                    <button
                                      type="button"
                                      className="text-link underline"
                                      onClick={() => setSettings(true)}
                                    >
                                      Periksa pengaturan
                                    </button>
                                    <span className="block text-xs">{run.diagnostic.code}</span>
                                  </span>
                                )}
                                {run.status === "queued" && (
                                  <>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => {
                                        setEditing(message);
                                        setEditText(message.text);
                                      }}
                                    >
                                      Edit
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() =>
                                        void act(async () => {
                                          await command(`/v1/messages/${message.id}/delete`, {
                                            expected_revision: message.revision,
                                          });
                                        })
                                      }
                                    >
                                      Hapus
                                    </Button>
                                    {activeRun?.native_run_id &&
                                      connection?.capabilities.steer === "supported" && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          disabled={busy}
                                          onClick={() =>
                                            void act(async () => {
                                              await command(`/v1/runs/${activeRun.id}/steer`, {
                                                queued_run_id: run.id,
                                                expected_native_run_id: activeRun.native_run_id,
                                              });
                                            })
                                          }
                                        >
                                          Arahkan sekarang
                                        </Button>
                                      )}
                                  </>
                                )}
                                {run.status === "unknown" && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() =>
                                      void act(async () => {
                                        await request(`/v1/runs/${run.id}/reconcile`, {});
                                      })
                                    }
                                  >
                                    Periksa hasil
                                  </Button>
                                )}
                              </div>
                              <ToolChips run={run} />
                            </div>
                          )}
                        </MessageContent>
                      </Message>
                    );
                  })}
                {snapshot.controls.map((control) => (
                  <p key={control.id} className="text-caption text-muted-foreground">
                    Arahan: {control.state}
                    {control.error_code ? ` · ${control.error_code}` : ""}
                  </p>
                ))}
                {opening?.recovery === "retry" && opening.run && (
                  <Alert>
                    <AlertDescription>
                      Pembuka belum berhasil. Agent dan percakapan tetap tersimpan.
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            await command(`/v1/threads/${threadId}/opening/retry`, {
                              expected_run_id: opening.run?.id,
                            });
                          })
                        }
                      >
                        Lanjutkan pembuka
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pb-5 sm:px-9">
              {connection?.login !== "authenticated" && (
                <button
                  type="button"
                  onClick={() => setSettings(true)}
                  className="mb-3 text-left text-caption text-link"
                >
                  Siapkan koneksi agar {agent?.name} bisa mulai bekerja →
                </button>
              )}
              {pending && (
                <p className="mb-2 text-caption text-muted-foreground">
                  Pengiriman sebelumnya belum terkonfirmasi. Periksa dengan identitas pesan yang
                  sama sebelum mengirim pesan baru.
                </p>
              )}
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  send();
                }}
                className="rounded-card border bg-background p-3 shadow-sm"
              >
                <Textarea
                  aria-label="Pesan"
                  value={pending ?? draft}
                  readOnly={pending !== null}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Ada yang ingin kamu kerjakan${agent ? ` bersama ${agent.name}` : ""}?`}
                  className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      send();
                    }
                  }}
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    className="truncate text-caption text-muted-foreground"
                    onClick={() => setSettings(true)}
                  >
                    {agent?.model_id ?? "Default model"} ·{" "}
                    {connection?.authentication.billing_source ?? "Koneksi belum dipilih"}
                  </button>
                  <div className="flex gap-2">
                    {activeRun && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || activeRun.status === "cancel_requested"}
                        onClick={() =>
                          void act(async () => {
                            await command(`/v1/runs/${activeRun.id}/cancel`);
                          })
                        }
                      >
                        {activeRun.status === "cancel_requested" ? "Stop diminta" : "Stop run"}
                      </Button>
                    )}
                    <Button
                      type="submit"
                      size="sm"
                      disabled={
                        busy ||
                        !(pending ?? draft).trim() ||
                        !agent ||
                        snapshot.thread.type !== "dm"
                      }
                    >
                      {busy ? (
                        <Spinner />
                      ) : pending ? (
                        "Periksa pengiriman"
                      ) : activeRun ? (
                        "Antrekan"
                      ) : (
                        "Kirim"
                      )}
                    </Button>
                  </div>
                </div>
              </form>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                {activeRun
                  ? "Pesan baru menunggu giliran. Edit dan hapus hanya sebelum diproses."
                  : "Ceritakan kebutuhanmu. Agent dapat menyesuaikan diri lewat percakapan."}
              </p>
            </div>
          </>
        )}
      </main>
      {details && !mobile && (
        <aside className="w-80 shrink-0 overflow-y-auto border-l bg-card p-5 xl:w-96">
          <div className="mb-5 flex justify-between">
            <h2 className="font-medium">Detail percakapan</h2>
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Tutup detail"
              onClick={() => setDetails(false)}
            >
              ×
            </Button>
          </div>
          {panel}
        </aside>
      )}
      <Sheet open={details && mobile} onOpenChange={setDetails}>
        <SheetContent className="w-full data-[side=right]:w-full overflow-y-auto p-5">
          <SheetHeader className="px-0">
            <SheetTitle>Detail percakapan</SheetTitle>
            <SheetDescription>Profil dan konteks percakapan.</SheetDescription>
          </SheetHeader>
          {panel}
        </SheetContent>
      </Sheet>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent className="max-h-[85svh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pengaturan</DialogTitle>
            <DialogDescription>
              Koneksi dan biaya yang kamu pilih. Tidak ada perpindahan billing otomatis.
            </DialogDescription>
          </DialogHeader>
          <div className="sm:hidden">
            <ThemeSwitcher />
          </div>
          <ConnectionSettings
            agent={agent}
            connections={connections}
            refresh={refresh}
            report={report}
          />
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editing}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit pesan menunggu</DialogTitle>
            <DialogDescription>
              Perubahan hanya berlaku sebelum diproses, bukan undo pekerjaan agent.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            aria-label="Edit pesan"
            value={editText}
            onChange={(event) => setEditText(event.target.value)}
          />
          <Button
            disabled={busy || !editText.trim()}
            onClick={() =>
              void act(async () => {
                if (editing)
                  await command(`/v1/messages/${editing.id}/edit`, {
                    expected_revision: editing.revision,
                    text: editText,
                  });
                setEditing(null);
              })
            }
          >
            Simpan pesan
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
