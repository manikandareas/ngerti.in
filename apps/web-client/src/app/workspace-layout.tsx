import {
  ArrowRight01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  Clock01Icon,
  ComputerIcon,
  Menu01Icon,
  PencilEdit01Icon,
  StopIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import { Answer } from "@/features/conversation/components/answer";
import { AttachInput } from "@/features/conversation/components/attach-input";
import {
  ComposerInput,
  type ComposerInputHandle,
} from "@/features/conversation/components/composer-input";
import { ContextPanel, type PanelLocation } from "@/features/conversation/components/context-panel";
import { CreateGroup } from "@/features/conversation/components/create-group";
import { HumanReply } from "@/features/conversation/components/human-reply";
import { AgentAvatar, agentStyle } from "@/features/conversation/components/identity";
import { MessageTime } from "@/features/conversation/components/message-time";
import { ModelPicker } from "@/features/conversation/components/model-picker";
import { NativeInteractions } from "@/features/conversation/components/native-interactions";
import { ConversationNavigation } from "@/features/conversation/components/navigation";
import {
  type QueuedMessage,
  QueuedMessages,
} from "@/features/conversation/components/queued-messages";
import { UserMessageText } from "@/features/conversation/components/user-message-text";
import { WorkActivity } from "@/features/conversation/components/work-activity";
import { WorkspaceProviders } from "@/features/conversation/components/workspace-providers";
import { attachmentParts } from "@/features/conversation/lib/attachment-references";
import { referenceTarget } from "@/features/conversation/lib/inline-references";
import {
  prepareSubmission,
  RejectedSubmission,
} from "@/features/conversation/lib/message-submission";
import { messageTimeline } from "@/features/conversation/lib/message-timeline";
import {
  type NativeTranscriptFragment,
  useNativeTranscript,
} from "@/features/conversation/lib/native-transcript";
import { useComposerAttachments } from "@/features/conversation/lib/use-composer-attachments";
import { useConversationDraft } from "@/features/conversation/lib/use-conversation-draft";
import { useMessageSubmission } from "@/features/conversation/lib/use-message-submission";
import { useSettingsDialog } from "@/features/settings/hooks/use-settings-dialog";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useWorkspace } from "@/hooks/use-workspace";
import {
  ApiError,
  command,
  durableCommand,
  pendingMessage,
  pendingText,
  request,
} from "@/lib/api-client";
import { repairMessage } from "@/lib/api-errors";
import type { NativeInteractionSnapshot } from "@/types/native-interactions";
import type { Message as MessageEntity, Run, Thread } from "@/types/workspace";

const statusText: Record<string, string> = {
  queued: "Menghubungkan",
  dispatching: "Menghubungkan",
  running: "Sedang bekerja",
  cancel_requested: "Stop diminta",
  cancelled: "Dihentikan",
  succeeded: "Selesai",
  failed: "Gagal",
  unknown: "Hasil belum diketahui",
  steered: "Arahan diterima",
};
const controlText: Record<string, string> = {
  requested: "Mengirim arahan",
  accepted: "Arahan diterima harness",
  rejected: "Arahan belum diterapkan",
  unknown: "Hasil pengiriman arahan belum diketahui",
  complete: "Pengiriman arahan selesai",
};
const DOUBLE_ENTER_STEER_WINDOW_MS = 1500;
const SettingsDialog = lazy(() => import("@/features/settings/components/settings-dialog"));

