import { type PDFDocumentProxy, type RenderTask, TextLayer } from "pdfjs-dist";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

function PageCanvas({
  document,
  number,
  width,
  ratio,
}: {
  document: PDFDocumentProxy;
  number: number;
  width: number;
  ratio: (value: number) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const text = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [attempt, retry] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries this page without reopening the document.
  useEffect(() => {
    const surface = canvas.current;
    const container = text.current;
    if (!surface || !container) return;
    let cancelled = false;
    let render: RenderTask | undefined;
    let layer: TextLayer | undefined;
    setState("loading");
    void document
      .getPage(number)
      .then(async (page) => {
        if (cancelled) return;
        const original = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: width / original.width });
        ratio(original.width / original.height);
        const output = Math.min(
          window.devicePixelRatio || 1,
          2,
          Math.sqrt(4_000_000 / (viewport.width * viewport.height)),
        );
        surface.width = Math.max(1, Math.floor(viewport.width * output));
        surface.height = Math.max(1, Math.floor(viewport.height * output));
        container.style.setProperty("--total-scale-factor", String(viewport.scale));
        render = page.render({
          canvas: surface,
          viewport,
          transform: [output, 0, 0, output, 0, 0],
        });
        layer = new TextLayer({ container, viewport, textContentSource: page.streamTextContent() });
        await Promise.all([render.promise, layer.render()]);
        if (!cancelled) setState("ready");
      })
      .catch(() => {
        if (!cancelled) setState("failed");
      });
    return () => {
      cancelled = true;
      render?.cancel();
      layer?.cancel();
      container.replaceChildren();
      surface.width = 0;
      surface.height = 0;
    };
  }, [document, number, width, ratio, attempt]);
  return (
    <>
      <canvas
        ref={canvas}
        role="img"
        aria-label={`Halaman ${number}`}
        data-pdf-rendered={state === "ready"}
      />
      <div ref={text} className="pdf-text-layer" />
      {state !== "ready" && (
        <div className="pdf-page-status">
          {state === "failed" ? (
            <div role="alert">
              <p>Halaman ini belum dapat ditampilkan.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => retry((value) => value + 1)}
              >
                Ulangi halaman
              </Button>
            </div>
          ) : (
            <span role="status">Memuat halaman {number}…</span>
          )}
        </div>
      )}
    </>
  );
}

export function PdfPage({
  document,
  number,
  width,
  aspect,
}: {
  document: PDFDocumentProxy;
  number: number;
  width: number;
  aspect: number;
}) {
  const element = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  const [ratio, setRatio] = useState(aspect);
  useEffect(() => {
    const page = element.current;
    if (!page) return;
    const observer = new IntersectionObserver(
      ([entry]) => setNear(entry?.isIntersecting ?? false),
      { root: page.closest(".content-viewer-page"), rootMargin: "600px 0px" },
    );
    observer.observe(page);
    return () => observer.disconnect();
  }, []);
  return (
    <figure
      ref={element}
      className="pdf-page"
      aria-label={`Halaman ${number}`}
      data-pdf-page={number}
      style={{ width, aspectRatio: ratio, "--total-scale-factor": 1 } as CSSProperties}
    >
      {near && (
        <PageCanvas
          key={width}
          document={document}
          number={number}
          width={width}
          ratio={setRatio}
        />
      )}
    </figure>
  );
}
