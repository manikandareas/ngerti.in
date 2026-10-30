import { useAuth } from "@clerk/tanstack-react-start";
import { Download, FileText, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Streamdown } from "streamdown";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { apiUrl } from "@/lib/api";
import { base } from "./client";
import { PdfPreview } from "./pdf-preview";
import type { Artifact } from "./state";

export function ArtifactResults({
  artifacts,
  threadId,
  label = "File hasil",
  compact = false,
  onRemove,
}: {
  artifacts: Artifact[];
  threadId?: string;
  label?: string;
  compact?: boolean;
  onRemove?: (artifact: Artifact) => void;
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
      if (!response.ok)
        throw new Error(
          response.status === 401 || response.status === 403
            ? "Akses file kedaluwarsa atau tidak diizinkan. Muat ulang percakapan lalu coba kembali."
            : response.status === 404 || response.status === 410
              ? "File atau versi ini sudah tidak tersedia. Minta agent mengirim ulang."
              : "File belum dapat diunduh. Coba kembali.",
        );
      const blob = await response.blob();
      if (showPreview) {
        if (
          item.media_type === "application/pdf" ||
          item.media_type?.startsWith("image/") ||
          item.media_type?.startsWith("audio/") ||
          item.media_type?.startsWith("video/")
        ) {
          setPreview({
            name: item.filename,
            url: URL.createObjectURL(blob),
            media: item.media_type,
          });
          return;
        }
        setPreview({
          name: item.filename,
          media: /\.md$/i.test(item.filename) ? "text/markdown" : item.media_type,
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "File belum dapat diunduh. Coba kembali.");
    } finally {
      setPending(null);
    }
  }
  return (
    <section className="min-w-0 space-y-3" aria-label={label} aria-busy={pending !== null}>
      <h3 className={compact ? "sr-only" : "text-sm font-medium"}>
        {label} · {artifacts.length}
      </h3>
      <ul className={compact ? "flex flex-wrap gap-2" : "mt-3 space-y-2"}>
        {artifacts.map((item) => (
          <li
            key={item.artifact_id}
            className={
              compact
                ? "flex min-w-0 max-w-full items-center gap-1 rounded-full border bg-muted/40 px-2 py-1 text-xs"
                : "flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3 text-sm"
            }
          >
            <FileText className="size-5 shrink-0 text-muted-foreground" />
            <div className={compact ? "min-w-0 max-w-40 flex-1" : "min-w-0 flex-1 basis-32"}>
              <p
                className={compact ? "truncate font-medium" : "break-all font-medium"}
                title={item.filename}
              >
                {item.filename}
              </p>
              <p className={compact ? "sr-only" : "text-xs text-muted-foreground"}>
                {item.filename.includes(".")
                  ? item.filename.split(".").at(-1)?.toUpperCase()
                  : "File"}
                {item.byte_count != null &&
                  ` · ${item.byte_count < 1024 ? `${item.byte_count} B` : `${Math.ceil(item.byte_count / 1024)} KB`}`}
              </p>
            </div>
            {(item.media_type?.startsWith("text/") ||
              item.media_type === "application/pdf" ||
              item.media_type?.startsWith("image/") ||
              item.media_type?.startsWith("audio/") ||
              item.media_type?.startsWith("video/") ||
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
            {!compact &&
              item.media_type &&
              !/^(text|image|audio|video)\//.test(item.media_type) &&
              item.media_type !== "application/pdf" &&
              !/\.(json|md|csv|txt|py|ipynb)$/i.test(item.filename) && (
                <p className="basis-full text-xs text-muted-foreground">
                  Pratinjau format ini belum tersedia. Unduh untuk membukanya.
                </p>
              )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Unduh ${item.filename}`}
              disabled={pending !== null}
              onClick={() => void download(item)}
            >
              <Download className="size-4" />{" "}
              <span className={compact ? "sr-only" : undefined}>
                {pending === item.artifact_id ? "Mengunduh…" : "Unduh"}
              </span>
            </Button>
            {onRemove && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`${item.filename} ×`}
                onClick={() => onRemove(item)}
              >
                ×
              </Button>
            )}
          </li>
        ))}
      </ul>
      {preview && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPreview(null);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl">
            <DialogTitle className="break-all pr-6">{preview.name}</DialogTitle>
            <DialogDescription>
              Pratinjau file. Unduh untuk menyimpan versi lengkap.
            </DialogDescription>
            {preview.url ? (
              preview.media?.startsWith("image/") ? (
                <img
                  src={preview.url}
                  alt={preview.name}
                  className="max-h-96 max-w-full object-contain"
                />
              ) : preview.media?.startsWith("audio/") ? (
                <audio
                  className="w-full"
                  src={preview.url}
                  controls
                  preload="metadata"
                  aria-label={preview.name}
                >
                  <track kind="captions" />
                </audio>
              ) : preview.media?.startsWith("video/") ? (
                <video
                  src={preview.url}
                  controls
                  preload="metadata"
                  className="max-h-96 w-full"
                  aria-label={preview.name}
                >
                  <track kind="captions" />
                </video>
              ) : (
                <PdfPreview key={preview.url} url={preview.url} name={preview.name} />
              )
            ) : preview.media === "text/markdown" ? (
              <div className="min-w-0 overflow-auto">
                <Streamdown mode="static">{preview.text ?? ""}</Streamdown>
              </div>
            ) : (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-3 text-xs">
                {preview.text}
              </pre>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              Tutup pratinjau
            </Button>
          </DialogContent>
        </Dialog>
      )}
      {pending && (
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          <LoaderCircle className="size-3 animate-spin motion-reduce:animate-none" />
          Menyiapkan file…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive-foreground">
          {error}
        </p>
      )}
    </section>
  );
}
