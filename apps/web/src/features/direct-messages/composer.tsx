import { useAuth } from "@clerk/tanstack-react-start";
import { Link } from "@tanstack/react-router";
import { ArrowUp, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PromptBar } from "@/components/beautiful-ui/conversation";
import { Button } from "@/components/ui/button";
import { providerFailureMessage } from "@/features/connections/client";
import { ApiError } from "@/lib/api";
import { ArtifactResults } from "./artifact-results";
import { command, submit } from "./client";
import { FileUpload, type UploadHandle } from "./file-upload";
import { MentionInput } from "./mention-input";
import type { Artifact, Thread } from "./state";

type Pending = ReturnType<typeof command> & {
  payload: {
    thread_id: string;
    text: string;
    attachment_ids: string[];
    request_key: string;
    expected_membership_revision: string;
  };
};
export function Composer({
  thread,
  connected,
}: {
  thread: Thread;
  working: boolean;
  connected: boolean;
}) {
  const { getToken, userId } = useAuth();
  const key = `nma-dm:${userId}:${thread.thread_id}`;
  const [text, setText] = useState("");
  const [attachments, setAttachments] = useState<Artifact[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [repairNeeded, setRepairNeeded] = useState(false);
  const [ready, setReady] = useState(false);
  const lock = useRef(false);
  const uploadRef = useRef<UploadHandle | null>(null);
  const currentDraft = useRef({ text, attachments, pending });
  currentDraft.current = { text, attachments, pending };
  const input = useRef<HTMLTextAreaElement>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (saved) {
        setText(saved.text ?? "");
        setPending(saved.pending ?? null);
        setAttachments(saved.attachments ?? []);
      }
    } catch {
      /* Storage is optional; command identity remains in memory. */
    }
    setReady(true);
    return () => {
      alive.current = false;
    };
  }, [key]);
  function save(value: string, intent: Pending | null, files = attachments) {
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify({ text: value, pending: intent, attachments: files }),
      );
    } catch {
      /* Private browsing may disable storage. */
    }
  }
  async function send() {
    if (
      lock.current ||
      !ready ||
      !connected ||
      (unavailable && !pending) ||
      (!text.trim() && !attachments.length && !pending)
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    setRepairNeeded(false);
    const payload = {
      thread_id: thread.thread_id,
      text,
      attachment_ids: attachments.map((file) => file.artifact_id),
      request_key: crypto.randomUUID(),
      expected_membership_revision: thread.membership_revision,
    };
    const intent = pending ?? { ...command("message.send", payload), payload };
    setPending(intent);
    save(text, intent);
    try {
      await submit(intent, await getToken());
      save("", null, []);
      if (alive.current) {
        setText("");
        setPending(null);
        setAttachments([]);
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
      onPaste={(event) => {
        const file = Array.from(event.clipboardData.files).find((item) =>
          item.type.startsWith("image/"),
        );
        if (file && !busy && !pending && attachments.length < 10) {
          event.preventDefault();
          void uploadRef.current?.upload(file);
        }
      }}
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
      {attachments.length > 0 && (
        <div className="relative max-h-52 min-w-0 basis-full overflow-y-auto">
          <ArtifactResults
            artifacts={attachments}
            threadId={thread.thread_id}
            label="Lampiran"
            compact
            onRemove={
              busy || pending
                ? undefined
                : (file) => {
                    const next = attachments.filter((a) => a.artifact_id !== file.artifact_id);
                    setAttachments(next);
                    save(text, pending, next);
                  }
            }
          />
        </div>
      )}
      <PromptBar>
        <label htmlFor="dm-message" className="sr-only">
          Pesan untuk {thread.kind === "group" ? thread.title : thread.agents[0]?.display_name}
        </label>
        <MentionInput
          inputRef={input}
          agents={thread.kind === "group" ? thread.agents : []}
          id="dm-message"
          rows={1}
          maxLength={100000}
          value={text}
          disabled={!ready || unavailable || !!pending}
          placeholder={
            thread.kind === "group"
              ? "Tulis pesan atau tag agent dengan @"
              : `Pesan untuk ${thread.agents[0]?.display_name ?? "agent"}…`
          }
          onValueChange={(value) => {
            setText(value);
            save(value, null);
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
        <div className="contents">
          <FileUpload
            compact
            uploadRef={uploadRef}
            threadId={thread.thread_id}
            disabled={busy || !!pending || !ready || unavailable || attachments.length >= 10}
            onTranscript={(transcript, artifactId) => {
              const draft = currentDraft.current;
              if (
                draft.pending ||
                !draft.attachments.some((file) => file.artifact_id === artifactId)
              )
                return;
              const value = `${draft.text}${draft.text ? "\n" : ""}${transcript}`;
              setText(value);
              save(value, null, draft.attachments);
              input.current?.focus();
            }}
            onReady={(file) => {
              const next = [...attachments.filter((a) => a.artifact_id !== file.artifact_id), file];
              setAttachments(next);
              save(text, pending, next);
            }}
          />
          <div className="relative order-4 ml-auto self-end">
            <Button
              type="submit"
              size={pending && !busy ? "default" : "icon"}
              className="rounded-full shadow-none"
              aria-label={
                busy ? "Mengirim pesan" : pending ? "Periksa / kirim kembali" : "Kirim pesan"
              }
              disabled={
                !ready ||
                busy ||
                (unavailable && !pending) ||
                !connected ||
                (!text.trim() && !attachments.length && !pending)
              }
            >
              {pending && !busy ? (
                "Periksa / kirim kembali"
              ) : busy ? (
                <LoaderCircle
                  className="size-4 animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <ArrowUp className="size-4" aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>
      </PromptBar>
    </form>
  );
}
