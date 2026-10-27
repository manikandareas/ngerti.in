import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/** Render authenticated PDF bytes without depending on a browser PDF extension. */
export function PdfPreview({ url, name }: { url: string; name: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    let stopped = false;
    let destroy: (() => void) | undefined;
    void (async () => {
      try {
        const [library, worker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
        ]);
        if (stopped) return;
        library.GlobalWorkerOptions.workerSrc = worker.default;
        const loading = library.getDocument({ url });
        destroy = () => {
          void loading.destroy();
        };
        const document = await loading.promise;
        if (!stopped) setPdf(document);
      } catch {
        if (!stopped) {
          setError("PDF belum dapat ditampilkan. File tetap dapat diunduh.");
          setBusy(false);
        }
      }
    })();
    return () => {
      stopped = true;
      destroy?.();
    };
  }, [url]);

  useEffect(() => {
    if (!pdf) return;
    let stopped = false;
    let rendering: RenderTask | undefined;
    setBusy(true);
    setError("");
    void (async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (stopped || !canvas.current) return;
        const viewport = page.getViewport({ scale: 1.3 });
        canvas.current.width = Math.ceil(viewport.width);
        canvas.current.height = Math.ceil(viewport.height);
        rendering = page.render({ canvas: canvas.current, viewport });
        await rendering.promise;
        const content = await page.getTextContent();
        if (!stopped)
          setText(content.items.flatMap((item) => ("str" in item ? [item.str] : [])).join(" "));
      } catch {
        if (!stopped)
          setError("Halaman belum dapat ditampilkan. Coba halaman lain atau unduh PDF.");
      } finally {
        if (!stopped) setBusy(false);
      }
    })();
    return () => {
      stopped = true;
      rendering?.cancel();
    };
  }, [pdf, pageNumber]);

  return (
    <div className="space-y-3" aria-busy={busy}>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-muted-foreground">
          Menampilkan halaman…
        </p>
      )}
      <div className="max-h-[60vh] overflow-auto rounded border bg-white">
        <canvas
          ref={canvas}
          role="img"
          aria-label={`${name}, halaman ${pageNumber}`}
          className="mx-auto h-auto max-w-full"
        />
      </div>
      <p className="sr-only">{text}</p>
      {pdf && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pageNumber <= 1}
            onClick={() => setPageNumber((page) => page - 1)}
          >
            Sebelumnya
          </Button>
          <span>
            Halaman {pageNumber} dari {pdf.numPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={busy || pageNumber >= pdf.numPages}
            onClick={() => setPageNumber((page) => page + 1)}
          >
            Berikutnya
          </Button>
        </div>
      )}
    </div>
  );
}
