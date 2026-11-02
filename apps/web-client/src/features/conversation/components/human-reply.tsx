import { Check, LoaderCircle, MessageCircle, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { durableCommand, pendingText } from "@/lib/api-client";
import type { HumanRequest } from "@/types/work";
import type { Agent } from "@/types/workspace";
import { AgentAvatar } from "./identity";

export function HumanReply({
  request,
  author,
  agent,
  refresh,
}: {
  request: HumanRequest;
  author: string;
  agent?: Agent;
  refresh: () => Promise<unknown>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(() => pendingText(`human:${request.id}`));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (request.state !== "pending")
      localStorage.removeItem(`ngertiin:pending:human:${request.id}`);
  }, [request.id, request.state]);
  if (request.state !== "pending")
    return (
      <p className="flex w-full max-w-[560px] items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        {request.state === "answered" ? (
          <Check size={13} className="shrink-0 text-success-foreground" aria-hidden="true" />
        ) : (
          <X size={13} className="shrink-0" aria-hidden="true" />
        )}
        {request.state === "answered"
          ? "Jawaban tersimpan untuk permintaan ini."
          : "Permintaan sudah ditutup."}
      </p>
    );
  return (
    <form
      className="mt-2 w-full max-w-[560px] space-y-3 rounded-[20px] bg-card px-4 pb-3.5 pt-3 ring-[0.5px] ring-foreground/10"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || !(pending ?? text).trim()) return;
        setBusy(true);
        setError("");
        try {
          await durableCommand(`human:${request.id}`, `/v1/human-requests/${request.id}/reply`, {
            expected_revision: request.revision,
            text: pending ?? text,
          });
          await refresh();
        } catch (e) {
          setPending(pendingText(`human:${request.id}`));
          setError(e instanceof Error ? e.message : "Jawaban belum terkonfirmasi.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="flex items-center gap-1.5 text-[13px] leading-[18px] text-muted-foreground">
        {agent ? (
          <AgentAvatar agent={agent} state="listening" className="size-4" />
        ) : (
          <MessageCircle size={14} strokeWidth={1.5} aria-hidden="true" />
        )}
        {author} ·{" "}
        {request.purpose === "review"
          ? "Menunggu review kamu"
          : request.purpose === "approval"
            ? "Menunggu keputusan untuk permintaan ini"
            : "Menunggu jawaban kamu"}
      </p>
      <Textarea
        aria-label={`Jawaban untuk ${author}`}
        value={pending ?? text}
        readOnly={pending !== null}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jawaban untuk pertanyaan ini…"
        disabled={busy}
        rows={2}
        className="min-h-16 rounded-[16px] border-0 bg-foreground/[0.045] px-3 py-2 text-[14px] leading-5 ring-[0.5px] ring-foreground/[0.14] focus-visible:ring-1 focus-visible:ring-foreground/30 dark:bg-foreground/[0.045]"
      />
      {pending !== null && (
        <p className="text-caption text-muted-foreground">
          Pengiriman belum terkonfirmasi. Periksa jawaban tersimpan ini sebelum mengubah atau
          mengirim jawaban lain.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end">
        <Button
          size="sm"
          className="min-h-9 rounded-full px-4 text-[14px] touch:min-h-11"
          disabled={busy || !(pending ?? text).trim()}
        >
          {busy && <LoaderCircle size={15} className="motion-safe:animate-spin" />}
          {busy ? "Mengirim jawaban…" : pending !== null ? "Periksa jawaban" : "Kirim jawaban"}
        </Button>
      </div>
    </form>
  );
}
