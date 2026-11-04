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
import { WorkspaceSync } from "./workspace-sync";

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
  const synchronizer = useRef<WorkspaceSync | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal, projections?: Set<Projection>) => {
    const generation = epoch.current;
    const selected = selectedThread.current;
    const full = projections === undefined;
    const cursors: number[] = [];
    const load = async <T>(path: string, apply: (value: T) => void) => {
      const value = await request<T>(path, undefined, undefined, signal);
      if (signal?.aborted) return;
      apply(value);
      if (
        value &&
        typeof value === "object" &&
        "cursor" in value &&
        typeof value.cursor === "number"
      )
        cursors.push(value.cursor);
    };
    const current = () => generation === epoch.current && selected === selectedThread.current;
    // Apply independent projections as they arrive. A failed read still fails the batch,
    // so event replay never acknowledges it as fully reconciled.
    const results = await Promise.allSettled([
      full
        ? load<Agent[]>("/v1/entities/agent", (value) =>
            setAgents((previous) => value.reduce(mergeEntity, previous)),
          )
        : undefined,
      full
        ? load<Thread[]>("/v1/entities/thread", (value) =>
            setThreads((previous) =>
              value
                .filter((thread) => thread.purpose === "conversation")
                .reduce(mergeEntity, previous),
            ),
          )
        : undefined,
      full
        ? load<Connection[]>("/v1/entities/connection", (value) =>
            setConnections((previous) => value.reduce(mergeEntity, previous)),
          )
        : undefined,
      full || projections.has("activity")
        ? load<AgentActivities>("/v1/agents/activity", (value) =>
            setActivity((previous) => (value.cursor >= previous.cursor ? value : previous)),
          )
        : undefined,
      full || projections.has("previews")
        ? load<ConversationPreviews>("/v1/conversations/previews", (value) =>
            setPreviews((previous) => (value.cursor >= previous.cursor ? value : previous)),
          )
        : undefined,
      selected && (full || projections.has("conversation"))
        ? load<Snapshot>(`/v1/threads/${selected}/snapshot`, (value) => {
            if (!current() || value.cursor < latestCursor.current) return;
            latestCursor.current = value.cursor;
            snapshots.current.delete(value.thread.id);
            snapshots.current.set(value.thread.id, value);
            const oldest = snapshots.current.keys().next().value;
            if (snapshots.current.size > 5 && oldest !== undefined)
              snapshots.current.delete(oldest);
            setSnapshot(value);
          })
        : undefined,
      selected && (full || projections.has("opening"))
        ? load<Opening>(`/v1/threads/${selected}/opening`, (value) => {
            if (!current()) return;
            openingMessage.current = value.message?.id ?? null;
            setOpening(value);
          })
        : undefined,
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
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
    const sync = new WorkspaceSync({
      refresh,
      follow: followEvents,
      available: () => navigator.onLine,
      visible: () => document.visibilityState === "visible",
      status: (connected, failure) => {
        setOnline(connected);
        setError(failure);
      },
      update: (event) => {
        if (event.entity_kind === "agent") {
          setAgents((previous) => mergeEntity(previous, event.data as unknown as Agent));
          snapshots.current.clear();
        } else if (event.entity_kind === "thread" && event.data.purpose === "conversation")
          setThreads((previous) => mergeEntity(previous, event.data as unknown as Thread));
        else if (event.entity_kind === "connection")
          setConnections((previous) => mergeEntity(previous, event.data as unknown as Connection));
        if (event.data.thread_id && event.data.thread_id !== selectedThread.current)
          snapshots.current.delete(event.data.thread_id);
        return eventProjections(event, selectedThread.current, openingMessage.current);
      },
    });
    synchronizer.current = sync;
    const offline = () => sync.disconnect();
    const online = () => sync.reconnect();
    const resume = () => {
      if (document.visibilityState === "visible") sync.resume();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", resume);
    sync.start();
    return () => {
      synchronizer.current = null;
      sync.close();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", resume);
      document.removeEventListener("visibilitychange", resume);
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
    retry: () => {
      if (synchronizer.current) synchronizer.current.reconnect();
      else setAttempt((value) => value + 1);
    },
  };
}
