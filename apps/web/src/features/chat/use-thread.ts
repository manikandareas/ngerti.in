import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { createEventSource } from "eventsource-client";
import { useEffect, useRef, useState } from "react";
import { api, apiUrl } from "@/lib/api";
import { applyEvent } from "./thread-state";
import type { ChatEvent, ChatMessage, Snapshot } from "./types";

export type ThreadConnection = "connecting" | "connected" | "reconnecting";

export function useThread(threadId: string | null) {
  const { getToken, userId } = useAuth();
  const queryClient = useQueryClient();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<ThreadConnection>("connecting");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const state = useRef<Snapshot | null>(null);
  const snapshotPath = `/chat/threads/${threadId}?reload=${reload}`;

  useEffect(() => {
    let disposed = false;
    let stream: ReturnType<typeof createEventSource> | undefined;
    setSnapshot(null);
    state.current = null;
    setError("");
    setConnection("connecting");
    if (!threadId || !userId) return;
    async function connect() {
      const initial = await api<Snapshot>(snapshotPath, await getToken());
      if (disposed) return;
      state.current = initial;
      setSnapshot(initial);
      stream = createEventSource({
        url: `${apiUrl}/chat/threads/${threadId}/events`,
        initialLastEventId: String(initial.through_seq),
        fetch: async (url, init) => {
          const token = await getToken();
          const authorizedFetch = (token: string | null) => {
            const headers = new Headers(init?.headers);
            if (token) headers.set("Authorization", `Bearer ${token}`);
            return fetch(url, {
              ...init,
              headers,
            });
          };
          let response = await authorizedFetch(token);
          if (response.status === 401) {
            response = await authorizedFetch(await getToken({ skipCache: true }));
          }
          if (disposed) return response;
          if (response.status === 401 || response.status === 403) {
            setError("Sesi perlu diperbarui. Muat ulang percakapan untuk melanjutkan.");
          }
          if (response.status === 409) {
            setError("Lewati gangguan koneksi dengan memuat ulang percakapan.");
          }
          return response;
        },
        onConnect: () => {
          if (!disposed) setConnection("connected");
        },
        onDisconnect: () => {
          if (!disposed) setConnection("reconnecting");
        },
        onMessage: ({ data }) => {
          if (disposed || !state.current) return;
          try {
            const event = JSON.parse(data) as ChatEvent;
            const next = applyEvent(state.current, event);
            state.current = next;
            setSnapshot(next);
            if (event.type === "run.status") {
              void queryClient.invalidateQueries({ queryKey: ["chat-threads", userId] });
            }
          } catch {
            setError("Pesan belum tersinkron. Muat ulang untuk melanjutkan.");
            stream?.close();
          }
        },
      });
    }
    connect().catch((reason) => {
      if (!disposed)
        setError(reason instanceof Error ? reason.message : "Percakapan belum dapat dibuka.");
    });
    return () => {
      disposed = true;
      stream?.close();
    };
  }, [threadId, userId, getToken, queryClient, snapshotPath]);

  async function loadEarlier() {
    const before = state.current?.messages[0]?.position;
    if (!before) return;
    const previous = await api<{ messages: ChatMessage[]; has_more: boolean }>(
      `/chat/threads/${threadId}/messages?before=${before}`,
      await getToken(),
    );
    if (!state.current) return;
    const ids = new Set(state.current.messages.map((message) => message.id));
    const next = {
      ...state.current,
      has_more: previous.has_more,
      messages: [
        ...previous.messages.filter((message) => !ids.has(message.id)),
        ...state.current.messages,
      ],
    };
    state.current = next;
    setSnapshot(next);
  }
  return {
    snapshot,
    connection,
    error,
    refresh: () => setReload((value) => value + 1),
    loadEarlier,
  };
}
