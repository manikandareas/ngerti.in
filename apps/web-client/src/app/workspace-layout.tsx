import {
  ArrowUp02Icon,
  Cancel01Icon,
  Menu01Icon,
  Settings02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

type SettingsPageId = "general" | "providers" | "about";

import { AgentPanel } from "@/features/conversation/components/agent-panel";
import { Answer } from "@/features/conversation/components/answer";
import { AgentAvatar, agentStyle } from "@/features/conversation/components/identity";
import { ConversationNavigation } from "@/features/conversation/components/navigation";
import { ToolChips } from "@/features/conversation/components/tool-chips";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import { useWorkspace } from "@/hooks/use-workspace";
import { command, durableCommand, pendingMessage, request } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import type { Message as MessageEntity, Thread } from "@/types/workspace";

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
  const navigate = useNavigate();
  const isSettings = useRouterState({ select: (state) => state.location.pathname === "/settings" });
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
  } = workspace;
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [navigation, setNavigation] = useState(false);
  const [details, setDetails] = useState(false);
  const [configurationOpen, setConfigurationOpen] = useState(false);
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
  function openSettings(page: SettingsPageId = "providers") {
    setNavigation(false);
    void navigate({ to: "/settings", search: { section: page === "general" ? undefined : page } });
  }
  function choose(id: string) {
    select(id);
    setOlder([]);
    setBefore(null);
    setHistoryLoaded(false);
    setNavigation(false);
    setDetails(false);
    setConfigurationOpen(false);
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
    <ConversationNavigation
      agents={agents}
      threads={threads}
      threadId={threadId}
      busy={busy}
      createMenu={createMenu}
      setCreateMenu={setCreateMenu}
      createAgent={createAgent}
      choose={choose}
      openSettings={() => {
        openSettings("general");
      }}
    />
  );
  const panel = (
    <Tabs defaultValue="agent" className="context-panel gap-2 pb-5" id="conversation-details">
      <div className="profile-identity gap-3.5 [padding:12px_20px_20px] flex items-center flex-col">
        <AgentAvatar
          agent={agent}
          group={snapshot?.thread.type === "group"}
          className="size-20 rounded-2xl text-3xl"
        />
        <h2>{snapshot?.thread.name ?? agent?.name ?? "Percakapan"}</h2>
      </div>
      <TabsList className="context-tabs" aria-label="Detail sesuai konteks">
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
            manageProviders={() => openSettings("providers")}
            configurationOpen={configurationOpen}
            setConfigurationOpen={setConfigurationOpen}
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
    <SettingsWorkspaceContext.Provider
      value={{
        agents,
        connections,
        refresh,
        openAgent: (selectedAgent) => {
          const dm = threads.find(
            (thread) => thread.type === "dm" && thread.member_agent_ids[0] === selectedAgent.id,
          );
          if (!dm) return;
          if (dm.id !== threadId) choose(dm.id);
          setDetails(true);
          setConfigurationOpen(true);
          void navigate({ to: "/" });
        },
      }}
    >
      <div
        className="workspace-shell [height:100svh] [background:var(--frame)] [padding:8px_8px_8px_0] flex min-h-0 overflow-hidden"
        style={{ ...agentStyle(agent), display: isSettings ? "none" : undefined }}
      >
        {!mobile && (
          <aside className={`workspace-sidebar ${details ? "workspace-sidebar-with-details" : ""}`}>
            {nav}
          </aside>
        )}
        <Sheet open={navigation && !isSettings} onOpenChange={setNavigation}>
          <SheetContent side="left" className="w-[280px] gap-0 border-0 bg-frame p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Percakapan</SheetTitle>
              <SheetDescription>Pilih agent atau percakapan.</SheetDescription>
            </SheetHeader>
            {nav}
          </SheetContent>
        </Sheet>
        <main
          className="workspace-main rounded-[16px] flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-background"
          aria-label="Percakapan aktif"
          data-details={details && !mobile}
        >
          <header className="workspace-chat-header [grid-template-columns:minmax(0,_1fr)_auto_minmax(0,_1fr)] gap-2.5 min-h-15.5 [padding:12px_20px] grid items-center shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full xl:hidden"
              aria-label="Buka percakapan"
              onClick={() => setNavigation(true)}
            >
              <HugeiconsIcon icon={Menu01Icon} strokeWidth={1.6} />
            </Button>
            <div className="header-identity-position [grid-column:2] [grid-row:1] [padding-left:0] flex justify-center flex-1 min-w-0">
              <Button
                variant="ghost"
                type="button"
                onClick={() => setDetails((value) => !value)}
                disabled={!agent}
                aria-label={`Detail ${agent?.name ?? "agent"}`}
                aria-expanded={details}
                aria-controls="conversation-details"
                className="header-identity gap-2 [max-width:100%] [padding:7.5px_13.5px_7.5px_7.5px] [border-radius:999px] inline-flex items-center min-w-0 bg-secondary font-medium h-auto"
              >
                <AgentAvatar
                  agent={agent}
                  group={snapshot?.thread.type === "group"}
                  className="size-6 rounded-lg text-xs"
                />
                <span className="truncate">
                  {snapshot?.thread.name ?? agent?.name ?? "Percakapan"}
                </span>
                {activeRun && (
                  <span
                    role="status"
                    className="flex items-center gap-1 text-caption text-muted-foreground"
                  >
                    <Spinner className="size-3" />
                    <span className="sr-only">{statusText[activeRun.status]}</span>
                  </span>
                )}
              </Button>
            </div>
            <Button
              variant="secondary"
              className="model-selector max-w-60 [font-size:12px] gap-2 rounded-full"
              onClick={() => {
                setDetails(true);
                setConfigurationOpen(true);
              }}
              title="Pengaturan model dan koneksi"
            >
              <span className="truncate">
                {agent?.model_id ?? (agent?.harness === "muse" ? "Muse Code" : "Codex / ChatGPT")}
              </span>
              <span className="hidden text-caption text-muted-foreground sm:inline">
                {connection?.authentication.billing_source === "api_key"
                  ? "API key"
                  : connection?.authentication.billing_source === "subscription"
                    ? "Subscription"
                    : ""}
              </span>
            </Button>
          </header>
          {error && (
            <Alert
              variant="destructive"
              className="workspace-error [width:auto] [max-width:var(--chat-column-max)] [margin:8px_24px]"
            >
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
                <Button size="sm" variant="ghost" onClick={() => openSettings()}>
                  Periksa pengaturan
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!snapshot ? (
            <div
              className="conversation-loading [max-width:var(--chat-column-max)] [margin:auto] [padding:60px_24px] w-full flex-1"
              role="status"
              aria-label={error ? "Percakapan belum terhubung" : "Membuka percakapan"}
            >
              {error ? (
                <p className="text-sm text-muted-foreground">
                  Percakapan akan tersedia setelah koneksi pulih.
                </p>
              ) : (
                <>
                  <Skeleton className="mb-6 h-12 w-3/5 rounded-2xl" />
                  <Skeleton className="ml-auto h-10 w-2/5 rounded-2xl" />
                  <Skeleton className="mt-6 h-24 w-4/5 rounded-2xl" />
                  <span className="sr-only">Membuka percakapan…</span>
                </>
              )}
            </div>
          ) : (
            <>
              <Conversation key={threadId} className="min-h-0 flex-1">
                <ConversationContent className="conversation-column [max-width:var(--chat-column-max)] [margin-inline:auto] gap-6 [padding:24px_24px_16px] w-full">
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
                  {messages.filter((message) => message.state !== "deleted").length === 0 && (
                    <div className="conversation-empty gap-3 [margin:auto] [padding:64px_24px] flex items-center flex-col text-center">
                      <AgentAvatar agent={agent} className="size-16 rounded-2xl text-2xl" />
                      <h1>{agent?.name ?? "Percakapan"}</h1>
                      <p>{agent?.soul || "Apa yang ingin kamu kerjakan bersama?"}</p>
                    </div>
                  )}
                  {messages
                    .filter((message) => message.state !== "deleted")
                    .map((message) => {
                      const run = snapshot.runs.findLast(
                        (run) => run.input_message_id === message.id,
                      );
                      const author = agents.find((a) => a.id === message.author_agent_id);
                      return (
                        <Message
                          key={message.id}
                          align={message.author === "user" ? "end" : "start"}
                          className="conversation-message"
                        >
                          <MessageContent>
                            <MessageHeader className="message-author [padding-inline:12px] [font-size:11px] [color:var(--text-tertiary)] font-normal">
                              {message.author === "user" ? "Kamu" : (author?.name ?? "Agent")}
                            </MessageHeader>
                            <Bubble
                              variant="secondary"
                              className={
                                message.author === "user"
                                  ? "chat-user-bubble"
                                  : "chat-agent-bubble [max-width:min(var(--chat-prose-max),_88%)] [max-width:min(var(--chat-bubble-max),_80%)]"
                              }
                            >
                              <BubbleContent className="chat-bubble-content [font-size:15px] [line-height:1.6] [white-space:pre-wrap]">
                                {message.author === "user" ? (
                                  message.text
                                ) : (
                                  <Answer text={message.text || "Sedang menulis…"} />
                                )}
                              </BubbleContent>
                            </Bubble>
                            {run && (
                              <div className="message-run-state space-y-2">
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
                                      <Button
                                        variant="ghost"
                                        type="button"
                                        className="text-link underline"
                                        onClick={() => openSettings()}
                                      >
                                        Periksa pengaturan
                                      </Button>
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
              <div className="composer-dock [max-width:calc(var(--chat-column-max)_+_16px)] [margin:auto] [padding:12px_24px_14px] w-full shrink-0">
                {connection?.login !== "authenticated" && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => openSettings()}
                    className="mb-3 h-auto max-w-full justify-start whitespace-normal px-0 text-left text-caption text-link"
                  >
                    Siapkan koneksi agar {agent?.name} bisa mulai bekerja →
                  </Button>
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
                  className="conversation-composer gap-2 p-2 rounded-[24px] [background:var(--composer)] [box-shadow:inset_0_0_0_1px_var(--composer-ring)] flex items-end"
                >
                  <Textarea
                    aria-label="Pesan"
                    value={pending ?? draft}
                    readOnly={pending !== null}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={`Pesan${agent ? ` untuk ${agent.name}` : ""}…`}
                    className="composer-input"
                    rows={1}
                    onInput={(event) => {
                      event.currentTarget.style.height = "auto";
                      event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 144)}px`;
                    }}
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
                  <div className="composer-actions gap-2 flex items-end shrink-0">
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
                        className="composer-send"
                        aria-label={
                          busy
                            ? "Mengirim"
                            : pending
                              ? "Periksa pengiriman"
                              : activeRun
                                ? "Antrekan"
                                : "Kirim"
                        }
                        title={
                          pending
                            ? "Periksa pengiriman"
                            : activeRun
                              ? "Antrekan pesan"
                              : "Kirim pesan"
                        }
                        size="icon"
                        disabled={
                          busy ||
                          !(pending ?? draft).trim() ||
                          !agent ||
                          snapshot.thread.type !== "dm"
                        }
                      >
                        {busy ? (
                          <Spinner />
                        ) : (
                          <HugeiconsIcon icon={ArrowUp02Icon} strokeWidth={1.8} />
                        )}
                      </Button>
                    </div>
                  </div>
                </form>
              </div>
            </>
          )}
        </main>
        {details && !mobile && (
          <aside
            className="workspace-details w-80 [border-left:1px_solid_var(--border-subtle)] [border-radius:0_16px_16px_0] shrink-0 min-h-0 overflow-y-auto bg-background"
            aria-label="Detail percakapan"
          >
            <div className="details-toolbar gap-1 p-3 flex justify-end items-center">
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full"
                aria-label="Pengaturan agent"
                onClick={() => {
                  setConfigurationOpen(true);
                }}
              >
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.6} />
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Tutup detail"
                onClick={() => setDetails(false)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={1.6} />
              </Button>
            </div>
            {panel}
          </aside>
        )}
        <Sheet open={details && mobile && !isSettings} onOpenChange={setDetails}>
          <SheetContent className="context-sheet w-full data-[side=right]:w-full data-[side=right]:sm:max-w-none overflow-y-auto border-0 bg-background p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Detail percakapan</SheetTitle>
              <SheetDescription>Profil dan konteks percakapan.</SheetDescription>
            </SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
        <Dialog
          open={!!editing && !isSettings}
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
      <Outlet />
    </SettingsWorkspaceContext.Provider>
  );
}
