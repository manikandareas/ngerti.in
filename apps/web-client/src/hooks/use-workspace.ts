import { useCallback, useEffect, useRef, useState } from "react";
import { command, followEvents, request } from "@/lib/api-client";
import type {
  Agent,
  AgentActivities,
  Connection,
  ConversationPreviews,
  Opening,
  Snapshot,
  Thread,
} from "@/types/workspace";
import { observePreparation, type SessionPreparation } from "./conversation-preparation";
import { eventProjections, mergeEntity, type Projection } from "./workspace-events";

export function useWorkspace(composer: HTMLElement | null) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activity, setActivity] = useState<AgentActivities>({ cursor: 0, items: [] });
  const [previews, setPreviews] = useState<ConversationPreviews>({ cursor: 0, items: [] });
  const [threads, setThreads] = useState<Thread[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [threadId, selectThread] = useState<string | null>(() =>
    localStorage.getItem("ngertiin:thread"),
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  const selectedThread = useRef(threadId);
  const latestCursor = useRef(0);
  const openingMessage = useRef<string | null>(null);
  const snapshots = useRef(new Map<string, Snapshot>());
  const firstSelection = useRef<string | null | undefined>(undefined);

  const refresh = useCallback(async (signal?: AbortSignal, projections?: Set<Projection>) => {
    const generation = epoch.current;
    const selected = selectedThread.current;
    const full = projections === undefined;
    const [nextAgents, nextThreads, nextConnections, nextActivity, nextPreviews, next, state] =
      await Promise.all([
        full ? request<Agent[]>("/v1/entities/agent", undefined, undefined, signal) : undefined,
        full ? request<Thread[]>("/v1/entities/thread", undefined, undefined, signal) : undefined,
        full
          ? request<Connection[]>("/v1/entities/connection", undefined, undefined, signal)
          : undefined,
        full || projections.has("activity")
          ? request<AgentActivities>("/v1/agents/activity", undefined, undefined, signal)
          : undefined,
        full || projections.has("previews")
          ? request<ConversationPreviews>(
              "/v1/conversations/previews",
              undefined,
              undefined,
              signal,
            )
          : undefined,
        selected && (full || projections.has("conversation"))
          ? request<Snapshot>(`/v1/threads/${selected}/snapshot`, undefined, undefined, signal)
          : undefined,
        selected && (full || projections.has("opening"))
          ? request<Opening>(`/v1/threads/${selected}/opening`, undefined, undefined, signal)
          : undefined,
      ]);
    if (signal?.aborted) return;
    if (nextAgents) setAgents((current) => nextAgents.reduce(mergeEntity, current));
    if (nextThreads)
      setThreads((current) =>
        nextThreads
          .filter((thread) => thread.purpose === "conversation")
          .reduce(mergeEntity, current),
      );
    if (nextConnections) setConnections((current) => nextConnections.reduce(mergeEntity, current));
    if (nextActivity)
      setActivity((previous) => (nextActivity.cursor >= previous.cursor ? nextActivity : previous));
    if (nextPreviews)
      setPreviews((previous) => (nextPreviews.cursor >= previous.cursor ? nextPreviews : previous));
    if (generation === epoch.current && selected === selectedThread.current) {
      if (next && next.cursor >= latestCursor.current) {
        latestCursor.current = next.cursor;
        snapshots.current.delete(next.thread.id);
        snapshots.current.set(next.thread.id, next);
        const oldest = snapshots.current.keys().next().value;
        if (snapshots.current.size > 5 && oldest !== undefined) snapshots.current.delete(oldest);
        setSnapshot(next);
      }
      if (state) {
        openingMessage.current = state.message?.id ?? null;
        setOpening(state);
      }
    }
    const cursors = [next?.cursor, nextActivity?.cursor, nextPreviews?.cursor].filter(
      (value): value is number => value !== undefined,
    );
    return cursors.length ? Math.min(...cursors) : undefined;
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry restarts bootstrap after a connection failure.
  useEffect(() => {
    const abort = new AbortController();
    request<{ api_readiness_gate: string }>("/health/ready", undefined, undefined, abort.signal)
      .then((health) => {
        if (health.api_readiness_gate !== "ready") throw new Error("API belum siap untuk UI.");
        return command<{ thread_id: string }>("/v1/setup");
      })
      .then((value) => {
        if (abort.signal.aborted) return;
        if (!selectedThread.current) {
          selectedThread.current = value.thread_id;
          selectThread(value.thread_id);
        }
        setReady(true);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(String(failure.message));
      });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    let connectionAbort: AbortController | undefined;
    let cursor = 0;
    let seenCursor = 0;
    let dirty = new Set<Projection>();
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    let connecting = false;
    let refreshError: unknown;
    const flush = async () => {
      timer = undefined;
      if (refreshing || abort.signal.aborted) return;
      const selected = dirty;
      const through = seenCursor;
      dirty = new Set();
      refreshing = true;
      try {
        await refresh(abort.signal, selected);
        cursor = Math.max(cursor, through);
      } catch (failure) {
        refreshError = failure;
        connectionAbort?.abort();
      } finally {
        refreshing = false;
        if (!abort.signal.aborted && !refreshError && seenCursor > through)
          timer = setTimeout(() => void flush(), 0);
      }
    };
    async function connect() {
      if (connecting || abort.signal.aborted) return;
      connecting = true;
      try {
        refreshError = undefined;
        // Initial connections and failures reconcile snapshots; normal expiry resumes its cursor.
        if (cursor === 0 || failures) cursor = (await refresh(abort.signal)) ?? cursor;
        if (abort.signal.aborted) return;
        if (!navigator.onLine) throw new Error("Connection lost. Reconnecting…");
        seenCursor = Math.max(seenCursor, cursor);
        connectionAbort = new AbortController();
        setOnline(true);
        setError("");
        await followEvents(
          cursor,
          AbortSignal.any([abort.signal, connectionAbort.signal]),
          (next, event) => {
            if (next <= cursor) return;
            seenCursor = Math.max(seenCursor, next);
            if (event.entity_kind === "agent") {
              setAgents((current) => mergeEntity(current, event.data as unknown as Agent));
              snapshots.current.clear();
            } else if (event.entity_kind === "thread" && event.data.purpose === "conversation")
              setThreads((current) => mergeEntity(current, event.data as unknown as Thread));
            else if (event.entity_kind === "connection")
              setConnections((current) =>
                mergeEntity(current, event.data as unknown as Connection),
              );
            if (event.data.thread_id && event.data.thread_id !== selectedThread.current)
              snapshots.current.delete(event.data.thread_id);
            for (const projection of eventProjections(
              event,
              selectedThread.current,
              openingMessage.current,
            ))
              dirty.add(projection);
            if (timer === undefined && !refreshing) timer = setTimeout(() => void flush(), 40);
          },
        );
        if (refreshError) throw refreshError;
        failures = 0;
      } catch (failure) {
        if (!abort.signal.aborted) {
          failures++;
          setOnline(false);
          setError(
            !navigator.onLine
              ? "Connection lost. Reconnecting…"
              : failure instanceof Error
                ? failure.message
                : "Connection lost. Reconnecting…",
          );
        }
      }
      connecting = false;
      if (!abort.signal.aborted)
        retry = setTimeout(
          () => void connect(),
          failures ? Math.min(15_000, 500 * 2 ** (failures - 1)) : 0,
        );
    }
    const offline = () => {
      setOnline(false);
      connectionAbort?.abort();
    };
    const online = () => {
      if (connecting) return;
      clearTimeout(retry);
      void connect();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    void connect();
    return () => {
      abort.abort();
      connectionAbort?.abort();
      clearTimeout(retry);
      clearTimeout(timer);
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [refresh, ready]);

  useEffect(() => {
    if (!ready) return;
    if (firstSelection.current === undefined) {
      firstSelection.current = threadId;
      return;
    }
    if (firstSelection.current === threadId) return;
    firstSelection.current = threadId;
    const abort = new AbortController();
    void refresh(abort.signal, new Set(["conversation", "opening"])).catch((failure) => {
      if (!abort.signal.aborted)
        setError(failure instanceof Error ? failure.message : "Percakapan belum tersedia.");
    });
    return () => abort.abort();
  }, [threadId, ready, refresh]);

  const dmAgent =
    snapshot?.thread.type === "dm"
      ? agents.find((agent) => agent.id === snapshot.thread.member_agent_ids[0])
      : undefined;
  const hasPending = snapshot?.runs.some((run) =>
    ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
  );
  useEffect(() => {
    if (
      !online ||
      !threadId ||
      !dmAgent?.model_id ||
      !dmAgent.revision ||
      hasPending ||
      !composer ||
      snapshot?.thread.id !== threadId
    )
      return;
    const dispose = observePreparation(
      composer,
      () => document.visibilityState === "visible" && selectedThread.current === threadId,
      (signal) =>
        request<SessionPreparation>(
          `/v1/threads/${threadId}/prepare`,
          { agent_id: dmAgent.id },
          undefined,
          signal,
        ),
    );
    return dispose;
  }, [
    online,
    threadId,
    snapshot?.thread.id,
    dmAgent?.id,
    dmAgent?.revision,
    dmAgent?.model_id,
    hasPending,
    composer,
  ]);

  const select = (id: string) => {
    if (id === selectedThread.current) return;
    selectedThread.current = id;
    const cached = snapshots.current.get(id);
    latestCursor.current = cached?.cursor ?? 0;
    epoch.current++;
    openingMessage.current = null;
    setSnapshot(cached ?? null);
    setOpening(null);
    localStorage.setItem("ngertiin:thread", id);
    selectThread(id);
  };
  return {
    agents,
    activity,
    previews,
    threads,
    connections,
    snapshot,
    opening,
    threadId,
    select,
    refresh,
    online,
    error,
    setError,
    retry: () => setAttempt((value) => value + 1),
  };
}
