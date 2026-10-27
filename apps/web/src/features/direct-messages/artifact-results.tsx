import { useAuth } from "@clerk/tanstack-react-start";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api";
import { base } from "./client";
import { PdfPreview } from "./pdf-preview";
import type { Artifact } from "./state";

export function ArtifactResults({
  artifacts,
  threadId,
  label = "File hasil",
}: {
  artifacts: Artifact[];
  threadId?: string;
  label?: string;
}) {
  const { getToken } = useAuth();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<{
    name: string;
    text?: string;
    url?: string;
    media?: string;
  } | null>(null);
  useEffect(
    () => () => {
      if (preview?.url) URL.revokeObjectURL(preview.url);
    },
    [preview?.url],
  );
  if (!artifacts.length) return null;
  async function download(item: Artifact, showPreview = false) {
    setPending(item.artifact_id);
    setError("");
    try {
      const token = await getToken();
      const response = await fetch(
        `${apiUrl}${base}/artifacts/${item.artifact_id}/revisions/${item.revision_id}/download${threadId ? `?thread_id=${threadId}` : ""}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!response.ok) throw new Error("Download failed");
      const blob = await response.blob();
      if (showPreview) {
        if (item.media_type === "application/pdf" || item.media_type?.startsWith("image/")) {
          setPreview({
            name: item.filename,
            url: URL.createObjectURL(blob),
            media: item.media_type,
          });
          return;
        }
        setPreview({
          name: item.filename,
          text:
            (await blob.slice(0, 64000).text()) +
            (blob.size > 64000 ? "\n…Pratinjau dipotong. Unduh file lengkap." : ""),
        });
        return;
      }
      const url = URL.createObjectURL(blob);
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
        {label} · {artifacts.length}
      </summary>
      <ul className="mt-3 space-y-2">
        {artifacts.map((item) => (
          <li key={item.artifact_id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 break-words">{item.filename}</span>
            {(!item.media_type ||
              item.media_type.startsWith("text/") ||
              item.media_type === "application/pdf" ||
              item.media_type.startsWith("image/") ||
              /\.(json|md|csv|txt|py|ipynb)$/i.test(item.filename)) && (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Pratinjau ${item.filename}`}
                disabled={pending !== null}
                onClick={() => void download(item, true)}
              >
                Pratinjau
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Unduh ${item.filename}`}
              disabled={pending !== null}
              onClick={() => void download(item)}
            >
              <Download className="size-4" />{" "}
              {pending === item.artifact_id ? "Mengunduh…" : "Unduh"}
            </Button>
          </li>
        ))}
      </ul>
      {preview && (
        <div className="mt-3 space-y-2">
          <p className="break-all text-sm">{preview.name}</p>
          {preview.url ? (
            preview.media?.startsWith("image/") ? (
              <img
                src={preview.url}
                alt={preview.name}
                className="max-h-96 max-w-full object-contain"
              />
            ) : (
              <PdfPreview key={preview.url} url={preview.url} name={preview.name} />
            )
          ) : (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
              {preview.text}
            </pre>
          )}
          <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
            Tutup pratinjau
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </details>
  );
}
