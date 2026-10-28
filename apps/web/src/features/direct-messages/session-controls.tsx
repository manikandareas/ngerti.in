import { useAuth } from "@clerk/tanstack-react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { ApiError, api } from "@/lib/api";
import { base, command, submit } from "./client";
import type { Thread } from "./state";

type Session = {
  native_session_id: string;
  session_revision: string;
  execution_generation: string;
  execution_state: string;
};
type Control = Omit<ReturnType<typeof command>, "expected_revision" | "payload" | "type"> & {
  type: "session.compress" | "session.reset";
  expected_revision: string;
  payload: {
    agent_id: string;
    thread_id: string;
    native_session_id: string;
    execution_generation: string;
  };
};

export function SessionControls({ thread, working }: { thread: Thread; working: boolean }) {
  const { getToken, userId } = useAuth();
  const key = `nma-session-control:v1:${userId}:${thread.thread_id}`;
  const [agentId, setAgentId] = useState(thread.agents[0]?.agent_id ?? "");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const pending = useRef<Control | null>(null);
  const lock = useRef(false);
  const activeKey = useRef<string | null>(key);

  useEffect(() => {
    activeKey.current = key;
    pending.current = null;
    lock.current = false;
    setBusy("");
    setNotice("");
    setError("");
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (
        saved?.payload?.thread_id === thread.thread_id &&
        ["session.compress", "session.reset"].includes(saved.type) &&
        typeof saved.command_id === "string" &&
        typeof saved.expected_revision === "string" &&
        typeof saved.payload.agent_id === "string" &&
        typeof saved.payload.native_session_id === "string" &&
        typeof saved.payload.execution_generation === "string"
      ) {
        pending.current = saved;
        setAgentId(saved.payload.agent_id);
        setError(
          "Perubahan konteks belum terkonfirmasi. Periksa kembali permintaan yang tersimpan.",
        );
      }
    } catch {
      // Storage may be unavailable; retain command identity in memory.
    }
    setReady(Boolean(userId));
    return () => {
      activeKey.current = null;
    };
  }, [key, thread.thread_id, userId]);

  function remember(body: Control | null) {
    try {
      if (body) sessionStorage.setItem(key, JSON.stringify(body));
      else sessionStorage.removeItem(key);
    } catch {
      // Private browsing may disable storage.
    }
    if (activeKey.current === key) pending.current = body;
  }

  async function inspect() {
    if (lock.current || !ready || !agentId) return;
    lock.current = true;
    setBusy("inspect");
    setError("");
    try {
      const value = await api<Session>(
        `${base}/threads/${thread.thread_id}/session?agent_id=${encodeURIComponent(agentId)}`,
        await getToken(),
      );
      if (activeKey.current === key) setSession(value);
    } catch (cause) {
      if (activeKey.current === key)
        setError(
          cause instanceof ApiError && cause.code === "SESSION_UNAVAILABLE"
            ? "Kirim pesan terlebih dahulu untuk memulai konteks agent ini."
            : "Status konteks belum dapat dimuat. Coba kembali.",
        );
    } finally {
      if (activeKey.current === key) {
        lock.current = false;
        setBusy("");
      }
    }
  }

  async function change(operation: "compress" | "reset") {
    if (lock.current || !ready || working || !agentId) return;
    lock.current = true;
    setBusy(operation);
    setError("");
    setNotice("");
    try {
      const token = await getToken();
      if (activeKey.current !== key) return;
      let body = pending.current;
      if (!body) {
        const session = await api<Session>(
          `${base}/threads/${thread.thread_id}/session?agent_id=${encodeURIComponent(agentId)}`,
          token,
        );
        if (activeKey.current !== key) return;
        const payload = {
          agent_id: agentId,
          thread_id: thread.thread_id,
          native_session_id: session.native_session_id,
          execution_generation: session.execution_generation,
        };
        body = {
          ...command(`session.${operation}`, payload),
          type: `session.${operation}`,
          payload,
          expected_revision: session.session_revision,
        };
        remember(body);
      }
      const result = await submit<{ native_mutation: { summary?: { noop?: boolean } } }>(
        body,
        token,
      );
      remember(null);
      if (activeKey.current !== key) return;
      setSession(null);
      setNotice(
        operation === "reset"
          ? "Konteks baru siap. Riwayat percakapan tetap tersimpan."
          : result.native_mutation.summary?.noop
            ? "Konteks masih ringkas. Belum perlu dirangkum."
            : "Konteks dirangkum. Percakapan dapat dilanjutkan dengan ringkasan ini.",
      );
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        cause.status >= 400 &&
        cause.status < 500 &&
        ![401, 403, 408, 429].includes(cause.status)
      )
        remember(null);
      if (activeKey.current !== key) return;
      setSession(null);
      setError(
        cause instanceof ApiError && cause.code === "SESSION_UNAVAILABLE"
          ? "Kirim pesan terlebih dahulu untuk memulai konteks agent ini."
          : cause instanceof ApiError && cause.code === "COMPRESSION_FAILED"
            ? "Konteks belum berhasil dirangkum. Coba kembali setelah pekerjaan selesai."
            : cause instanceof ApiError &&
                ["SESSION_BUSY", "REVISION_CONFLICT", "STALE_GENERATION"].includes(cause.code ?? "")
              ? "Konteks sedang berubah. Tunggu pekerjaan selesai, lalu coba kembali."
              : "Perubahan konteks belum terkonfirmasi. Coba kembali untuk memeriksa permintaan yang sama.",
      );
    } finally {
      if (activeKey.current === key) {
        lock.current = false;
        setBusy("");
      }
    }
  }

  return (
    <details className="border-b pb-3 text-sm">
      <summary className="cursor-pointer py-2 text-muted-foreground">Konteks percakapan</summary>
      <div className="space-y-3 pt-2">
        <p className="max-w-prose text-muted-foreground">
          Ringkas konteks agar percakapan panjang tetap berlanjut, atau mulai konteks baru. Riwayat
          dan tanggung jawab agent tetap tersimpan.
        </p>
        {thread.kind === "group" && (
          <label className="flex flex-wrap items-center gap-3">
            Agent
            <NativeSelect
              value={agentId}
              disabled={!ready || Boolean(busy) || pending.current !== null}
              onChange={(event) => {
                setAgentId(event.target.value);
                setSession(null);
                setNotice("");
                setError("");
              }}
              className="min-h-11 max-w-full rounded-md border bg-background px-3"
            >
              {thread.agents.map((agent) => (
                <option key={agent.agent_id} value={agent.agent_id}>
                  {agent.display_name}
                </option>
              ))}
            </NativeSelect>
          </label>
        )}
        {session && (
          <div role="status" className="rounded-lg bg-muted p-3 text-xs">
            <p>
              Status:{" "}
              {(
                {
                  idle: "Siap dilanjutkan",
                  running: "Sedang bekerja",
                  recovering: "Sedang dipulihkan",
                  indeterminate: "Hasil belum diketahui",
                } as Record<string, string>
              )[session.execution_state] ?? session.execution_state}
            </p>
            <p>Versi konteks: {session.session_revision}</p>
            <p>
              Lanjutkan sesi dengan mengirim pesan. Periksa hasil tindakan yang belum diketahui
              sebelum meminta pengulangan.
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!ready || Boolean(busy)}
            onClick={() => void inspect()}
          >
            {busy === "inspect" ? "Memeriksa…" : "Periksa konteks"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={
              !ready ||
              working ||
              Boolean(busy) ||
              (pending.current !== null && pending.current.type !== "session.compress")
            }
            onClick={() => void change("compress")}
          >
            {busy === "compress"
              ? "Meringkas…"
              : pending.current?.type === "session.compress"
                ? "Periksa hasil ringkasan"
                : "Ringkas konteks"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={
              !ready ||
              working ||
              Boolean(busy) ||
              (pending.current !== null && pending.current.type !== "session.reset")
            }
            onClick={() => void change("reset")}
          >
            {busy === "reset"
              ? "Menyiapkan…"
              : pending.current?.type === "session.reset"
                ? "Periksa konteks baru"
                : "Mulai konteks baru"}
          </Button>
        </div>
        {working && <p className="text-muted-foreground">Tersedia setelah pekerjaan selesai.</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="text-danger">
            {error}
          </p>
        )}
      </div>
    </details>
  );
}
