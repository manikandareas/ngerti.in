import {
  ArrowRight01Icon,
  ArrowUp02Icon,
  Cancel01Icon,
  ComputerIcon,
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
  useMemo,
  useRef,
  useState,
} from "react";
import { WorkspaceRail } from "@/app/workspace-rail";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent, MessageHeader } from "@/components/ui/message";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { AgentActivityBubble } from "@/features/conversation/components/agent-activity-bubble";
import { Answer } from "@/features/conversation/components/answer";
import {
  AgentMessageAvatar,
  AssistantMessage,
} from "@/features/conversation/components/assistant-message";
import { AttachInput } from "@/features/conversation/components/attach-input";
import {
  ComposerInput,
  type ComposerInputHandle,
} from "@/features/conversation/components/composer-input";
import { ComposerStopPicker } from "@/features/conversation/components/composer-stop-picker";
import { ComputerActivity } from "@/features/conversation/components/computer-activity";
import { ContextPanel, type PanelLocation } from "@/features/conversation/components/context-panel";
import {
  ConversationContentViewer,
  ViewerComposerContext,
} from "@/features/conversation/components/conversation-content-viewer";
import { ConversationDate } from "@/features/conversation/components/conversation-date";
import {
  ConversationActionsSkeleton,
  ConversationIdentitySkeleton,
  ConversationLoading,
} from "@/features/conversation/components/conversation-loading";
import { CreateGroup } from "@/features/conversation/components/create-group";
import { HumanReply } from "@/features/conversation/components/human-reply";
import { AgentAvatar, agentStyle } from "@/features/conversation/components/identity";
import { MessageActions } from "@/features/conversation/components/message-actions";
import { MessageAttachments } from "@/features/conversation/components/message-attachments";
import { MessageTime } from "@/features/conversation/components/message-time";
import { ModelPicker } from "@/features/conversation/components/model-picker";
import { NativeInteractions } from "@/features/conversation/components/native-interactions";
import { ConversationNavigation } from "@/features/conversation/components/navigation";
import {
  type QueuedMessage,
  QueuedMessages,
} from "@/features/conversation/components/queued-messages";
import { TimelineActivity } from "@/features/conversation/components/timeline-activity";
import { UserMessageText } from "@/features/conversation/components/user-message-text";
import { WorkActivity } from "@/features/conversation/components/work-activity";
import { WorkspaceProviders } from "@/features/conversation/components/workspace-providers";
import { attachmentParts } from "@/features/conversation/lib/attachment-references";
import { useComposerRequests } from "@/features/conversation/lib/composer-requests";
import {
  savedFileTarget,
  useContentViewerController,
} from "@/features/conversation/lib/content-viewer";
import {
  conversationActivity,
  waitingForUser,
} from "@/features/conversation/lib/conversation-activity";
import { mergeConversationHistory } from "@/features/conversation/lib/conversation-history";
import { conversationEntries } from "@/features/conversation/lib/conversation-parts";
import { conversationRows } from "@/features/conversation/lib/conversation-rows";
import { referenceTarget } from "@/features/conversation/lib/inline-references";
import {
  prepareSubmission,
  RejectedSubmission,
} from "@/features/conversation/lib/message-submission";
import {
  type NativeTranscriptFragment,
  useNativeTranscript,
} from "@/features/conversation/lib/native-transcript";
import { runStatusLabel } from "@/features/conversation/lib/run-status";
import { useComposerAttachments } from "@/features/conversation/lib/use-composer-attachments";
import { useConversationDraft } from "@/features/conversation/lib/use-conversation-draft";
import { useConversationScroll } from "@/features/conversation/lib/use-conversation-scroll";
import { useMessageSubmission } from "@/features/conversation/lib/use-message-submission";
import { useMarketplace } from "@/features/marketplace/hooks/use-marketplace";
import { useSettings } from "@/features/settings/hooks/use-settings";
import type { SettingsSectionId } from "@/features/settings/lib/settings-search";
import { useFeedbackToast } from "@/hooks/use-feedback-toast";
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
import { scopedStorageKey } from "@/lib/client-scope";
import type { NativeInteractionSnapshot } from "@/types/native-interactions";
import type {
  ConversationPart,
  ConversationTimeline,
  Message as MessageEntity,
  Run,
  Thread,
} from "@/types/workspace";

const controlText: Record<string, string> = {
  requested: "Mengirim arahan",
  accepted: "Arahan diterima harness",
  rejected: "Arahan belum diterapkan",
  unknown: "Hasil pengiriman arahan belum diketahui",
  complete: "Pengiriman arahan selesai",
};
const DOUBLE_ENTER_STEER_WINDOW_MS = 1500;
const SettingsPage = lazy(() => import("@/features/settings/components/settings-page"));
const MarketplacePage = lazy(() => import("@/features/marketplace/components/marketplace-page"));

