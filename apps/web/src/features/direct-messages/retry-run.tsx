import { useAuth } from "@clerk/tanstack-react-start";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api";
import { command, submit } from "./client";

export function RetryRun({ runId, refresh }: { runId: string; refresh: () => void }) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function retry() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      await submit(command("history.retry", { run_id: runId }), await getToken());
      refresh();
    } catch (cause) {
      setError(
        cause instanceof ApiError && cause.code === "RETRY_UNSAFE"
          ? "Pekerjaan ini sudah memiliki tindakan atau hasil yang perlu diperiksa. Jelaskan langkah selanjutnya lewat percakapan."
          : "Hasil belum terkonfirmasi. Coba periksa kembali; permintaan memakai identitas pengulangan yang sama.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" disabled={busy} onClick={() => void retry()}>
        {busy ? "Memeriksa…" : "Coba ulang dengan pemeriksaan"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
