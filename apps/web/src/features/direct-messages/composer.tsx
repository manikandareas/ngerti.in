import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { providerFailureMessage } from "@/features/connections/client";
import { ApiError } from "@/lib/api";
import { command, submit } from "./client";
import type { Thread } from "./state";

type Pending = ReturnType<typeof command> & {
  payload: {
    thread_id: string;
    text: string;
    attachment_ids: never[];
    request_key: string;
    expected_membership_revision: string;
  };
};
export function Composer({
  thread,
  working,
  connected,
}: {
  thread: Thread;
  working: boolean;
  connected: boolean;
}) {
  const { getToken, userId } = useAuth();
  const key = `nma-dm:${userId}:${thread.thread_id}`;
  const [text, setText] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repairNeeded, setRepairNeeded] = useState(false);
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved) {
        setText(saved.text ?? "");
        setPending(saved.pending ?? null);
      }
    } catch {
      /* Storage is optional; command identity remains in memory. */
    }
    setReady(true);
    return () => {
      alive.current = false;
    };
  }, [key]);
  function save(value: string, intent: Pending | null) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ text: value, pending: intent }));
    } catch {
      /* Private browsing may disable storage. */
    }
  }
  async function send() {
    if (lock.current || !ready || (!text.trim() && !pending)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setRepairNeeded(false);
    const payload = {
      thread_id: thread.thread_id,
      text,
      attachment_ids: [] as never[],
      request_key: crypto.randomUUID(),
      expected_membership_revision: thread.membership_revision,
    };
    const intent = pending ?? { ...command("message.send", payload), payload };
    setPending(intent);
    save(text, intent);
    try {
      await submit(intent, await getToken());
      save("", null);
      if (alive.current) {
        setText("");
        setPending(null);
        input.current?.focus();
      }
    } catch (reason) {
      if (!alive.current) return;
      const connectionCode =
        reason instanceof ApiError &&
        (reason.code === "MODEL_UNAVAILABLE" || reason.code?.startsWith("PROVIDER_"))
          ? reason.code
          : null;
      setRepairNeeded(!!connectionCode);
      if (
        reason instanceof ApiError &&
        reason.status >= 400 &&
        reason.status < 500 &&
        ![401, 403, 408, 429].includes(reason.status)
      ) {
        setPending(null);
        save(text, null);
        setError(
          connectionCode
            ? providerFailureMessage(connectionCode)
            : "Pesan ditolak. Periksa status agent atau muat ulang percakapan sebelum mengirim lagi.",
        );
      } else
        setError(
          "Pengiriman belum terkonfirmasi. Coba kirim kembali dengan identitas pesan yang sama.",
        );
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const unavailable = thread.status !== "open" || thread.agents[0]?.status !== "active";
  const needsModel = thread.kind === "dm" && !thread.agents[0]?.config.model;
  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      {unavailable && (
        <p role="status" className="text-sm text-muted-foreground">
          Agent atau percakapan tidak aktif. Riwayat tetap dapat dibaca.
        </p>
      )}
      {(needsModel || repairNeeded) && (
        <div role="status" className="space-y-2 text-sm">
          {needsModel && <p>Hubungkan akun model, lalu pilih model untuk agent ini.</p>}
          <div className="flex flex-wrap gap-4">
            <Link to="/connections" className="underline underline-offset-4">
              Kelola koneksi model
            </Link>
            <Link to="/agents" className="underline underline-offset-4">
              Pilih model agent
            </Link>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {pending && !busy && (
        <p role="status" className="text-sm">
          Ada pengiriman yang belum terkonfirmasi. Periksa kembali dengan tombol di bawah; pesan
          tidak akan digandakan.
        </p>
      )}
      <label htmlFor="dm-message" className="sr-only">
        Pesan untuk {thread.kind === "group" ? thread.title : thread.agents[0]?.display_name}
      </label>
      {thread.kind === "group" && (
        <fieldset className="flex flex-wrap gap-1" aria-label="Mention anggota">
          {thread.agents.map((agent) => (
            <Button
              key={agent.agent_id}
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy || !!pending}
              onClick={() => {
                const value = `${text}${text && !text.endsWith(" ") ? " " : ""}@${agent.handle} `;
                setText(value);
                save(value, null);
                input.current?.focus();
              }}
            >
              @{agent.handle}
            </Button>
          ))}
        </fieldset>
      )}
      <Textarea
        ref={input}
        id="dm-message"
        rows={3}
        maxLength={100000}
        value={text}
        disabled={!ready || unavailable || !!pending}
        placeholder={`Pesan untuk ${(thread.kind === "group" ? thread.title : thread.agents[0]?.display_name) ?? "agent"}…`}
        className="max-h-48 min-h-24 resize-y bg-background text-base"
        onChange={(event) => {
          setText(event.target.value);
          save(event.target.value, null);
        }}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing &&
            !window.matchMedia("(pointer: coarse)").matches
          ) {
            event.preventDefault();
            if (connected) void send();
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-sm text-xs text-muted-foreground">
          {working
            ? "Pesan baru menghentikan jawaban yang berjalan dan menyampaikan arahanmu."
            : "Percakapan tersimpan. Kamu bisa kembali kapan saja."}
        </p>
        <Button
          type="submit"
          disabled={
            !ready || busy || (unavailable && !pending) || !connected || (!text.trim() && !pending)
          }
        >
          {busy ? "Mengirim…" : pending ? "Periksa / kirim kembali" : "Kirim pesan"}
        </Button>
      </div>
    </form>
  );
}