export default function Workspace() {
  const {
    isOpen: isSettings,
    section: settingsSection,
    provider: settingsProvider,
    open: showSettings,
    close: closeSettings,
  } = useSettings();
  const marketplace = useMarketplace();
  const isMarketplace = marketplace.isOpen && !isSettings;
  const isSecondaryScreen = isSettings || isMarketplace;
  const lastSettings = useRef({
    section: settingsSection ?? "general",
    provider: settingsProvider,
  });
  if (settingsSection)
    lastSettings.current = { section: settingsSection, provider: settingsProvider };
  const [composerSurface, setComposerSurface] = useState<HTMLElement | null>(null);
  const workspace = useWorkspace(isSecondaryScreen ? null : composerSurface);
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
  useFeedbackToast(error, {
    retry: workspace.retry,
    cancel: { label: "Periksa pengaturan", onClick: () => openSettings() },
  });
  const [draft, setDraft] = useConversationDraft(threadId);
  const composerRequests = useComposerRequests(threadId);
  const reply = composerRequests.active;
  const replyTooLong = reply?.maxLength !== undefined && draft.length > reply.maxLength;
  const [composerFocused, setComposerFocused] = useState(false);
  const [conversationSurface, setConversationSurface] = useState<HTMLElement | null>(null);
  const composerInput = useRef<ComposerInputHandle>(null);
  const pendingComposerFocus = useRef(true);
  const focusComposerAfterNavigation = useRef(false);
  const bindComposerInput = useCallback((input: ComposerInputHandle | null) => {
    composerInput.current = input;
    if (input && pendingComposerFocus.current && !focusComposerAfterNavigation.current) {
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
  const viewer = useContentViewerController(threadId, (id) => {
    locate({ tab: "library", id });
    setDetails(true);
  });
  const viewing = viewer.entries.length > 0;
  const currentThread = useRef(threadId);
  currentThread.current = threadId;
  const resourceSnapshot = useRef(snapshot);
  resourceSnapshot.current = snapshot;
  const [editing, setEditing] = useState<MessageEntity | null>(null);
  const [editText, setEditText] = useState("");
  const [older, setOlder] = useState<MessageEntity[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [olderParts, setOlderParts] = useState<ConversationPart[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  useEffect(() => {
    if (!snapshot || snapshot.thread.id !== threadId) return;
    setOlder((current) => mergeConversationHistory(threadId, current, snapshot.timeline.messages));
    setOlderParts((current) =>
      mergeConversationHistory(threadId, current, snapshot.timeline.parts),
    );
  }, [snapshot, threadId]);
  const mobile = useIsMobile();
  const narrowNavigation = useMediaQuery("(max-width: 1343.98px)");
  const navigationVisible = mobile ? navigation : !(details && narrowNavigation);
  const previouslySettings = useRef(isSecondaryScreen);
  useLayoutEffect(() => {
    const returning = previouslySettings.current && !isSecondaryScreen;
    previouslySettings.current = isSecondaryScreen;
    if (!returning || focusComposerAfterNavigation.current) return;
    const frame = requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>('.workspace-rail button[aria-label="Percakapan"]')
        ?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [isSecondaryScreen]);
  useLayoutEffect(() => {
    if (!navigation && !isSecondaryScreen && focusComposerAfterNavigation.current) {
      focusComposerAfterNavigation.current = false;
      composerInput.current?.focus();
    }
  }, [navigation, isSecondaryScreen]);
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
  const stopInSlot = !editing && activeRuns.length > 0 && !pending && draft.length === 0;
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
    disabled:
      busy ||
      submission.loading ||
      !!submission.failure ||
      pending !== null ||
      !!editing ||
      !!reply,
    report,
    attached: () => {
      setDetails(false);
      setError("");
    },
  });
  const attachments = composerFiles.referenced(pending ?? draft);
  const attachmentsBlocked =
    (pending === null &&
      attachments.some((file) => file.state === "uploading" || file.state === "failed")) ||
    submission.loading ||
    !!submission.failure;
  useLayoutEffect(() => {
    const surface = conversationSurface;
    if (!surface) return;
    const header = surface.querySelector<HTMLElement>(".workspace-chat-header");
    const notice = error ? surface.querySelector<HTMLElement>(".workspace-error") : null;
    const dock = snapshot?.thread.id ? surface.querySelector<HTMLElement>(".composer-dock") : null;
    let previousDockHeight: number | null = null;
    const measure = () => {
      const top = surface.getBoundingClientRect().top;
      const headerBottom = (notice ?? header)?.getBoundingClientRect().bottom ?? top;
      const dockHeight = dock?.getBoundingClientRect().height ?? 0;
      const scroll = surface.querySelector<HTMLElement>(".conversation-scroll");
      const previousScrollHeight = scroll?.scrollHeight ?? 0;
      const previousScrollTop = scroll?.scrollTop ?? 0;
      // Match use-stick-to-bottom's near-bottom range. Its content-box observer
      // does not see padding changes when the overlaid composer resizes.
      const keepEndPosition =
        scroll && scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop <= 70;
      surface.style.setProperty("--conversation-top", `${headerBottom - top}px`);
      surface.style.setProperty("--conversation-bottom", `${dockHeight}px`);
      if (keepEndPosition && previousDockHeight !== null && dockHeight !== previousDockHeight)
        scroll.scrollTop = previousScrollTop + scroll.scrollHeight - previousScrollHeight;
      previousDockHeight = dockHeight;
    };
    const observer = new ResizeObserver(measure);
    for (const element of [header, notice, dock]) {
      if (element) observer.observe(element);
    }
    measure();
    return () => observer.disconnect();
  }, [conversationSurface, snapshot?.thread.id, error]);
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
    pendingComposerFocus.current = true;
    focusComposerAfterNavigation.current = navigation && narrowNavigation;
    currentThread.current = id;
    viewer.clear();
    select(id);
    setOlder([]);
    setOlderParts([]);
    setBefore(null);
    setHistoryLoaded(false);
    setNavigation(false);
    setDetails(false);
    if (id === threadId && !focusComposerAfterNavigation.current) focusComposer();
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
    if (reply) {
      if (reply.busy || reply.locked || replyTooLong || !draft.trim() || attachments.length) return;
      const text = draft;
      void act(async () => {
        const accepted = await reply.submit(text);
        if (accepted && currentThread.current === threadId) {
          setDraft("");
          void conversationScroll.current?.scrollToBottom({ animation: "instant" });
        }
      });
      return;
    }
    if (!agent || !threadId || !(pending ?? draft).trim() || (!pending && attachmentsBlocked))
      return;
    const text = pending ?? draft;
    void act(async () => {
      const context = pending
        ? undefined
        : await viewer.attachment().catch((error) => {
            if (currentThread.current !== threadId) return undefined;
            throw error;
          });
      if (currentThread.current !== threadId) return;
      const content = pending
        ? { text, artifact_ids: [], sources: [] }
        : composerFiles.message(text, context);
      if (submission.failure) throw new Error(submission.failure);
      if (submission.pending || content.artifact_ids.length) {
        const operation =
          submission.pending ??
          prepareSubmission(
            threadId,
            agent.id,
            content.text,
            content.sources,
            snapshot?.thread.type ?? "dm",
          );
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
            viewer.removeContext();
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
      viewer.clear();
      setDetails(false);
      setDraft("");
      void conversationScroll.current?.scrollToBottom({ animation: "instant" });
      requestAnimationFrame(() => composerInput.current?.focus());
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
        localStorage.removeItem(scopedStorageKey(`ngertiin:pending:${slot}`));
        await refresh().catch(() => {});
      }
      throw failure;
    }
  }
  function focusComposer() {
    const input = composerInput.current;
    if (input) {
      pendingComposerFocus.current = false;
      input.focus();
    } else pendingComposerFocus.current = true;
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
      loading={!workspace.navigationReady && !error}
      agents={agents}
      threads={
        workspace.navigationReady
          ? threads.filter(
              (thread) =>
                thread.type === "group" ||
                workspace.invocableAgents.some((agent) => agent.id === thread.member_agent_ids[0]),
            )
          : []
      }
      activities={workspace.activity.items}
      previews={workspace.previews.items}
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
    />
  );
  function compose(text: string) {
    setDraft(text);
    setDetails(false);
    requestAnimationFrame(() => composerInput.current?.focus());
  }
  const openResource = useCallback(
    (kind: "agent" | "files" | "goals" | "routine", id: string) => {
      const current = resourceSnapshot.current;
      if (kind === "files") {
        const artifact = current?.artifacts.find((item) => item.id === id);
        if (!artifact || !current) return;
        try {
          viewer.open({
            ...savedFileTarget(artifact, current),
            info: () => {
              locate({ tab: "library", id });
              setDetails(true);
            },
          });
        } catch (error) {
          setError(error instanceof Error ? error.message : "File is unavailable.");
        }
        return;
      } else if (kind === "agent")
        locate({ tab: "detail", id: current?.thread.type === "group" ? id : null });
      else locate({ tab: "detail", page: kind, id });
      setDetails(true);
    },
    [viewer.open, setError],
  );
  async function source(id?: string) {
    setDetails(false);
    if (!id || !threadId) return;
    let cursor = historyLoaded ? before : snapshot?.timeline.next_before;
    let found = parts.some((part) => part.message_id === id);
    const loaded: MessageEntity[] = [];
    const loadedParts: ConversationPart[] = [];
    while (!found && cursor) {
      const page = await request<ConversationTimeline>(
        `/v1/threads/${threadId}/timeline?before=${cursor}&limit=100`,
      );
      if (currentThread.current !== threadId) return;
      loaded.unshift(...page.messages);
      loadedParts.unshift(...page.parts);
      found = page.parts.some((part) => part.message_id === id);
      cursor = page.next_before;
    }
    if (loadedParts.length) {
      setOlder((v) => [...loaded, ...v]);
      setOlderParts((v) => [...loadedParts, ...v]);
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
      location={location}
      locate={locate}
      refresh={refresh}
      compose={compose}
      source={(id) => void source(id).catch((e) => report(e.message))}
      attach={composerFiles.attachArtifact}
      onClose={() => setDetails(false)}
      closeLabel={mobile ? "Close" : "Tutup detail"}
    />
  ) : null;
  const messages = useMemo(
    () =>
      mergeConversationHistory(threadId, older, [
        ...(snapshot?.timeline.messages ?? []),
        ...(snapshot?.messages ?? []),
      ]),
    [threadId, older, snapshot?.messages, snapshot?.timeline.messages],
  );
  function hasPendingNative(run: Run) {
    return (run.native_interactions ?? []).some(
      (record) => record.observed_state === "pending" && record.submission?.state !== "submitted",
    );
  }
  const parts = useMemo(
    () => mergeConversationHistory(threadId, olderParts, snapshot?.timeline.parts ?? []),
    [threadId, olderParts, snapshot?.timeline.parts],
  );
  const entries = useMemo(() => conversationEntries(parts, messages), [parts, messages]);
  const latestUserEntry = entries.findLast(
    (entry) => entry.type === "message" && entry.message.author === "user",
  );
  const conversationScroll = useConversationScroll(
    snapshot?.thread.id ?? null,
    latestUserEntry?.type === "message" ? latestUserEntry.part.sequence : 0,
    !isSecondaryScreen && !(mobile && navigation),
  );
  const activityByEntry = useMemo(
    () => conversationActivity(snapshot, entries),
    [snapshot, entries],
  );
  function runActivity(run: Run, at: string) {
    if (!snapshot) return null;
    const actor = snapshot.agents.find((agent) => agent.id === run.agent_id);
    if (!actor) return null;
    const target = snapshot.agents.find(
      (agent) => agent.id === run.active_tools?.at(-1)?.target_agent_id,
    );
    if (run.computer_activity && !["failed", "unknown"].includes(run.status))
      return (
        <AssistantMessage
          key={run.id}
          agent={actor}
          group={snapshot.thread.type === "group"}
          open={() => openResource("agent", actor.id)}
        >
          <ComputerActivity
            run={run}
            at={at}
            agent={actor}
            open={() => {
              locate({ tab: "computer", id: null });
              setDetails(true);
            }}
          />
        </AssistantMessage>
      );
    return (
      <AgentActivityBubble
        key={run.id}
        agent={actor}
        run={run}
        at={at}
        online={workspace.online}
        waitingForUser={waitingForUser(run, snapshot)}
        targetName={target?.name}
        showName={snapshot.thread.type === "group"}
        busy={busy}
        openAgent={() => openResource("agent", actor.id)}
        openSettings={() => openSettings()}
        retryResponse={
          run.retry_allowed
            ? () =>
                void act(async () => {
                  await queueCommand(`response-retry:${run.id}`, `/v1/runs/${run.id}/retry`, {
                    expected_revision: run.revision,
                  });
                })
            : undefined
        }
        retryPreparation={() =>
          void act(async () => {
            await queueCommand(`preparation:${run.id}`, `/v1/runs/${run.id}/retry-preparation`, {
              expected_revision: run.revision,
            });
          })
        }
        reconcile={() =>
          void act(async () => {
            await request(`/v1/runs/${run.id}/reconcile`, {});
          })
        }
      />
    );
  }
  const published = new Set(parts.flatMap((part) => (part.message_id ? [part.message_id] : [])));
  const queued = messages
    .flatMap((message) => {
      const run = snapshot?.runs.findLast(
        (run) => run.input_message_id === message.id && run.status === "queued",
      );
      return run &&
        message.author === "user" &&
        message.state !== "deleted" &&
        !published.has(message.id)
        ? [{ message, run }]
        : [];
    })
    .filter(
      (item, index, items) =>
        items.findIndex((other) => other.message.id === item.message.id) === index,
    )
    .map(({ message, run }) => {
      const active = activeRuns.find((active) => active.agent_id === run.agent_id);
      const nativeConnection = connections.find(
        (connection) =>
          connection.id ===
          (active?.provider_selection?.connection_id ??
            snapshot?.agents.find((agent) => agent.id === active?.agent_id)?.connection_id),
      );
      const target =
        active?.status === "running" &&
        active.cancellation === "none" &&
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
    if (!target || busy || pending !== null || editing) return;
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
        ...(target.native_run_id ? { expected_native_run_id: target.native_run_id } : {}),
      });
    });
  }
  const visibleMessages = entries.flatMap((entry) =>
    entry.type === "message" ? [entry.message] : [],
  );
  const nativeTranscript = useNativeTranscript(visibleMessages, snapshot?.runs ?? []);
  const rows = conversationRows(entries, {
    native: nativeTranscript,
    activity: activityByEntry,
    requests: snapshot?.human_requests,
    runs: snapshot?.runs,
  });
  function canObserveNative(run: Run) {
    // The run's server-validated binding owns native interactions, including private Team selections.
    return run.status === "running" && run.cancellation === "none";
  }
  function nativeFragment(fragment: NativeTranscriptFragment) {
    const author = snapshot?.agents.find((agent) => agent.id === fragment.run.agent_id);
    return (
      <div key={fragment.key} data-native-fragment={fragment.key} className="w-full py-1">
        <NativeInteractions
          threadId={snapshot?.thread.id}
          runId={fragment.run.id}
          run={fragment.run}
          author={author?.name ?? "Agent"}
          agent={author}
          observePending={false}
          openAgent={author ? () => openResource("agent", author.id) : undefined}
          canRespond={canObserveNative(fragment.run)}
          recordIds={fragment.recordIds}
          refresh={refresh}
        />
      </div>
    );
  }
  function publishedAuthor(message: MessageEntity) {
    const current = agents.find((agent) => agent.id === message.author_agent_id);
    const historical = parts.find(
      (part) => part.kind === "message" && part.message_id === message.id,
    )?.actors[0];
    return historical ? { ...historical, system_role: current?.system_role } : current;
  }
  function answer(message: MessageEntity, text: string, at: string, last: boolean) {
    if (!text.trim()) return null;
    const related = snapshot?.runs.find((run) => run.id === message.run_id);
    if (
      related?.retried_by_run_id ||
      snapshot?.human_requests.some(
        (request) =>
          request.message_id === message.id && (request.options || request.purpose === "approval"),
      )
    )
      return null;
    const retry =
      related?.status === "failed" && related.retry_allowed
        ? () =>
            void act(async () => {
              await queueCommand(`response-retry:${related.id}`, `/v1/runs/${related.id}/retry`, {
                expected_revision: related.revision,
              });
            })
        : undefined;
    const streaming =
      message.author === "agent" &&
      message.purpose !== "announcement" &&
      snapshot?.runs.some((run) => run.id === message.run_id && run.status === "running") === true;
    const author = publishedAuthor(message);
    const sender =
      snapshot?.thread.type === "group" && message.author === "agent"
        ? {
            style: agentStyle(author),
          }
        : undefined;
    return (
      <Answer
        retry={retry}
        busy={busy}
        sources={snapshot?.runs.find((run) => run.id === message.run_id)?.sources}
        agentId={author?.id}
        sentAt={at}
        sender={sender}
        streaming={streaming && last}
        showSources={last}
        text={text}
        openResource={openResource}
        snapshot={snapshot ?? undefined}
      />
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
  return (
    <WorkspaceProviders
      viewer={viewer}
      input={composerRequests.registry}
      snapshot={snapshot}
      parts={parts}
      activity={{
        items: workspace.activity.items,
        threadId,
        listeningThreadId: !isSecondaryScreen && composerFocused && draft.trim() ? threadId : null,
        online: workspace.online,
      }}
      settings={{
        snapshot,
        agents,
        connections,
        appConnectionCursor: workspace.appConnectionCursor,
        selections: workspace.selections,
        allowedOrganizationConnectionIds: workspace.access?.allowed_organization_connection_ids,
        refresh,
      }}
    >
      <div className="application-frame">
        <WorkspaceRail
          settings={isSettings}
          marketplace={isMarketplace}
          onConversation={() => {
            if (isSettings) {
              void closeSettings();
              return;
            }
            if (isMarketplace) {
              void marketplace.close();
              return;
            }
            if (mobile) setNavigation(true);
            else if (details && narrowNavigation) {
              setDetails(false);
            }
          }}
          onMarketplace={() => {
            if (isMarketplace) return;
            setNavigation(false);
            setCreateMenu(false);
            void marketplace.open();
          }}
          onSettings={() => {
            if (isSettings) return;
            setNavigation(false);
            setCreateMenu(false);
            void showSettings(lastSettings.current.section, lastSettings.current.provider);
          }}
        />
        <div className="application-body">
          <div
            className="app-screen workspace-shell"
            hidden={isSecondaryScreen}
            inert={isSecondaryScreen}
            style={snapshot?.thread.type === "group" ? undefined : agentStyle(agent)}
            data-group={snapshot?.thread.type === "group" ? "true" : undefined}
          >
            <aside
              id="workspace-navigation"
              className="app-sidebar workspace-sidebar"
              aria-label="Daftar percakapan"
              hidden={!navigationVisible}
            >
              {nav}
            </aside>
            <main
              ref={setConversationSurface}
              className="app-surface workspace-main flex flex-1 flex-col min-w-0 min-h-0 overflow-hidden"
              aria-label="Percakapan aktif"
              hidden={mobile && navigation}
              data-details={details && !mobile && !viewing}
              data-viewer={viewing}
              onKeyDown={(event) => {
                if (viewing && event.key === "Escape" && !event.defaultPrevented) {
                  if (
                    event.target instanceof Element &&
                    event.target.closest('[role="menu"], [role="listbox"]')
                  )
                    return;
                  event.preventDefault();
                  viewer.back();
                }
              }}
            >
              <ConversationContentViewer viewer={viewer} />
              <header
                inert={viewing}
                aria-busy={!snapshot && !error}
                className={`workspace-chat-header [grid-template-columns:minmax(0,_1fr)_auto_minmax(0,_1fr)] gap-2.5 [padding:10px_20px] grid items-center shrink-0 ${!snapshot && error ? "[&_[data-slot=skeleton]]:animate-none" : ""}`}
              >
                <div className="header-identity-position [grid-column:2] [grid-row:1] [padding-left:0] flex justify-center flex-1 min-w-0">
                  {snapshot ? (
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
                        animated
                        followPointer
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
                          <span className="sr-only">{runStatusLabel(activeRun)}</span>
                        </span>
                      )}
                    </Button>
                  ) : (
                    <ConversationIdentitySkeleton />
                  )}
                </div>
                <div className="header-model-actions col-start-3 row-start-1 flex min-w-0 items-center justify-end gap-3">
                  {snapshot ? (
                    <>
                      {snapshot.thread.type === "dm" && (
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
                        <HugeiconsIcon
                          icon={ComputerIcon}
                          className="size-[18px]"
                          strokeWidth={1.5}
                        />
                      </Button>
                    </>
                  ) : (
                    <ConversationActionsSkeleton />
                  )}
                </div>
              </header>
              {!snapshot ? (
                <ConversationLoading error={error} />
              ) : (
                <>
                  <Conversation
                    key={threadId}
                    contextRef={conversationScroll}
                    className="conversation-viewport min-h-0"
                    inert={viewing}
                  >
                    <ConversationContent
                      scrollClassName="conversation-scroll"
                      className="conversation-column gap-4 w-full"
                    >
                      {(historyLoaded ? before : snapshot.timeline.next_before) && (
                        <Button
                          variant="ghost"
                          onClick={() =>
                            void act(async () => {
                              const result = await request<ConversationTimeline>(
                                `/v1/threads/${threadId}/timeline?before=${historyLoaded ? before : snapshot.timeline.next_before}`,
                              );
                              if (currentThread.current !== threadId) return;
                              setOlder((current) => [...result.messages, ...current]);
                              setOlderParts((current) => [...result.parts, ...current]);
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
                          <AgentAvatar
                            agent={agent}
                            animated
                            followPointer
                            className="size-16 rounded-2xl text-2xl"
                          />
                          <h1>{agent?.name ?? "Percakapan"}</h1>
                          <p>{agent?.soul || "Apa yang ingin kamu kerjakan bersama?"}</p>
                        </div>
                      )}
                      {rows.map((row, index) => {
                        const date = row.startsDay ? <ConversationDate at={row.at} /> : null;
                        if (row.type === "activity")
                          return (
                            <Fragment key={row.key}>
                              {date}
                              <TimelineActivity parts={row.parts} open={openResource} />
                            </Fragment>
                          );
                        if (row.type === "run")
                          return (
                            <Fragment key={row.key}>
                              {date}
                              {runActivity(row.run, row.at)}
                            </Fragment>
                          );
                        if (row.type === "native")
                          return (
                            <Fragment key={row.key}>
                              {date}
                              <div data-native-history-fallback={row.fallback || undefined}>
                                {row.fallback && (
                                  <p className="text-[12px] text-muted-foreground">
                                    Riwayat input ·{" "}
                                    {snapshot.agents.find(
                                      (agent) => agent.id === row.fragment.run.agent_id,
                                    )?.name ?? "Agent"}
                                  </p>
                                )}
                                {nativeFragment(row.fragment)}
                              </div>
                            </Fragment>
                          );
                        const { entry } = row;
                        const { message } = entry;
                        const previous = rows[index - 1];
                        const next = rows[index + 1];
                        const run = snapshot.runs.findLast(
                          (run) => run.input_message_id === message.id,
                        );
                        const author = publishedAuthor(message);
                        const inlineAttachmentIds = new Set(
                          message.author === "user"
                            ? attachmentParts(message.text).flatMap((part) =>
                                "id" in part &&
                                snapshot.artifacts.some((file) => file.id === part.id)
                                  ? [part.id]
                                  : [],
                              )
                            : [],
                        );
                        return (
                          <Fragment key={row.key}>
                            {date}
                            <Message
                              data-timeline-part={row.first ? entry.part.id : undefined}
                              data-part-sequence={entry.part.sequence}
                              id={row.first ? `message-${message.id}` : undefined}
                              align={message.author === "user" ? "end" : "start"}
                              className="conversation-message"
                              data-join-above={
                                (!row.startsDay &&
                                  joins(
                                    previous?.type === "message"
                                      ? previous.entry.message
                                      : undefined,
                                    message,
                                  )) ||
                                undefined
                              }
                              data-join-below={
                                (next &&
                                  !next.startsDay &&
                                  joins(
                                    message,
                                    next.type === "message" ? next.entry.message : undefined,
                                  )) ||
                                undefined
                              }
                            >
                              {snapshot.thread.type === "group" && message.author === "agent" && (
                                <AgentMessageAvatar
                                  agent={author}
                                  loading={message.state === "partial"}
                                  open={author ? () => openResource("agent", author.id) : undefined}
                                />
                              )}
                              <MessageContent>
                                {!(
                                  snapshot.thread.type === "group" && message.author === "agent"
                                ) && (
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
                                  <MessageActions text={message.text} user>
                                    <Bubble variant="secondary" className="chat-user-bubble">
                                      <BubbleContent className="chat-bubble-content text-[15px] leading-[22px] whitespace-pre-wrap">
                                        <div data-message-text>
                                          <UserMessageText
                                            message={message}
                                            artifacts={snapshot.artifacts}
                                            documents={snapshot.attachment_documents}
                                            preparing={
                                              run
                                                ? ["queued", "dispatching"].includes(run.status)
                                                : false
                                            }
                                          />
                                        </div>
                                        <MessageTime at={row.at} />
                                      </BubbleContent>
                                    </Bubble>
                                  </MessageActions>
                                ) : (
                                  answer(message, row.text, row.at, row.last)
                                )}
                                {row.last && (
                                  <MessageAttachments
                                    ids={message.artifact_ids.filter(
                                      (id) => !inlineAttachmentIds.has(id),
                                    )}
                                    files={snapshot.artifacts}
                                    at={row.at}
                                    standalone={
                                      !row.text.trim() &&
                                      message.author !== "user" &&
                                      !snapshot.human_requests.some(
                                        (request) => request.message_id === message.id,
                                      )
                                    }
                                    open={(id) => openResource("files", id)}
                                  />
                                )}
                                {row.last &&
                                  snapshot.human_requests
                                    .filter((r) => r.message_id === message.id)
                                    .map((r) => (
                                      <HumanReply
                                        key={r.id}
                                        request={r}
                                        question={message.text}
                                        author={author?.name ?? "Agent"}
                                        refresh={refresh}
                                      />
                                    ))}
                                {row.last &&
                                  run?.status === "queued" &&
                                  (!run.preparation || run.preparation.state === "ready") && (
                                    <div className="message-run-state text-caption text-muted-foreground">
                                      {runStatusLabel(run)}
                                    </div>
                                  )}
                              </MessageContent>
                            </Message>
                            {row.last && (
                              <WorkActivity
                                message={message}
                                at={row.at}
                                run={run}
                                snapshot={snapshot}
                                retryPreparation={(runId, revision) =>
                                  void act(async () => {
                                    await queueCommand(
                                      `router-preparation:${runId}`,
                                      `/v1/runs/${runId}/retry-preparation`,
                                      { expected_revision: revision },
                                    );
                                  })
                                }
                                retryRoute={(route) =>
                                  void act(async () => {
                                    await queueCommand(
                                      `route:${route.id}`,
                                      `/v1/groups/${snapshot.thread.id}/routes/${route.id}/retry`,
                                      { expected_revision: route.revision },
                                    );
                                  })
                                }
                                busy={busy}
                              />
                            )}
                          </Fragment>
                        );
                      })}
                      {snapshot.controls.map((control) => (
                        <p key={control.id} className="text-caption text-muted-foreground">
                          {controlText[control.state] ?? "Memeriksa arahan"}
                          {control.error_code ? ` · ${repairMessage(control.error_code)}` : ""}
                        </p>
                      ))}
                      {activeRuns.filter(canObserveNative).map((run) => (
                        <NativeInteractions
                          key={run.id}
                          threadId={snapshot.thread.id}
                          runId={run.id}
                          run={run}
                          observePending
                          openAgent={() => openResource("agent", run.agent_id)}
                          recordIds={[]}
                          refresh={refresh}
                          author={
                            snapshot.agents.find((a) => a.id === run.agent_id)?.name ?? "Agent"
                          }
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
                      if (!event.currentTarget.contains(event.relatedTarget))
                        setComposerFocused(false);
                    }}
                    className="composer-dock [padding:12px_20px_16px] w-full shrink-0"
                  >
                    {!reply && !editing && (
                      <ViewerComposerContext viewer={viewer} disabled={busy || pending !== null} />
                    )}
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
                    {reply && !editing && (
                      <div
                        className="mb-2 flex flex-wrap items-center gap-2 px-2 text-[12px] text-muted-foreground"
                        role="status"
                      >
                        {reply.error && <span>{reply.error}</span>}
                        {replyTooLong && <span>Jawaban dibatasi {reply.maxLength} karakter.</span>}
                        {attachments.length > 0 && (
                          <span>Hapus lampiran untuk mengirim jawaban ini.</span>
                        )}
                        {reply.check && (
                          <button
                            type="button"
                            className="text-link underline"
                            disabled={busy || reply.busy}
                            onClick={() =>
                              void act(async () => {
                                const accepted = await reply.check?.();
                                if (accepted === true && currentThread.current === threadId)
                                  setDraft("");
                              })
                            }
                          >
                            Periksa status
                          </button>
                        )}
                      </div>
                    )}
                    <form
                      ref={setComposerSurface}
                      onSubmit={(event) => {
                        event.preventDefault();
                        send();
                      }}
                      className="conversation-composer gap-1.5 p-2 flex items-end"
                      data-multiline={multiline ? "true" : undefined}
                    >
                      <AttachInput
                        key={`attachments:${snapshot.thread.id}`}
                        disabled={busy || pending !== null || !!editing || !!reply}
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
                          key={`editor:${snapshot.thread.id}`}
                          ref={bindComposerInput}
                          label={undefined}
                          value={pending ?? reply?.restoreText ?? draft}
                          readOnly={busy || pending !== null || !!reply?.busy || !!reply?.locked}
                          placeholder={`Pesan${agent ? ` untuk ${agent.name}` : ""}…`}
                          lookup={composerFiles.lookup}
                          retry={composerFiles.retry}
                          onChange={setDraft}
                          onMultiline={setMultiline}
                          onFiles={composerFiles.addFiles}
                          report={report}
                          onEnter={() => {
                            if (
                              !reply &&
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
                          {reply?.locked && !stopInSlot && activeRun && (
                            <ComposerStopPicker
                              enabled={activeRuns.length > 1}
                              runs={activeRuns}
                              label={stopLabel}
                              busy={busy}
                              stop={stop}
                            >
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="composer-aux"
                                aria-label={activeRuns.length > 1 ? "Stop" : stopLabel(activeRun)}
                                disabled={
                                  busy ||
                                  activeRuns.every((run) => run.status === "cancel_requested")
                                }
                                onClick={() => {
                                  if (activeRuns.length === 1) stop(activeRun);
                                }}
                              >
                                <HugeiconsIcon icon={StopIcon} className="size-2.5 fill-current" />
                              </Button>
                            </ComposerStopPicker>
                          )}
                          <ComposerStopPicker
                            enabled={stopInSlot && activeRuns.length > 1}
                            runs={activeRuns}
                            label={stopLabel}
                            busy={busy}
                            stop={stop}
                          >
                            <Button
                              type={stopInSlot ? "button" : "submit"}
                              onClick={() => {
                                if (stopInSlot && activeRuns.length === 1 && activeRun)
                                  stop(activeRun);
                              }}
                              className="composer-send"
                              aria-label={
                                stopInSlot && activeRun
                                  ? activeRuns.length > 1
                                    ? "Stop"
                                    : stopLabel(activeRun)
                                  : editing
                                    ? editPending !== null
                                      ? "Periksa perubahan pesan"
                                      : "Simpan pesan"
                                    : busy
                                      ? "Mengirim"
                                      : pending
                                        ? "Periksa pengiriman"
                                        : reply
                                          ? "Kirim jawaban"
                                          : "Kirim"
                              }
                              title={
                                stopInSlot && activeRun
                                  ? activeRuns.length > 1
                                    ? "Stop"
                                    : stopLabel(activeRun)
                                  : editing
                                    ? editPending !== null
                                      ? "Periksa perubahan pesan"
                                      : "Simpan pesan"
                                    : pending
                                      ? "Periksa pengiriman"
                                      : reply
                                        ? "Kirim jawaban"
                                        : "Kirim pesan"
                              }
                              size="icon"
                              disabled={
                                busy ||
                                (!stopInSlot &&
                                  (!!reply?.busy || !!reply?.locked || replyTooLong)) ||
                                (Boolean(reply) && attachments.length > 0) ||
                                !agent ||
                                (stopInSlot
                                  ? activeRuns.every((run) => run.status === "cancel_requested")
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
                              ) : (
                                <HugeiconsIcon icon={ArrowUp02Icon} size={16} strokeWidth={1.75} />
                              )}
                            </Button>
                          </ComposerStopPicker>
                        </div>
                      </div>
                    </form>
                  </div>
                </>
              )}
            </main>
            {details && !mobile && (
              <aside
                className="workspace-details w-80 [border-radius:0_16px_16px_0] shrink-0 min-h-0 overflow-y-auto bg-background"
                aria-label="Detail percakapan"
                hidden={viewing}
              >
                {panel}
              </aside>
            )}
            <Sheet
              open={details && mobile && !isSecondaryScreen && !viewing}
              onOpenChange={(open) => {
                if (!viewing) setDetails(open);
              }}
            >
              <SheetContent
                showCloseButton={false}
                onCloseAutoFocus={(event) => {
                  if (viewing) event.preventDefault();
                }}
                className="context-sheet gap-0 w-full data-[side=right]:w-full data-[side=right]:sm:max-w-none overflow-y-auto border-0 bg-background p-0"
                onEscapeKeyDown={(event) => {
                  if (location.workingFiles) {
                    event.preventDefault();
                    locate({ ...location, workingFiles: false });
                    return;
                  }
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
                {panel}
              </SheetContent>
            </Sheet>
            <CreateGroup
              agents={workspace.invocableAgents}
              open={createGroupOpen && !isSecondaryScreen}
              onOpenChange={setCreateGroupOpen}
              created={async (thread) => {
                choose(thread.id);
              }}
            />
          </div>
          {isSettings && (
            <Suspense
              fallback={
                <div
                  className="app-screen"
                  role="status"
                  aria-label="Memuat pengaturan"
                  aria-busy="true"
                />
              }
            >
              <SettingsPage />
            </Suspense>
          )}
          {isMarketplace && (
            <Suspense
              fallback={
                <div
                  className="app-screen"
                  role="status"
                  aria-label="Memuat marketplace"
                  aria-busy="true"
                />
              }
            >
              <MarketplacePage
                onPrompt={(prompt) => {
                  setDraft(draft.trim() ? `${draft}\n\n${prompt}` : prompt);
                  setNavigation(false);
                  focusComposerAfterNavigation.current = true;
                  void marketplace.close();
                }}
              />
            </Suspense>
          )}
        </div>
      </div>
    </WorkspaceProviders>
  );
}
