import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { selectedAgent } from "@/features/account/selection";
import type { AISelection } from "@/features/account/types";
import { durableCommand, followEvents, request } from "@/lib/api-client";
import { clientScope, scopedStorageKey } from "@/lib/client-scope";
import { isPageVisible, subscribePageVisibility } from "@/lib/page-visibility";
import {
  invalidateProviderConnections,
  readProviderConnections,
  readWorkspaceAccess,
  useProviderConnections,
  useWorkspaceAccess,
} from "@/lib/workspace-queries";
import type {
  Agent,
  AgentActivities,
  Connection,
  ConversationPreviews,
  Opening,
  Snapshot,
  Thread,
} from "@/types/workspace";
import { applyConversationEvent, reconcileConversationSnapshot } from "./conversation-events";
import { observePreparation, type SessionPreparation } from "./conversation-preparation";
import { usePreferences } from "./use-preferences";
import { eventProjections, mergeEntity, type Projection } from "./workspace-events";
import { WorkspaceSync } from "./workspace-sync";

const noConnections: Connection[] = [];

export function useWorkspace(composer: HTMLElement | null) {
  const { preferences } = usePreferences();
  const scope = useRef(clientScope()).current;
  if (!scope) throw new Error("An authenticated organization workspace is required.");
  const threadKey = scopedStorageKey("ngertiin:thread", scope);
  const access = useWorkspaceAccess(scope).data ?? null;
  const [selections, setSelections] = useState<AISelection[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activity, setActivity] = useState<AgentActivities>({ cursor: 0, items: [] });
  const [previews, setPreviews] = useState<ConversationPreviews>({ cursor: 0, items: [] });
  const [threads, setThreads] = useState<Thread[]>([]);
  const connections = useProviderConnections(scope).data ?? noConnections;
  const [appConnectionCursor, setAppConnectionCursor] = useState(0);
  const [threadId, selectThread] = useState<string | null>(() =>
    preferences.startup === "last" ? localStorage.getItem(threadKey) : null,
  );
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [opening, setOpening] = useState<Opening | null>(null);
  const [error, setError] = useState("");
  const [online, setOnline] = useState(false);
  const [ready, setReady] = useState(false);
  const [navigationReady, setNavigationReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  const selectedThread = useRef(threadId);
  const latestCursor = useRef(0);
  const openingMessage = useRef<string | null>(null);
  const snapshots = useRef(new Map<string, Snapshot>());
  const firstSelection = useRef<string | null | undefined>(undefined);
  const synchronizer = useRef<WorkspaceSync | null>(null);

  const refresh = useCallback(
    async (signal?: AbortSignal, projections?: Set<Projection>) => {
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
      const navigationRead = Promise.all([
        full ? readWorkspaceAccess({ scope }) : undefined,
        full
          ? load<Agent[]>("/v1/entities/agent", (value) =>
              setAgents((previous) =>
                value.reduce(
                  mergeEntity,
                  previous.filter((agent) => value.some((current) => current.id === agent.id)),
                ),
              ),
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
      ]).then(() => {
        if (full && !signal?.aborted) setNavigationReady(true);
      });
      const results = await Promise.allSettled([
        navigationRead,
        full || projections.has("opening")
          ? load<AISelection[]>("/v1/entities/ai_selection", setSelections)
          : undefined,
        full || projections.has("connections") ? readProviderConnections(scope) : undefined,
        selected && (full || projections.has("conversation"))
          ? load<Snapshot>(`/v1/threads/${selected}/snapshot`, (value) => {
              if (!current() || value.cursor < latestCursor.current) return;
              latestCursor.current = value.cursor;
              value = reconcileConversationSnapshot(value, snapshots.current.get(value.thread.id));
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
    },
    [scope],
  );

  useEffect(() => {
    if (ready) return;
    if (attempt > 0) setError("");
    const abort = new AbortController();
    durableCommand<{ thread_id: string }>("provision", "/v1/data/provision", {})
      .then((value) => {
        if (abort.signal.aborted) return;
        if (!selectedThread.current) {
          selectedThread.current = value.thread_id;
          localStorage.setItem(threadKey, value.thread_id);
          selectThread(value.thread_id);
        }
        setReady(true);
        setError("");
      })
      .catch((failure) => {
        if (!abort.signal.aborted) setError(String(failure.message));
      });
    return () => abort.abort();
  }, [attempt, ready, threadKey]);

  useEffect(() => {
    if (!ready) return;
    let syncSignal: AbortSignal | undefined;
    const sync = new WorkspaceSync({
      refresh: (signal, projections) => {
        if (syncSignal && syncSignal !== signal) invalidateProviderConnections(scope);
        syncSignal = signal;
        return refresh(signal, projections);
      },
      follow: followEvents,
      available: () => navigator.onLine,
      visible: isPageVisible,
      status: (connected, failure) => {
        setOnline(connected);
        setError(failure);
      },
      update: (event) => {
        if (event.entity_kind === "app_connection") setAppConnectionCursor((value) => value + 1);
        if (event.entity_kind === "agent") {
          setAgents((previous) => mergeEntity(previous, event.data as unknown as Agent));
          snapshots.current.clear();
        } else if (event.entity_kind === "thread" && event.data.purpose === "conversation")
          setThreads((previous) => mergeEntity(previous, event.data as unknown as Thread));
        else if (event.entity_kind === "connection") invalidateProviderConnections(scope);
        if (event.data.thread_id && event.data.thread_id !== selectedThread.current)
          snapshots.current.delete(event.data.thread_id);
        const projections = eventProjections(event, selectedThread.current, openingMessage.current);
        const selected = selectedThread.current;
        const previous = selected ? snapshots.current.get(selected) : undefined;
        const patched = previous ? applyConversationEvent(previous, event) : null;
        if (patched) {
          snapshots.current.set(patched.thread.id, patched);
          setSnapshot(patched);
          projections.delete("conversation");
        }
        if (event.entity_kind === "message" && event.data.state === "partial")
          projections.delete("previews");
        if (event.entity_kind === "run") {
          projections.delete("previews");
          const old = previous?.runs.find((run) => run.id === event.entity_id);
          if (
            old &&
            old.status === event.data.status &&
            old.activity === event.data.activity &&
            JSON.stringify(old.active_tools) === JSON.stringify(event.data.active_tools) &&
            JSON.stringify(old.preparation) === JSON.stringify(event.data.preparation) &&
            JSON.stringify(old.native_interactions) ===
              JSON.stringify(event.data.native_interactions)
          )
            projections.delete("activity");
        }
        return projections;
      },
    });
    synchronizer.current = sync;
    const offline = () => sync.disconnect();
    const online = () => sync.reconnect();
    const resume = () => {
      if (isPageVisible()) sync.resume();
      else sync.pause();
    };
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    window.addEventListener("focus", resume);
    const unsubscribeVisibility = subscribePageVisibility(resume);
    sync.start();
    return () => {
      synchronizer.current = null;
      sync.close();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      window.removeEventListener("focus", resume);
      unsubscribeVisibility();
    };
  }, [refresh, ready, scope]);

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

  const selectedDm = threads.find((thread) => thread.id === threadId && thread.type === "dm");
  const earlyAgentId = selectedDm?.member_agent_ids[0];
  useEffect(() => {
    if (!navigationReady || !threadId || !earlyAgentId || !isPageVisible()) return;
    const abort = new AbortController();
    const prepare = () => {
      if (!isPageVisible()) return;
      void request<SessionPreparation>(
        `/v1/threads/${threadId}/prepare`,
        { agent_id: earlyAgentId },
        undefined,
        AbortSignal.any([abort.signal, AbortSignal.timeout(5000)]),
      ).catch(() => {});
    };
    prepare();
    const timer = setInterval(prepare, 60_000);
    const unsubscribe = subscribePageVisibility(prepare);
    return () => {
      abort.abort();
      clearInterval(timer);
      unsubscribe();
    };
  }, [navigationReady, threadId, earlyAgentId]);

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
      () => isPageVisible() && selectedThread.current === threadId,
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
    localStorage.setItem(threadKey, id);
    selectThread(id);
  };
  const selectedSnapshot = useMemo(
    () =>
      snapshot
        ? {
            ...snapshot,
            agents: snapshot.agents.map((agent) =>
              selectedAgent(agent, snapshot.thread.id, selections, connections),
            ),
          }
        : snapshot,
    [snapshot, selections, connections],
  );
  return {
    agents,
    access,
    invocableAgents: agents.filter(
      (agent) => agent.actor_id !== null || access?.invocable_team_agent_ids.includes(agent.id),
    ),
    navigationReady,
    activity,
    previews,
    threads,
    connections,
    selections,
    appConnectionCursor,
    snapshot: selectedSnapshot,
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
