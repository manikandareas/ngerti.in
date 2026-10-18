import { useAuth } from "@clerk/tanstack-react-start";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";

export function TaskOutputDownload({
  taskId,
  outputId,
  filename,
}: {
  taskId: string;
  outputId: string;
  filename: string;
}) {
  const { getToken } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function download() {
    setBusy(true);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(`${apiUrl}/tasks/${taskId}/outputs/${outputId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Berkas tidak tersedia atau telah dihapus.");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unduhan belum berhasil.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? "Menyiapkan unduhan…" : "Unduh untuk ditinjau"}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