export default function Workspace() {
  const workspace = useWorkspace();
  const { isOpen: isSettings, open: showSettings, close: closeSettings } = useSettingsDialog();
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
  const [draft, setDraft] = useConversationDraft(threadId);
  const [composerFocused, setComposerFocused] = useState(false);
  const conversationSurface = useRef<HTMLElement>(null);
  const composerInput = useRef<ComposerInputHandle>(null);
  const pendingComposerFocus = useRef(false);
  const bindComposerInput = useCallback((input: ComposerInputHandle | null) => {
    composerInput.current = input;
    if (input && pendingComposerFocus.current) {
      pendingComposerFocus.current = false;
      input.focus();
    }
  }, []);
  const queuedEditInput = useRef<ComposerInputHandle>(null);
  const [multiline, setMultiline] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [navigation, setNavigation] = useState(false);
  const [details, setDetails] = useState(false);
  const [createMenu, setCreateMenu] = useState(false);
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [location, locate] = useState<PanelLocation>({ tab: "detail", id: null });
  const currentThread = useRef(threadId);
  currentThread.current = threadId;
  const [editing, setEditing] = useState<MessageEntity | null>(null);
  const [editText, setEditText] = useState("");
  const [older, setOlder] = useState<MessageEntity[]>([]);
  const [before, setBefore] = useState<string | null>(null);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const mobile = useIsMobile();
  const narrowNavigation = useMediaQuery("(max-width: 1279.98px)");
  useEffect(() => {
    if (!narrowNavigation) setNavigation(false);
  }, [narrowNavigation]);
  const submission = useMessageSubmission(threadId);
  useEffect(() => {
    if (submission.failure) setError(submission.failure);
  }, [submission.failure, setError]);
  const pending =
    (threadId ? pendingMessage(threadId) : null) ?? submission.pending?.body.text ?? null;
  const editPending = editing ? pendingText(`queued-edit:${editing.id}`) : null;
  const agent = snapshot?.agents[0];
  const connection = connections.find((c) => c.id === agent?.connection_id);
  const activeRuns =
    snapshot?.runs.filter((run) =>
      ["running", "dispatching", "cancel_requested"].includes(run.status),
    ) ?? [];
  const activeRun = activeRuns[0];
  const stopInSlot = !editing && activeRuns.length === 1 && !pending && !draft.trim();
  function stopLabel(run: Run) {
    return run.status === "cancel_requested"
      ? "Stop diminta"
      : snapshot?.thread.type === "group"
        ? `Stop ${snapshot.agents.find((agent) => agent.id === run.agent_id)?.name ?? "run"}`
        : "Stop run";
  }
  function stop(run: Run) {
    void act(async () => {
      await command(`/v1/runs/${run.id}/cancel`);
    });
  }
  const report = useCallback((message: string) => setError(message), [setError]);
  const composerFiles = useComposerAttachments({
    threadId,
    snapshot,
    connection,
    connections,
    draft: pending ?? draft,
    pending: submission.pending,
    input: composerInput,
    disabled: busy || submission.loading || !!submission.failure || pending !== null || !!editing,
    report,
    attached: () => setDetails(false),
  });
  const attachments = composerFiles.referenced(pending ?? draft);
  const attachmentsBlocked =
    (pending === null &&
      attachments.some((file) => file.state === "uploading" || file.state === "failed")) ||
    submission.loading ||
    !!submission.failure;
  useLayoutEffect(() => {
    const surface = conversationSurface.current;
    if (!surface) return;
    const header = surface.querySelector<HTMLElement>(".workspace-chat-header");
    const notice = error ? surface.querySelector<HTMLElement>(".workspace-error") : null;
    const dock = snapshot?.thread.id ? surface.querySelector<HTMLElement>(".composer-dock") : null;
    const measure = () => {
      const top = surface.getBoundingClientRect().top;
      const headerBottom = (notice ?? header)?.getBoundingClientRect().bottom ?? top;
      const dockHeight = dock?.getBoundingClientRect().height ?? 0;
      surface.style.setProperty("--conversation-top", `${headerBottom - top}px`);
      surface.style.setProperty("--conversation-bottom", `${dockHeight}px`);
    };
    const observer = new ResizeObserver(measure);
    for (const element of [header, notice, dock]) {
      if (element) observer.observe(element);
    }
    measure();
    return () => observer.disconnect();
  }, [snapshot?.thread.id, error]);
  useLayoutEffect(() => {
    const input = queuedEditInput.current;
    if (!input || !editing?.id) return;
    input.focus(true);
  }, [editing?.id]);
  function openSettings(page: SettingsSectionId = "providers") {
    setNavigation(false);
    void showSettings(page);
  }
  function choose(id: string) {
    currentThread.current = id;
    select(id);
    setOlder([]);
    setBefore(null);
    setHistoryLoaded(false);
    setNavigation(false);
    setDetails(false);
    pendingComposerFocus.current = false;
    setEditing(null);
    setEditText("");
    locate({ tab: "detail", id: null });
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
    if (editing) {
      saveQueuedEdit();
      return;
    }
    if (!agent || !threadId || !(pending ?? draft).trim() || (!pending && attachmentsBlocked))
      return;
    const text = pending ?? draft;
    void act(async () => {
      const content = pending
        ? { text, artifact_ids: [], sources: [] }
        : composerFiles.message(text);
      if (submission.failure) throw new Error(submission.failure);
      if (submission.pending || content.artifact_ids.length) {
        const operation =
          submission.pending ??
          prepareSubmission(threadId, agent.id, content.text, content.sources);
        if (!submission.pending && snapshot?.thread.type === "group") {
          const target = referenceTarget(content.text);
          if (target) operation.body.agent_id = target;
        }
        composerFiles.restore(operation);
        try {
          await submission.send(operation, (id, state) =>
            composerFiles.progress(threadId, id, state),
          );
        } catch (error) {
          if (error instanceof RejectedSubmission && currentThread.current === threadId) {
            composerFiles.restore(error.operation);
            setDraft(error.operation.body.text);
          }
          throw error;
        }
      } else
        await durableCommand(
          `message:${threadId}`,
          snapshot?.thread.type === "group" ? `/v1/groups/${threadId}/messages` : "/v1/runs",
          snapshot?.thread.type === "group"
            ? { text: content.text, agent_id: referenceTarget(content.text) }
            : {
                thread_id: threadId,
                agent_id: agent.id,
                text: content.text,
                artifact_ids: content.artifact_ids,
              },
        );
      if (currentThread.current !== threadId) return;
      setDraft("");
    });
  }

  async function queueCommand<T>(slot: string, path: string, body: unknown): Promise<T> {
    try {
      return await durableCommand<T>(slot, path, body);
    } catch (failure) {
      // A definitive stale-state rejection can be corrected; an indeterminate reply keeps its exact operation.
      if (
        failure instanceof ApiError &&
        ["CONFLICT", "STALE_DISPATCH", "IDEMPOTENCY_CONFLICT"].includes(failure.code)
      ) {
        localStorage.removeItem(`ngertiin:pending:${slot}`);
        await refresh().catch(() => {});
      }
      throw failure;
    }
  }
  function focusComposer() {
    const input = composerInput.current;
    if (input) input.focus();
    else pendingComposerFocus.current = true;
  }
  function editQueued(message: MessageEntity) {
    if (busy || pending || editing) return;
    setEditing(message);
    setEditText(pendingText(`queued-edit:${message.id}`) ?? message.text);
  }
  function cancelQueuedEdit() {
    if (busy || editPending !== null) return;
    setEditing(null);
    setEditText("");
    focusComposer();
  }
  function saveQueuedEdit() {
    if (!editing || (editStale && editPending === null) || !(editPending ?? editText).trim())
      return;
    const message = editing;
    void act(async () => {
      await queueCommand(`queued-edit:${message.id}`, `/v1/messages/${message.id}/edit`, {
        expected_revision: message.revision,
        text: editPending ?? editText,
      });
      if (currentThread.current !== message.thread_id) return;
      setEditing(null);
      setEditText("");
      focusComposer();
    });
  }
  const nav = (
    <ConversationNavigation
      agents={agents}
      threads={threads}
      activities={workspace.activity.items}
      previews={workspace.previews.items}
      closeNavigation={mobile ? () => setNavigation(false) : undefined}
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
      openApps={() => {
        setNavigation(false);
        setDetails(true);
        locate({ tab: "detail", id: null, page: "apps" });
      }}
      openSettings={() => {
        openSettings("general");
      }}
    />
  );
  function restoreNavigationFocus(event: Event) {
    event.preventDefault();
    // Another modal may own focus before the navigation exit finishes.
    if (document.querySelector('[role="dialog"][data-state="open"]')) return;
    const toggle = document.querySelector<HTMLButtonElement>(
      '.workspace-shell button[aria-label="Buka percakapan"]',
    );
    if (
      toggle?.isConnected &&
      toggle.getClientRects().length > 0 &&
      !toggle.closest('[inert], [aria-hidden="true"]')
    )
      toggle.focus({ preventScroll: true });
  }
  function compose(text: string) {
    setDraft(text);
    setDetails(false);
  }
  function openResource(kind: "agent" | "files" | "goals" | "routine", id: string) {
    locate(
      kind === "files"
        ? { tab: "library", id }
        : kind === "agent"
          ? { tab: "detail", id: snapshot?.thread.type === "group" ? id : null }
          : { tab: "detail", page: kind, id },
    );
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
      attach={composerFiles.attachArtifact}
      manageProviders={() => openSettings("providers")}
    />
  ) : null;
  const messages = [
    ...older.filter((m) => !snapshot?.messages.some((current) => current.id === m.id)),
    ...(snapshot?.messages ?? []),
  ];
  function hasPendingNative(run: Run) {
    return (run.native_interactions ?? []).some(
      (record) => record.observed_state === "pending" && record.submission?.state !== "submitted",
    );
  }
  const timeline = messageTimeline(messages, snapshot?.runs ?? []);
  const queued = timeline.queued.map(({ message, run }) => {
    const active = activeRuns.find((active) => active.agent_id === run.agent_id);
    const nativeConnection = connections.find(
      (connection) =>
        connection.id ===
        snapshot?.agents.find((agent) => agent.id === active?.agent_id)?.connection_id,
    );
    const target =
      active?.status === "running" &&
      active.cancellation === "none" &&
      active.native_run_id &&
      !activeRuns.some(hasPendingNative) &&
      nativeConnection?.state === "active" &&
      nativeConnection.login === "authenticated" &&
      nativeConnection?.capabilities.steer === "supported"
        ? active
        : undefined;
    return { message, run, target };
  });
  const editItem = editing ? queued.find((item) => item.message.id === editing.id) : null;
  const editStale = !!editing && (!editItem || editItem.message.revision !== editing.revision);
  const queueHead = queued[0];
  const steerTargetId = queueHead?.target?.id ?? null;
  const steerAgainUntil = useRef(0);
  const previousQueue = useRef({ threadId, count: queued.length });
  useEffect(() => {
    if (previousQueue.current.threadId !== threadId || !steerTargetId || editing) {
      steerAgainUntil.current = 0;
    } else if (queued.length > previousQueue.current.count) {
      // Source ComposerQueuedMessages: a second empty Enter within 1.5s steers the next queued message.
      steerAgainUntil.current = Date.now() + DOUBLE_ENTER_STEER_WINDOW_MS;
    }
    previousQueue.current = { threadId, count: queued.length };
  }, [threadId, queued.length, steerTargetId, editing]);
  function steerQueued(item: QueuedMessage) {
    const target = item.target;
    if (!target?.native_run_id || busy || pending !== null || editing) return;
    steerAgainUntil.current = 0;
    void act(async () => {
      // A fresh authorized observation closes the gap before the background poll reaches the journal.
      const observed = await Promise.all(
        activeRuns
          .filter(canObserveNative)
          .map((run) => request<NativeInteractionSnapshot>(`/v1/runs/${run.id}/interactions`)),
      );
      if (observed.some((native) => native.approvals.length || native.user_inputs.length)) {
        report("Jawab permintaan agent yang sedang menunggu sebelum mengarahkan antrean.");
        return;
      }
      await queueCommand(`queued-steer:${item.run.id}`, `/v1/runs/${target.id}/steer`, {
        queued_run_id: item.run.id,
        expected_native_run_id: target.native_run_id,
      });
    });
  }
  const visibleMessages = timeline.messages;
  const nativeTranscript = useNativeTranscript(visibleMessages, snapshot?.runs ?? []);
  function canObserveNative(run: Run) {
    const connection = connections.find(
      (connection) =>
        connection.id ===
        snapshot?.agents.find((agent) => agent.id === run.agent_id)?.connection_id,
    );
    return (
      run.status === "running" &&
      run.cancellation === "none" &&
      connection?.state === "active" &&
      connection.login === "authenticated" &&
      connection.capabilities.permission_requests === "supported"
    );
  }
  function nativeFragment(fragment: NativeTranscriptFragment) {
    const author = snapshot?.agents.find((agent) => agent.id === fragment.run.agent_id);
    return (
      <div key={fragment.key} data-native-fragment={fragment.key} className="w-full py-1">
        <NativeInteractions
          runId={fragment.run.id}
          run={fragment.run}
          author={author?.name ?? "Agent"}
          agent={author}
          observePending={false}
          canRespond={canObserveNative(fragment.run)}
          recordIds={fragment.recordIds}
          refresh={refresh}
        />
      </div>
    );
  }
  function answer(message: MessageEntity) {
    const author = agents.find((agent) => agent.id === message.author_agent_id);
    const sender =
      snapshot?.thread.type === "group" && message.author === "agent"
        ? {
            name: author?.name ?? "Agent",
            style: agentStyle(author),
            open: author ? () => openResource("agent", author.id) : undefined,
          }
        : undefined;
    const anchors = nativeTranscript.anchors.get(message.id) ?? [];
    if (!anchors.length)
      return (
        <Answer
          agentId={author?.id}
          sentAt={message.created_at}
          sender={sender}
          text={message.text || "Sedang menulis…"}
          openResource={openResource}
          snapshot={snapshot ?? undefined}
        />
      );
    let start = 0;
    const parts = anchors.map(({ offset, fragments }) => {
      const text = message.text.slice(start, offset);
      start = offset;
      return (
        <Fragment key={offset}>
          {text && (
            <Answer
              agentId={author?.id}
              sentAt={message.created_at}
              sender={sender}
              text={text}
              openResource={openResource}
              snapshot={snapshot ?? undefined}
            />
          )}
          {fragments.map(nativeFragment)}
        </Fragment>
      );
    });
    return (
      <>
        {parts}
        {start < message.text.length && (
          <Answer
            agentId={author?.id}
            sentAt={message.created_at}
            sender={sender}
            text={message.text.slice(start)}
            openResource={openResource}
            snapshot={snapshot ?? undefined}
          />
        )}
      </>
    );
  }
  function joins(upper: MessageEntity | undefined, lower: MessageEntity | undefined) {
    if (
      !upper ||
      !lower ||
      upper.author !== lower.author ||
      upper.author_agent_id !== lower.author_agent_id
    )
      return false;
    const plain = (message: MessageEntity) =>
      !message.artifact_ids.length &&
      !nativeTranscript.anchors.has(message.id) &&
      !snapshot?.human_requests.some((request) => request.message_id === message.id) &&
      !snapshot?.runs.some(
        (run) =>
          run.input_message_id === message.id &&
          (run.status !== "succeeded" ||
            run.native_tools.length > 0 ||
            run.product_tools.length > 0),
      );
    return plain(upper) && plain(lower);
  }
  const detailToolbar = (
    <div className="details-toolbar flex shrink-0 items-center justify-end gap-1 p-3">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={mobile ? "Close" : "Tutup detail"}
        onClick={() => setDetails(false)}
      >
        <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
      </Button>
    </div>
  );
  return (
    <WorkspaceProviders
      snapshot={snapshot}
      activity={{
        items: workspace.activity.items,
        threadId,
        listeningThreadId: composerFocused && draft.trim() ? threadId : null,
        online: workspace.online,
      }}
      settings={{
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
          locate({ tab: "detail", id: null });
          void closeSettings();
        },
      }}
    >
      <div
        className="workspace-shell [height:100svh] [background:var(--frame)] [padding:8px_8px_8px_0] flex min-h-0 overflow-hidden"
        style={snapshot?.thread.type === "group" ? undefined : agentStyle(agent)}
        data-group={snapshot?.thread.type === "group" ? "true" : undefined}
      >
        {!mobile && (
          <aside className={`workspace-sidebar ${details ? "workspace-sidebar-with-details" : ""}`}>
            {nav}
          </aside>
        )}
        <Drawer open={navigation && mobile && !isSettings} onOpenChange={setNavigation} autoFocus>
          <DrawerContent
            className="navigation-drawer gap-0 overflow-hidden border-0 bg-background p-0"
            onCloseAutoFocus={restoreNavigationFocus}
          >
            <DrawerHeader className="sr-only">
              <DrawerTitle>Percakapan</DrawerTitle>
              <DrawerDescription>Pilih agent atau percakapan.</DrawerDescription>
            </DrawerHeader>
            {nav}
          </DrawerContent>
        </Drawer>
        <Sheet
          open={navigation && narrowNavigation && !mobile && !isSettings}
          onOpenChange={setNavigation}
        >
          <SheetContent
            side="left"
            className="navigation-sheet w-[280px] gap-0 border-0 bg-frame p-0"
            onCloseAutoFocus={restoreNavigationFocus}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Percakapan</SheetTitle>
              <SheetDescription>Pilih agent atau percakapan.</SheetDescription>
            </SheetHeader>
            {nav}
          </SheetContent>
        </Sheet>
        <main
          ref={conversationSurface}
          className="workspace-main rounded-[16px] flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-background"
          aria-label="Percakapan aktif"
          data-details={details && !mobile}
        >
          <header className="workspace-chat-header [grid-template-columns:minmax(0,_1fr)_auto_minmax(0,_1fr)] gap-2.5 [padding:10px_20px] grid items-center shrink-0">
            <Button
              variant="ghost"
              size="icon"
              className={
                mobile
                  ? "navigation-toggle header-action rounded-full"
                  : "navigation-toggle rounded-full"
              }
              aria-label="Buka percakapan"
              onClick={() => setNavigation(true)}
            >
              <HugeiconsIcon icon={Menu01Icon} size={18} strokeWidth={1.5} />
            </Button>
            <div className="header-identity-position [grid-column:2] [grid-row:1] [padding-left:0] flex justify-center flex-1 min-w-0">
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  if (!details) locate({ tab: "detail", id: null });
                  setDetails((value) => !value);
                }}
                disabled={!agent}
                aria-label={`Detail ${snapshot?.thread.name ?? agent?.name ?? "agent"}`}
                aria-expanded={details}
                aria-controls="conversation-details"
                className="header-action header-identity group gap-2 [max-width:100%] [padding:7.5px_13.5px_7.5px_7.5px] [border-radius:999px] inline-flex items-center min-w-0 font-medium h-auto"
              >
                <AgentAvatar
                  agent={agent}
                  group={snapshot?.thread.type === "group"}
                  members={snapshot?.agents}
                  className="size-6 rounded-lg text-xs"
                />
                <span className="truncate">
                  {snapshot?.thread.name ?? agent?.name ?? "Percakapan"}
                </span>
                {!details && (
                  <span
                    aria-hidden="true"
                    className="-ml-2 flex w-0 shrink-0 overflow-hidden opacity-0 transition-[width,margin,opacity] duration-[140ms] group-hover:ml-0 group-hover:w-3 group-hover:opacity-100 group-focus-visible:ml-0 group-focus-visible:w-3 group-focus-visible:opacity-100"
                  >
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-3 shrink-0 text-muted-foreground"
                    />
                  </span>
                )}
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
            <div className="header-model-actions col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-3">
              {snapshot?.thread.type === "group" ? (
                <Button
                  variant="ghost"
                  className="header-action model-selector rounded-full text-[13px]"
                  onClick={() => {
                    setDetails(true);
                    locate({ tab: "detail", id: null });
                  }}
                >
                  Routing otomatis
                </Button>
              ) : (
                <ModelPicker
                  key={agent?.id}
                  className="header-action"
                  agent={agent}
                  connections={connections}
                  refresh={refresh}
                  report={report}
                  manageProviders={() => openSettings("providers")}
                />
              )}
              <Button
                variant="ghost"
                size="icon"
                className="header-action header-browser-action hidden shrink-0 sm:inline-flex"
                aria-label="Browser agent"
                title="Browser agent"
                onClick={() => {
                  setDetails(true);
                  locate({ tab: "computer", id: null });
                }}
              >
                <HugeiconsIcon icon={ComputerIcon} className="size-[18px]" strokeWidth={1.5} />
              </Button>
            </div>
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
              <Conversation key={threadId} className="conversation-viewport min-h-0">
                <ConversationContent
                  scrollClassName="conversation-scroll"
                  className="conversation-column [max-width:var(--chat-column-max)] [margin-inline:auto] gap-4 w-full"
                >
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
                  {visibleMessages.length === 0 && (
                    <div className="conversation-empty gap-3 [margin:auto] [padding:64px_24px] flex items-center flex-col text-center">
                      <AgentAvatar agent={agent} className="size-16 rounded-2xl text-2xl" />
                      <h1>{agent?.name ?? "Percakapan"}</h1>
                      <p>{agent?.soul || "Apa yang ingin kamu kerjakan bersama?"}</p>
                    </div>
                  )}
                  {visibleMessages.map((message, index) => {
                    const run = snapshot.runs.findLast(
                      (run) => run.input_message_id === message.id,
                    );
                    const author = agents.find((a) => a.id === message.author_agent_id);
                    const inlineAttachmentIds = new Set(
                      message.author === "user"
                        ? attachmentParts(message.text).flatMap((part) =>
                            "id" in part && snapshot.artifacts.some((file) => file.id === part.id)
                              ? [part.id]
                              : [],
                          )
                        : [],
                    );
                    return (
                      <Fragment key={message.id}>
                        <Message
                          id={`message-${message.id}`}
                          align={message.author === "user" ? "end" : "start"}
                          className="conversation-message"
                          data-join-above={joins(visibleMessages[index - 1], message) || undefined}
                          data-join-below={joins(message, visibleMessages[index + 1]) || undefined}
                        >
                          {snapshot.thread.type === "group" && message.author === "agent" && (
                            <button
                              type="button"
                              className="group-message-avatar mt-0.5 shrink-0 self-start rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={`Profil ${author?.name ?? "agent"}`}
                              disabled={!author}
                              onClick={() => {
                                if (author) openResource("agent", author.id);
                              }}
                            >
                              <AgentAvatar
                                agent={author}
                                className="size-8"
                                animated={message.state === "partial"}
                                state={message.state === "partial" ? undefined : "idle"}
                              />
                            </button>
                          )}
                          <MessageContent>
                            {!(snapshot.thread.type === "group" && message.author === "agent") && (
                              <MessageHeader
                                className={
                                  snapshot.thread.type === "group" && message.author !== "user"
                                    ? "message-author px-3 text-[12px] text-muted-foreground font-normal"
                                    : "sr-only"
                                }
                              >
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
                            )}
                            {message.author === "user" ? (
                              <Bubble variant="secondary" className="chat-user-bubble">
                                <BubbleContent className="chat-bubble-content text-[15px] leading-[22px] whitespace-pre-wrap">
                                  <div data-message-text>
                                    <UserMessageText
                                      message={message}
                                      artifacts={snapshot.artifacts}
                                      documents={snapshot.attachment_documents}
                                      preparing={
                                        run ? ["queued", "dispatching"].includes(run.status) : false
                                      }
                                    />
                                  </div>
                                  <MessageTime at={message.created_at} />
                                </BubbleContent>
                              </Bubble>
                            ) : (
                              answer(message)
                            )}
                            {message.artifact_ids
                              ?.filter((id) => !inlineAttachmentIds.has(id))
                              .map((id) => (
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
                                  agent={author}
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
                                  {run.status !== "succeeded" && (
                                    <span>{statusText[run.status] ?? run.status}</span>
                                  )}
                                  {run.status === "cancelled" && (
                                    <span>
                                      {run.cancellation === "confirmed"
                                        ? "Stop terkonfirmasi"
                                        : "Menunggu konfirmasi"}
                                    </span>
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
                                {run.diagnostic && run.status !== "succeeded" && (
                                  <div className="message-diagnostic rounded-xl bg-danger-soft px-3 py-2 text-[13px] leading-5 text-destructive">
                                    <p>{repairMessage(run.diagnostic.code)}</p>
                                    <Button
                                      variant="ghost"
                                      type="button"
                                      className="h-auto px-0 py-0 text-[12px] text-link underline"
                                      onClick={() => openSettings()}
                                    >
                                      Periksa pengaturan
                                    </Button>
                                    <details className="mt-1 text-[11px] text-muted-foreground">
                                      <summary className="w-fit cursor-pointer">
                                        Detail masalah
                                      </summary>
                                      <code>{run.diagnostic.code}</code>
                                    </details>
                                  </div>
                                )}
                              </div>
                            )}
                          </MessageContent>
                        </Message>
                        {message.author === "user" &&
                          nativeTranscript.anchors
                            .get(message.id)
                            ?.flatMap(({ fragments }) => fragments.map(nativeFragment))}
                      </Fragment>
                    );
                  })}
                  {snapshot.controls.map((control) => (
                    <p key={control.id} className="text-caption text-muted-foreground">
                      {controlText[control.state] ?? "Memeriksa arahan"}
                      {control.error_code ? ` · ${repairMessage(control.error_code)}` : ""}
                    </p>
                  ))}
                  {nativeTranscript.fallback.map((fragment) => (
                    <div key={fragment.key} data-native-history-fallback className="space-y-2">
                      <p className="text-[12px] text-muted-foreground">
                        Riwayat input ·{" "}
                        {snapshot.agents.find((agent) => agent.id === fragment.run.agent_id)
                          ?.name ?? "Agent"}
                      </p>
                      {nativeFragment(fragment)}
                    </div>
                  ))}
                  {activeRuns.filter(canObserveNative).map((run) => (
                    <NativeInteractions
                      key={run.id}
                      runId={run.id}
                      run={run}
                      observePending
                      recordIds={[]}
                      refresh={refresh}
                      author={snapshot.agents.find((a) => a.id === run.agent_id)?.name ?? "Agent"}
                      agent={snapshot.agents.find((a) => a.id === run.agent_id)}
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
                <ConversationScrollButton className="conversation-latest" />
              </Conversation>
              <div
                onFocusCapture={() => setComposerFocused(true)}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setComposerFocused(false);
                }}
                className="composer-dock [max-width:calc(var(--chat-column-max)_+_40px)] [margin:auto] [padding:12px_20px_16px] w-full shrink-0"
              >
                {connection?.login !== "authenticated" && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => openSettings()}
                    className="connection-setup-prompt mb-3 h-auto max-w-full justify-start whitespace-normal px-0 text-left text-caption text-link"
                  >
                    Siapkan koneksi agar {agent?.name} bisa mulai bekerja →
                  </Button>
                )}
                {activeRuns.length > 1 && (
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
                          className="max-w-full rounded-full"
                          aria-label={label}
                          title={label}
                          disabled={busy || run.status === "cancel_requested"}
                          onClick={() =>
                            void act(async () => {
                              await command(`/v1/runs/${run.id}/cancel`);
                            })
                          }
                        >
                          <HugeiconsIcon icon={StopIcon} size={10} className="fill-current" />
                          <span className="truncate">{label}</span>
                        </Button>
                      );
                    })}
                  </div>
                )}
                <QueuedMessages
                  items={queued}
                  busy={busy || !!editing || pending !== null}
                  settings={() => openSettings()}
                  edit={editQueued}
                  remove={(message) => {
                    void act(async () => {
                      await queueCommand(
                        `queued-delete:${message.id}`,
                        `/v1/messages/${message.id}/delete`,
                        {
                          expected_revision: message.revision,
                        },
                      );
                    });
                  }}
                  steer={steerQueued}
                />
                {editing && (
                  <div
                    data-queued-edit={editing.id}
                    className="flex items-center gap-2 px-3 pb-1.5 pt-2 text-[13px] leading-[18px] text-muted-foreground"
                  >
                    <HugeiconsIcon
                      icon={PencilEdit01Icon}
                      size={14}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      {editPending !== null
                        ? "Perubahan belum terkonfirmasi. Periksa operasi yang sama."
                        : editStale
                          ? "Pesan sudah diproses atau berubah. Buka lagi dari antrean untuk mengedit."
                          : "Mengedit pesan antrean"}
                    </span>
                    <button
                      type="button"
                      className="flex size-7 shrink-0 items-center justify-center rounded-lg hover:bg-accent hover:text-foreground disabled:opacity-40"
                      aria-label="Batal edit pesan"
                      title="Batal edit pesan"
                      disabled={busy || editPending !== null}
                      onClick={cancelQueuedEdit}
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={14} aria-hidden="true" />
                    </button>
                  </div>
                )}
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    send();
                  }}
                  className="conversation-composer gap-1.5 p-2 flex items-end"
                  data-multiline={multiline ? "true" : undefined}
                >
                  <AttachInput
                    key={snapshot.thread.id}
                    snapshot={snapshot}
                    disabled={busy || pending !== null || !!editing}
                    count={attachments.length}
                    addFiles={composerFiles.addFiles}
                  />
                  {editing ? (
                    <ComposerInput
                      ref={queuedEditInput}
                      label="Edit pesan"
                      value={editPending ?? editText}
                      readOnly={editPending !== null}
                      onChange={setEditText}
                      placeholder={`Pesan${agent ? ` untuk ${agent.name}` : ""}…`}
                      lookup={composerFiles.lookup}
                      retry={composerFiles.retry}
                      onFiles={() => {}}
                      onMultiline={setMultiline}
                      report={report}
                      onEscape={cancelQueuedEdit}
                      onEnter={saveQueuedEdit}
                      suggestions={false}
                    />
                  ) : (
                    <ComposerInput
                      key={snapshot.thread.id}
                      ref={bindComposerInput}
                      value={pending ?? draft}
                      readOnly={busy || pending !== null}
                      placeholder={`Pesan${agent ? ` untuk ${agent.name}` : ""}…`}
                      lookup={composerFiles.lookup}
                      retry={composerFiles.retry}
                      onChange={setDraft}
                      onMultiline={setMultiline}
                      onFiles={composerFiles.addFiles}
                      report={report}
                      onEnter={() => {
                        if (
                          !pending &&
                          !draft.trim() &&
                          attachments.length === 0 &&
                          queueHead?.target &&
                          Date.now() < steerAgainUntil.current
                        ) {
                          steerQueued(queueHead);
                          return;
                        }
                        send();
                      }}
                    />
                  )}
                  <div className="composer-actions gap-2 flex items-end shrink-0">
                    <div className="flex gap-2">
                      {activeRuns.length === 1 && !stopInSlot && activeRun && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="composer-aux rounded-full"
                          aria-label={stopLabel(activeRun)}
                          title={stopLabel(activeRun)}
                          disabled={busy || activeRun.status === "cancel_requested"}
                          onClick={() => stop(activeRun)}
                        >
                          <HugeiconsIcon icon={StopIcon} className="size-2.5 fill-current" />
                        </Button>
                      )}
                      <Button
                        type={stopInSlot ? "button" : "submit"}
                        onClick={() => {
                          if (stopInSlot && activeRun) stop(activeRun);
                        }}
                        className="composer-send"
                        aria-label={
                          stopInSlot && activeRun
                            ? stopLabel(activeRun)
                            : editing
                              ? editPending !== null
                                ? "Periksa perubahan pesan"
                                : "Simpan pesan"
                              : busy
                                ? "Mengirim"
                                : pending
                                  ? "Periksa pengiriman"
                                  : activeRun
                                    ? "Antrekan"
                                    : "Kirim"
                        }
                        title={
                          stopInSlot && activeRun
                            ? stopLabel(activeRun)
                            : editing
                              ? editPending !== null
                                ? "Periksa perubahan pesan"
                                : "Simpan pesan"
                              : pending
                                ? "Periksa pengiriman"
                                : activeRun
                                  ? "Antrekan pesan"
                                  : "Kirim pesan"
                        }
                        size="icon"
                        disabled={
                          busy ||
                          !agent ||
                          (stopInSlot
                            ? activeRun?.status === "cancel_requested"
                            : editing
                              ? (editPending === null && editStale) ||
                                !(editPending ?? editText).trim()
                              : !(pending ?? draft).trim() || attachmentsBlocked)
                        }
                      >
                        {stopInSlot ? (
                          <HugeiconsIcon icon={StopIcon} className="size-2.5 fill-current" />
                        ) : busy ? (
                          <Spinner />
                        ) : editing ? (
                          <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={1.75} />
                        ) : activeRun ? (
                          <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.75} />
                        ) : (
                          <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={1.75} />
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
            {detailToolbar}
            {panel}
          </aside>
        )}
        <Sheet open={details && mobile && !isSettings} onOpenChange={setDetails}>
          <SheetContent
            showCloseButton={false}
            className="context-sheet gap-0 w-full data-[side=right]:w-full data-[side=right]:sm:max-w-none overflow-y-auto border-0 bg-background p-0"
            onEscapeKeyDown={(event) => {
              const back = Array.from(
                document.querySelectorAll<HTMLButtonElement>(
                  ".context-sheet #conversation-details [data-panel-back]",
                ),
              ).find((button) => button.getClientRects().length > 0);
              if (back) {
                event.preventDefault();
                back.click();
              }
            }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Detail percakapan</SheetTitle>
              <SheetDescription>Profil dan konteks percakapan.</SheetDescription>
            </SheetHeader>
            {detailToolbar}
            {panel}
          </SheetContent>
        </Sheet>
        <CreateGroup
          agents={agents}
          open={createGroupOpen && !isSettings}
          onOpenChange={setCreateGroupOpen}
          created={async (thread) => {
            choose(thread.id);
          }}
        />
      </div>
      {isSettings && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
    </WorkspaceProviders>
  );
}
