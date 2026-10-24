import { useAuth } from "@clerk/tanstack-react-start";
import { createEventSource } from "eventsource-client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api, apiUrl } from "@/lib/api";
import { base } from "./client";
import { applyEvent, type Event, mergeMessages, type Snapshot } from "./state";

export function useDirectMessage(threadId: string) {
  const { getToken } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connection, setConnection] = useState<
    "connecting" | "connected" | "reconnecting" | "error"
  >("connecting");
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const state = useRef<Snapshot | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(() => setReload((value) => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let fatal = false;
    const controller = new AbortController();
    let stream: ReturnType<typeof createEventSource> | undefined;
    let sequence = 0n;
    generation.current += 1;
    setError("");
    setConnection("connecting");
    setLoadingEarlier(false);
    const offline = () => {
      stream?.close();
      setConnection("reconnecting");
    };
    const online = () => refresh();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    async function connect() {
      const initial = await api<Snapshot>(
        `${base}/threads/${threadId}/snapshot?reload=${reload}`,
        await getToken(),
        { signal: controller.signal },
      );
      if (disposed) return;
      state.current = initial;
      setSnapshot(initial);
      stream = createEventSource({
        url: `${apiUrl}${base}/events?thread_id=${encodeURIComponent(threadId)}`,
        initialLastEventId: initial.through_cursor,
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          const authorized = async (fresh = false) => {
            const token = await getToken({ skipCache: fresh });
            if (token) headers.set("Authorization", `Bearer ${token}`);
            return fetch(url, { ...init, headers });
          };
          let response = await authorized();
          if (response.status === 401) response = await authorized(true);
          if (disposed) return response;
          if (response.status === 409) {
            fatal = true;
            stream?.close();
            refresh();
          } else if ([401, 403, 404, 422].includes(response.status)) {
            fatal = true;
            setError("Percakapan tidak dapat disambungkan. Periksa sesi lalu coba lagi.");
            setConnection("error");
            stream?.close();
          } else if (!response.ok) setConnection("reconnecting");
          else setConnection("connected");
          return response;
        },
        onDisconnect: () => {
          if (!disposed && !fatal) setConnection("reconnecting");
        },
        onScheduleReconnect: () => {
          if (!disposed && !fatal) setConnection("reconnecting");
        },
        onMessage: ({ data, event: kind, id }) => {
          if (disposed || !state.current) return;
          if (kind === "stream.error") {
            setConnection("reconnecting");
            return;
          }
          try {
            const event = JSON.parse(data) as Event;
            const seq = BigInt(event.seq);
            if (seq <= sequence) return;
            const next = applyEvent(state.current, event);
            state.current = { ...next, through_cursor: id ?? next.through_cursor };
            sequence = seq;
            setSnapshot(state.current);
          } catch {
            fatal = true;
            setError("Riwayat belum tersinkron. Muat ulang untuk mengambil keadaan terbaru.");
            setConnection("error");
            stream?.close();
          }
        },
      });
    }
    void connect().catch((reason) => {
      if (disposed) return;
      setConnection("error");
      setError(
        reason instanceof ApiError && reason.status === 404
          ? "Percakapan tidak ditemukan atau bukan milik akun ini."
          : "Percakapan belum dapat dimuat. Coba sambungkan kembali.",
      );
    });
    return () => {
      disposed = true;
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      generation.current += 1;
      controller.abort();
      stream?.close();
    };
  }, [threadId, getToken, reload, refresh]);

  async function loadEarlier() {
    const before = state.current?.next_before_message_seq;
    if (!before || loadingEarlier) return;
    const version = generation.current;
    setLoadingEarlier(true);
    try {
      const previous = await api<Snapshot>(
        `${base}/threads/${threadId}/snapshot?before_message_seq=${before}`,
        await getToken(),
      );
      if (version !== generation.current || !state.current) return;
      const current = state.current;
      const existing = new Set(current.runs.map((run) => run.run_id));
      state.current = {
        ...current,
        messages: mergeMessages(previous.messages, current.messages),
        runs: [...previous.runs.filter((run) => !existing.has(run.run_id)), ...current.runs],
        next_before_message_seq: previous.next_before_message_seq,
      };
      setSnapshot(state.current);
    } catch {
      if (version === generation.current)
        setError("Pesan sebelumnya belum dapat dimuat. Coba lagi.");
    } finally {
      if (version === generation.current) setLoadingEarlier(false);
    }
  }
  return { snapshot, connection, error, refresh, loadEarlier, loadingEarlier };
}
