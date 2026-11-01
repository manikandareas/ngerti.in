import { useCallback, useEffect, useRef, useState } from "react";
import { command, followEvents, request } from "./api";
import type { Agent, Connection, Opening, Snapshot, Thread } from "./types";

export function useWorkspace() {
  const [agents, setAgents] = useState<Agent[]>([]);
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
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const generation = epoch.current;
      const [nextAgents, nextThreads, nextConnections] = await Promise.all([
        request<Agent[]>("/v1/entities/agent", undefined, undefined, signal),
        request<Thread[]>("/v1/entities/thread", undefined, undefined, signal),
        request<Connection[]>("/v1/entities/connection", undefined, undefined, signal),
      ]);
      if (signal?.aborted || generation !== epoch.current || selectedThread.current !== threadId)
        return;
      setAgents((current) =>
        nextAgents.map((item) => {
          const previous = current.find((a) => a.id === item.id);
          return previous && previous.revision > item.revision ? previous : item;
        }),
      );
      setThreads(nextThreads.filter((t) => t.purpose === "conversation"));
      setConnections(nextConnections);
      if (threadId) {
        const [next, state] = await Promise.all([
          request<Snapshot>(`/v1/threads/${threadId}/snapshot`, undefined, undefined, signal),
          request<Opening>(`/v1/threads/${threadId}/opening`, undefined, undefined, signal),
        ]);
        if (signal?.aborted || generation !== epoch.current || selectedThread.current !== threadId)
          return;
        if (next.cursor >= latestCursor.current) {
          latestCursor.current = next.cursor;
          setSnapshot(next);
          setOpening(state);
        }
        return next.cursor;
      }
    },
    [threadId],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit retry restarts bootstrap after a connection failure.
  useEffect(() => {
    const abort = new AbortController();
    request<{ api_readiness_gate: string }>("/health/ready")
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
      .catch((error) => {
        if (!abort.signal.aborted) setError(String(error.message));
      });
    return () => abort.abort();
  }, [attempt]);

  useEffect(() => {
    if (!ready) return;
    const abort = new AbortController();
    let cursor = 0;
    let retry: ReturnType<typeof setTimeout>;
    async function connect() {
      try {
        cursor = (await refresh(abort.signal)) ?? cursor;
        if (abort.signal.aborted) return;
        setOnline(true);
        setError("");
        await followEvents(cursor, abort.signal, async (next) => {
          if (next <= cursor) return;
          cursor = (await refresh(abort.signal)) ?? next;
        });
      } catch (error) {
        if (!abort.signal.aborted) {
          setOnline(false);
          setError(error instanceof Error ? error.message : "Koneksi terputus");
        }
      }
      if (!abort.signal.aborted) retry = setTimeout(connect, 1500);
    }
    void connect();
    return () => {
      abort.abort();
      clearTimeout(retry);
    };
  }, [refresh, ready]);

  const select = (id: string) => {
    if (id === selectedThread.current) return;
    selectedThread.current = id;
    latestCursor.current = 0;
    epoch.current++;
    setSnapshot(null);
    setOpening(null);
    localStorage.setItem("ngertiin:thread", id);
    selectThread(id);
  };
  return {
    agents,
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
    retry: () => setAttempt((v) => v + 1),
  };
}
