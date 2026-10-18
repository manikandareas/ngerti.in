import { useAuth } from "@clerk/tanstack-react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { BackgroundTask } from "@/features/tasks/types";
import { api } from "@/lib/api";

export function TaskInputs({ task }: { task: BackgroundTask }) {
  const { getToken, userId } = useAuth();
  const client = useQueryClient();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [ack, setAck] = useState(false);
  const keys = useRef(new Map<string, string>());
  async function retry(id: string) {
    setPending(true);
    setError("");
    try {
      const identity = `${id}:${ack}`;
      const key = keys.current.get(identity) ?? crypto.randomUUID();
      keys.current.set(identity, key);
      await api(`/files/revisions/${id}/extraction/retry`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledge_possible_charge: ack, request_key: key }),
      });
      await api(`/tasks/${task.id}/retry`, await getToken(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_key: crypto.randomUUID() }),
      });
      void client.invalidateQueries({ queryKey: ["tasks", userId] });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ekstraksi belum dapat diulang.");
    } finally {
      setPending(false);
    }
  }
  if (!task.inputs?.length) return null;
  return (
    <div className="space-y-2 text-xs text-muted-foreground">
      {task.inputs.map((file) => (
        <div key={file.revision_id} className="rounded-xl border p-3">
          <p className="wrap-anywhere">
            {file.filename} · v{file.revision} ·{" "}
            {file.selection.unit === "page" ? "halaman" : "baris"} {file.selection.start}–
            {file.selection.end ?? "akhir"}
          </p>
          <p>
            {file.file_status === "deleted"
              ? "Input dihapus"
              : ({
                  queued: "Menunggu ekstraksi",
                  running: "Membaca file",
                  ready: "Isi siap",
                  failed: "Ekstraksi gagal",
                  unknown: "Outcome OCR belum pasti",
                }[file.extraction_status] ?? file.extraction_status)}
          </p>
          {file.error ? <p className="mt-1 text-danger">{file.error}</p> : null}
          {file.reserved_pages > 0 ? (
            <p className="mt-1">
              Ekstraksi revision: {file.charged_pages} halaman terpakai/dicadangkan ·{" "}
              {file.extraction_model}. Cache revision yang sama dapat digunakan kembali.
            </p>
          ) : null}
          {["failed", "unknown"].includes(file.extraction_status) &&
          task.status === "failed" &&
          file.file_status === "ready" ? (
            <div className="mt-2 space-y-2">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(event) => setAck(event.target.checked)}
                />
                Saya memahami percobaan OCR baru dapat memakai kredit lagi.
              </label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => void retry(file.revision_id)}
              >
                Coba ulang ekstraksi
              </Button>
            </div>
          ) : null}
        </div>
      ))}
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
