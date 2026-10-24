import { useAuth } from "@clerk/tanstack-react-start";
import { Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { base } from "./client";
import type { Artifact } from "./state";

export function ArtifactResults({ artifacts }: { artifacts: Artifact[] }) {
  const { getToken } = useAuth();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  if (!artifacts.length) return null;
  async function download(item: Artifact) {
    setPending(item.artifact_id);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiUrl}${base}/artifacts/${item.artifact_id}/revisions/${item.revision_id}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) throw new Error("Download failed");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = item.filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("File belum dapat diunduh. Coba kembali.");
    } finally {
      setPending(null);
    }
  }
  return (
    <details className="rounded-lg border p-4">
      <summary className="cursor-pointer text-sm font-medium">
        File hasil · {artifacts.length}
      </summary>
      <ul className="mt-3 space-y-2">
        {artifacts.map((item) => (
          <li key={item.artifact_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{item.filename}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={pending !== null}
              onClick={() => void download(item)}
            >
              <Download className="size-4" />{" "}
              {pending === item.artifact_id ? "Mengunduh…" : "Unduh"}
            </Button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </details>
  );
}
