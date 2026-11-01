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
import { Textarea } from "@/components/ui/textarea";
import { useIsMobile } from "@/hooks/use-mobile";

type SettingsPageId = "general" | "providers" | "about";

import { Answer } from "@/features/conversation/components/answer";
import { AttachInput, attachmentIssue } from "@/features/conversation/components/attach-input";
import { ContextPanel, type PanelLocation } from "@/features/conversation/components/context-panel";
import { CreateGroup } from "@/features/conversation/components/create-group";
import { HumanReply } from "@/features/conversation/components/human-reply";
import { AgentAvatar, agentStyle } from "@/features/conversation/components/identity";
import { NativeInteractions } from "@/features/conversation/components/native-interactions";
import { ConversationNavigation } from "@/features/conversation/components/navigation";
import { ToolChips } from "@/features/conversation/components/tool-chips";
import { WorkActivity } from "@/features/conversation/components/work-activity";
import { SettingsWorkspaceContext } from "@/hooks/settings-workspace";
import { useWorkspace } from "@/hooks/use-workspace";
import { command, durableCommand, pendingMessage, request } from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import type { Artifact } from "@/types/work";
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
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [location, locate] = useState<PanelLocation>({ tab: "agent", id: null });
  const [attachments, setAttachments] = useState<Artifact[]>([]);
  const currentThread = useRef(threadId);
  currentThread.current = threadId;
  const [editing, setEditing] = useState<MessageEntity | null>(null);
  const [editText, setEditText] = useState("");
  const [older, setOlder] = useState<MessageEntity[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const mobile = useIsMobile();
  const pending = threadId ? pendingMessage(threadId) : null;
  const agent = snapshot?.agents[0];
  const connection = connections.find((c) => c.id === agent?.connection_id);
  const activeRuns =
    snapshot?.runs.filter((run) =>
      ["running", "dispatching", "cancel_requested"].includes(run.status),
    ) ?? [];
  const activeRun = activeRuns[0];
  const report = useCallback((message: string) => setError(message), [setError]);
  function openSettings(page: SettingsPageId = "providers") {
    setNavigation(false);
    void navigate({ to: "/settings", search: { section: page === "general" ? undefined : page } });
  }
  function choose(id: string) {
    currentThread.current = id;
    select(id);
    setOlder([]);
    setBefore(null);
    setHistoryLoaded(false);
    setNavigation(false);
    setDetails(false);
    setConfigurationOpen(false);
    setDraft("");
    setAttachments([]);
    locate({ tab: "agent", id: null });
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
      await durableCommand(
        `message:${threadId}`,
        snapshot?.thread.type === "group" ? `/v1/groups/${threadId}/messages` : "/v1/runs",
        snapshot?.thread.type === "group"
          ? { text }
          : {
              thread_id: threadId,
              agent_id: agent.id,
              text,
              artifact_ids: attachments.map((a) => a.id),
            },
      );
      if (currentThread.current !== threadId) return;
      setDraft("");
      setAttachments([]);
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
      createGroup={() => {
        setCreateMenu(false);
        setNavigation(false);
        setCreateGroupOpen(true);
      }}
      choose={choose}
      openSettings={() => {
        openSettings("general");
      }}
    />
  );
  function compose(text: string) {
    setDraft(text);
    setDetails(false);
  }
  function openResource(tab: PanelLocation["tab"], id: string) {
    locate({ tab, id });
    setDetails(true);
  }
  async function source(id?: string) {
    setDetails(false);
    if (!id || !threadId) return;
    let cursor = historyLoaded ? before : snapshot?.next_before;
    let found = snapshot?.messages.some((m) => m.id === id) || older.some((m) => m.id === id);
    const loaded: MessageEntity[] = [];
    while (!found && cursor) {
      const page = await request<{ messages: MessageEntity[]; next_before: string | null }>(
        `/v1/threads/${threadId}/history?before=${cursor}&limit=100`,
      );
      if (currentThread.current !== threadId) return;
      loaded.unshift(...page.messages);
      found = page.messages.some((m) => m.id === id);
      cursor = page.next_before;
    }
    if (loaded.length) {
      setOlder((v) => [...loaded, ...v]);
      setBefore(cursor ?? null);
      setHistoryLoaded(true);
    }
    requestAnimationFrame(() =>
      document
        .getElementById(`message-${id}`)
        ?.scrollIntoView({ block: "center", behavior: "instant" }),
    );
  }
  function attach(a: Artifact) {
    if (a.thread_id !== currentThread.current) return;
    const issue = attachmentIssue(a.media_type, connection, agent?.model_id);
    if (issue) {
      report(issue);
      return;
    }
    if (
      attachments.length >= 20 ||
      (a.media_type.startsWith("image/") &&
        attachments.filter((item) => item.media_type.startsWith("image/")).length >= 4)
    ) {
      report("Batas lampiran pesan tercapai (20 file atau 4 gambar).");
      return;
    }
    setAttachments((v) => (v.some((item) => item.id === a.id) ? v : [...v, a]));
    setDetails(false);
  }
  const panel = snapshot ? (
    <ContextPanel
      key={snapshot.thread.id}
      snapshot={snapshot}
      agents={agents}
      threads={threads}
      connections={connections}
      location={location}
      locate={locate}
      refresh={refresh}
      report={report}
      compose={compose}
      source={(id) => void source(id).catch((e) => report(e.message))}
      attach={attach}
      manageProviders={() => openSettings("providers")}
      configurationOpen={configurationOpen}
      setConfigurationOpen={setConfigurationOpen}
    />
  ) : null;
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
                onClick={() => {
                  if (!details) locate({ tab: "agent", id: null });
                  setDetails((value) => !value);
                }}
                disabled={!agent}
                aria-label={`Detail ${snapshot?.thread.name ?? agent?.name ?? "agent"}`}
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
                locate({ tab: "agent", id: null });
              }}
              title="Pengaturan model dan koneksi"
            >
              <span className="truncate">
                {snapshot?.thread.type === "group"
                  ? "Routing otomatis"
                  : (agent?.model_id ??
                    (agent?.harness === "muse" ? "Muse Code" : "Codex / ChatGPT"))}
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
                <span>{error}</span>
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
                      const steeringRun = activeRuns.find(
                        (active) => active.agent_id === run?.agent_id,
                      );
                      const steeringConnection = connections.find(
                        (c) =>
                          c.id ===
                          snapshot.agents.find((a) => a.id === steeringRun?.agent_id)
                            ?.connection_id,
                      );
                      return (
                        <Message
                          key={message.id}
                          id={`message-${message.id}`}
                          align={message.author === "user" ? "end" : "start"}
                          className="conversation-message"
                        >
                          <MessageContent>
                            <MessageHeader className="message-author [padding-inline:12px] [font-size:11px] [color:var(--text-tertiary)] font-normal">
                              {message.author === "user" ? (
                                "Kamu"
                              ) : snapshot.thread.type === "group" && author ? (
                                <button
                                  type="button"
                                  className="text-link hover:underline"
                                  onClick={() => openResource("agent", author.id)}
                                >
                                  {author.name}
                                </button>
                              ) : (
                                (author?.name ?? "Agent")
                              )}
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
                                  <Answer
                                    text={message.text || "Sedang menulis…"}
                                    openResource={(tab, id) => openResource(tab, id)}
                                    snapshot={snapshot}
                                  />
                                )}
                              </BubbleContent>
                            </Bubble>
                            {message.artifact_ids?.map((id) => (
                              <Button
                                key={id}
                                variant="outline"
                                size="sm"
                                onClick={() => openResource("files", id)}
                              >
                                {snapshot.artifacts.find((a) => a.id === id)?.name ??
                                  "Buka lampiran"}
                              </Button>
                            ))}
                            {snapshot.human_requests
                              .filter((r) => r.message_id === message.id)
                              .map((r) => (
                                <HumanReply
                                  key={r.id}
                                  request={r}
                                  author={author?.name ?? "Agent"}
                                  refresh={refresh}
                                />
                              ))}
                            <WorkActivity
                              message={message}
                              run={run}
                              snapshot={snapshot}
                              open={openResource}
                            />
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
                                      {steeringRun?.native_run_id &&
                                        steeringConnection?.capabilities.steer === "supported" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy}
                                            onClick={() =>
                                              void act(async () => {
                                                await command(`/v1/runs/${steeringRun.id}/steer`, {
                                                  queued_run_id: run.id,
                                                  expected_native_run_id: steeringRun.native_run_id,
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
                  {activeRuns
                    .filter(
                      (run) =>
                        run.status === "running" &&
                        connections.find(
                          (c) =>
                            c.id ===
                            snapshot.agents.find((a) => a.id === run.agent_id)?.connection_id,
                        )?.capabilities.permission_requests === "supported",
                    )
                    .map((run) => (
                      <NativeInteractions
                        key={run.id}
                        runId={run.id}
                        author={snapshot.agents.find((a) => a.id === run.agent_id)?.name ?? "Agent"}
                      />
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
                {attachments.length > 0 && (
                  <fieldset className="mb-2 flex flex-wrap gap-2" aria-label="Lampiran pesan">
                    {attachments.map((a) => (
                      <Button
                        key={a.id}
                        variant="secondary"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => setAttachments((v) => v.filter((item) => item.id !== a.id))}
                        aria-label={`Hapus lampiran ${a.name}`}
                      >
                        {a.name} ×
                      </Button>
                    ))}
                  </fieldset>
                )}
                {activeRuns.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-2" aria-label="Run aktif" role="status">
                    {activeRuns.map((run) => {
                      const label =
                        run.status === "cancel_requested"
                          ? "Stop diminta"
                          : snapshot.thread.type === "group"
                            ? `Stop ${snapshot.agents.find((a) => a.id === run.agent_id)?.name ?? "run"}`
                            : "Stop run";
                      return (
                        <Button
                          key={run.id}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="max-w-full"
                          aria-label={label}
                          title={label}
                          disabled={busy || run.status === "cancel_requested"}
                          onClick={() =>
                            void act(async () => {
                              await command(`/v1/runs/${run.id}/cancel`);
                            })
                          }
                        >
                          <span className="truncate">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    send();
                  }}
                  className="conversation-composer gap-2 p-2 rounded-[24px] [background:var(--composer)] [box-shadow:inset_0_0_0_1px_var(--composer-ring)] flex items-end"
                >
                  <AttachInput
                    key={snapshot.thread.id}
                    snapshot={snapshot}
                    connection={connection}
                    disabled={busy || pending !== null}
                    count={attachments.length}
                    imageCount={attachments.filter((a) => a.media_type.startsWith("image/")).length}
                    attach={attach}
                    report={report}
                    refresh={refresh}
                  />
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
                        disabled={busy || !(pending ?? draft).trim() || !agent}
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
        <CreateGroup
          agents={agents}
          open={createGroupOpen && !isSettings}
          onOpenChange={setCreateGroupOpen}
          created={async (thread) => {
            choose(thread.id);
          }}
        />
      </div>
      <Outlet />
    </SettingsWorkspaceContext.Provider>
  );
}
