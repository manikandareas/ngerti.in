import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { durableCommand, pendingText } from "@/lib/api-client";
import type { HumanRequest } from "@/types/work";

export function HumanReply({
  request,
  author,
  refresh,
}: {
  request: HumanRequest;
  author: string;
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
      <p className="text-caption text-muted-foreground">
        {request.state === "answered"
          ? "Jawaban tersimpan untuk permintaan ini."
          : "Permintaan sudah ditutup."}
      </p>
    );
  return (
    <form
      className="mt-2 max-w-md space-y-2 rounded-xl border p-3"
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
      <p className="text-caption text-muted-foreground">
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
      <Button size="sm" disabled={busy || !(pending ?? text).trim()}>
        {busy ? "Mengirim jawaban…" : pending !== null ? "Periksa jawaban" : "Kirim jawaban"}
      </Button>
    </form>
  );
}
