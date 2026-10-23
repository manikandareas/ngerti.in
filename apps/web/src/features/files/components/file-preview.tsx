import { useAuth } from "@clerk/tanstack-react-start";
import { Download, Eye } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useResourceContext } from "@/features/library/components/resource-context";
import { downloadFile, fileContent } from "../api";
import { staticHtml } from "../static-html";
import type { ResultFile } from "../types";
import { fileSize } from "../types";
import { TextPreview } from "./text-preview";

export function FilePreview({ file, inline = false }: { file: ResultFile; inline?: boolean }) {
  const context = useResourceContext();
  const scroll = useRef<HTMLElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [source, setSource] = useState(false);
  const { getToken, userId } = useAuth();
  const positionKey = `file-position:${userId}:${file.revision_id}:${source}`;
  const [body, setBody] = useState("");
  const [image, setImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const html = useMemo(
    () => (file.content_type === "text/html" ? staticHtml(body) : ""),
    [body, file.content_type],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the same revision after a failed fetch.
  useEffect(() => {
    if (!inline) return;
    const controller = new AbortController();
    let objectUrl = "";
    setBody("");
    setImage("");
    setError("");
    setLoading(true);
    void (async () => {
      try {
        const blob = await fileContent(file.revision_id, await getToken(), controller.signal);
        if (controller.signal.aborted) return;
        if (file.content_type.startsWith("image/")) {
          objectUrl = URL.createObjectURL(blob);
          setImage(objectUrl);
        } else if (file.content_type !== "application/pdf") {
          const text = await blob.text();
          if (!controller.signal.aborted) setBody(text);
        }
      } catch (reason) {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : "Preview gagal.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [inline, file.revision_id, file.content_type, getToken, attempt]);

  async function download() {
    setDownloading(true);
    setError("");
    try {
      await downloadFile(file.revision_id, file.filename, await getToken());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Download gagal.");
    } finally {
      setDownloading(false);
    }
  }
  useEffect(() => {
    if (loading) return;
    try {
      if (scroll.current)
        scroll.current.scrollTop = Number(sessionStorage.getItem(positionKey) ?? 0);
    } catch {
      /* Optional reading position. */
    }
  }, [loading, positionKey]);
  const textual = file.content_type.startsWith("text/") || file.content_type === "application/json";
  return (
    <section className="min-w-0 space-y-3" aria-label={`File ${file.filename}`}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-sm font-semibold wrap-anywhere">{file.filename}</h3>
        {!inline ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              context.open({ kind: "file", id: file.file_id, revision_id: file.revision_id })
            }
          >
            <Eye /> Buka file
          </Button>
        ) : null}
        {inline && textual ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={source}
            onClick={() => setSource(!source)}
          >
            {source ? "Lihat konten" : "Lihat sumber"}
          </Button>
        ) : null}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={downloading}
          onClick={() => void download()}
        >
          <Download /> Unduh
        </Button>
      </div>
      {inline ? (
        <>
          <section
            ref={scroll}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must scroll the document independently.
            tabIndex={0}
            aria-label={`Isi ${file.filename}`}
            className="max-h-[65svh] min-h-32 overflow-auto rounded-xl border bg-card p-4 outline-offset-2"
            onScroll={(event) => {
              try {
                sessionStorage.setItem(positionKey, String(event.currentTarget.scrollTop));
              } catch {
                /* Optional reading position. */
              }
            }}
          >
            {loading ? (
              <p role="status">Membuka file…</p>
            ) : error ? (
              <div role="alert" className="space-y-2">
                <p className="text-danger">{error}</p>
                <Button variant="outline" onClick={() => setAttempt(attempt + 1)}>
                  Coba lagi
                </Button>
              </div>
            ) : image ? (
              <img src={image} alt={`Isi ${file.filename}`} className="h-auto max-w-full" />
            ) : source ? (
              <TextPreview body={body} type="text/plain" />
            ) : file.content_type === "text/html" ? (
              <iframe
                title={`Preview ${file.filename}`}
                sandbox=""
                referrerPolicy="no-referrer"
                className="h-[60svh] w-full rounded-lg bg-white"
                srcDoc={html}
              />
            ) : textual ? (
              <TextPreview body={body} type={file.content_type} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {file.content_type === "application/pdf"
                  ? "Unduh PDF untuk membuka dokumen asli di pembaca PDF pilihanmu."
                  : "Format ini belum mendukung preview. Unduh file untuk membukanya dengan aplikasi yang sesuai."}
              </p>
            )}
          </section>
          {file.content_type === "text/html" ? (
            <p className="text-xs text-muted-foreground">
              HTML terisolasi; script dan jaringan eksternal dinonaktifkan.
            </p>
          ) : null}
        </>
      ) : null}
      {error && !inline ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer py-2">Detail file</summary>
        <p className="wrap-anywhere">
          {fileSize(file.size)} · {file.content_type} · SHA-256 {file.sha256}
        </p>
      </details>
    </section>
  );
}
