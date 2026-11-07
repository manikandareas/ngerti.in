import { ArrowExpand01Icon, ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PdfPage } from "./pdf-page";
import "./pdf-content.css";

GlobalWorkerOptions.workerSrc = workerUrl;
type DocumentView = { document: PDFDocumentProxy; aspect: number };

function pdfErrorMessage(failure: unknown): string {
  if (failure instanceof Error && failure.name === "PasswordException")
    return "PDF ini dilindungi kata sandi. Unduh file untuk membukanya.";
  if (failure instanceof Error && failure.message === "PAGE_LIMIT")
    return "PDF melewati batas pratinjau 500 halaman. Unduh untuk membaca seluruh dokumen.";
  return "PDF tidak dapat dibaca. Coba lagi atau unduh file aslinya.";
}

function readingTop(surface: HTMLElement) {
  const toolbar = surface.querySelector<HTMLElement>(".pdf-toolbar");
  return toolbar
    ? toolbar.getBoundingClientRect().height +
        (Number.parseFloat(getComputedStyle(toolbar).top) || 0)
    : 0;
}

export default function PdfContent({ bytes }: { bytes: Uint8Array }) {
  const root = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<DocumentView | null>(null);
  const [error, setError] = useState("");
  const [attempt, retry] = useState(0);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [current, setCurrent] = useState(1);
  const [page, setPage] = useState("1");
  const anchor = useRef<{ number: number; offset: number } | null>(null);
  const pageWidth = Math.max(100, Math.min(1000, width - 32)) * zoom;
  useLayoutEffect(() => {
    if (pageWidth <= 0 || !anchor.current || !root.current) return;
    const scroll =
      root.current.closest<HTMLElement>(".content-viewer-page") ??
      root.current.parentElement?.parentElement;
    const target = root.current.querySelector<HTMLElement>(
      `[data-pdf-page="${anchor.current.number}"]`,
    );
    if (scroll && target) {
      const bounds = target.getBoundingClientRect();
      scroll.scrollTop +=
        bounds.top +
        anchor.current.offset * bounds.height -
        scroll.getBoundingClientRect().top -
        readingTop(root.current);
    }
    anchor.current = null;
  }, [pageWidth]);
  function changeZoom(value: number) {
    if (value === zoom) return;
    const surface = root.current;
    const scroll =
      surface?.closest<HTMLElement>(".content-viewer-page") ??
      surface?.parentElement?.parentElement;
    const target = surface?.querySelector<HTMLElement>(`[data-pdf-page="${current}"]`);
    if (surface && scroll && target) {
      const bounds = target.getBoundingClientRect();
      anchor.current = {
        number: current,
        offset:
          (scroll.getBoundingClientRect().top + readingTop(surface) - bounds.top) / bounds.height,
      };
    }
    setZoom(value);
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt retries parsing the already bounded bytes.
  useEffect(() => {
    let active = true;
    setView(null);
    setError("");
    const base = new URL(`${import.meta.env.BASE_URL}pdfjs/`, window.location.href);
    const task = getDocument({
      data: bytes.slice(),
      enableXfa: false,
      cMapUrl: new URL("cmaps/", base).href,
      cMapPacked: true,
      standardFontDataUrl: new URL("standard_fonts/", base).href,
      wasmUrl: new URL("wasm/", base).href,
    });
    void task.promise
      .then(async (document) => {
        if (document.numPages > 500) throw new Error("PAGE_LIMIT");
        const first = await document.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (active) setView({ document, aspect: viewport.width / viewport.height });
      })
      .catch((failure: unknown) => {
        if (!active) return;
        setError(pdfErrorMessage(failure));
        void task.destroy().catch(() => {});
      });
    return () => {
      active = false;
      void task.destroy().catch(() => {});
    };
  }, [bytes, attempt]);
  useEffect(() => {
    if (!root.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(root.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setPage(String(current));
  }, [current]);
  useEffect(() => {
    if (!view || !root.current || width <= 0) return;
    const surface = root.current;
    const scroll = surface.closest<HTMLElement>(".content-viewer-page");
    const visible = new Map<number, number>();
    let observer: IntersectionObserver;
    const observe = () => {
      observer?.disconnect();
      visible.clear();
      const bottom = scroll ? Number.parseFloat(getComputedStyle(scroll).paddingBottom) || 0 : 0;
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const number = Number((entry.target as HTMLElement).dataset.pdfPage);
            if (entry.isIntersecting) visible.set(number, entry.intersectionRect.height);
            else visible.delete(number);
          }
          let largest = 0;
          let page = 0;
          for (const [number, height] of visible)
            if (height > largest) {
              largest = height;
              page = number;
            }
          if (page) setCurrent(page);
        },
        {
          root: scroll,
          rootMargin: `-${readingTop(surface)}px 0px -${bottom}px 0px`,
          threshold: Array.from({ length: 21 }, (_, index) => index / 20),
        },
      );
      for (const element of surface.querySelectorAll("[data-pdf-page]")) observer.observe(element);
    };
    observe();
    const resize = new ResizeObserver(observe);
    if (scroll) resize.observe(scroll);
    return () => {
      observer.disconnect();
      resize.disconnect();
    };
  }, [view, width]);
  const count = view?.document.numPages ?? 0;
  const numbers = Array.from({ length: count }, (_, index) => index + 1);
  function go(number: number) {
    const next = Math.max(1, Math.min(count, Math.trunc(number) || 1));
    root.current
      ?.querySelector(`[data-pdf-page="${next}"]`)
      ?.scrollIntoView({ block: "start", behavior: "instant" });
    setCurrent(next);
    setPage(String(next));
  }
  return (
    <div ref={root} className="pdf-content" data-pdf-viewer>
      {error ? (
        <div className="pdf-document-status">
          <p role="alert">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => retry((value) => value + 1)}
          >
            Coba buka lagi
          </Button>
        </div>
      ) : !view ? (
        <div className="pdf-document-status" role="status">
          Membuka PDF…
        </div>
      ) : (
        <>
          <div className="pdf-toolbar" role="toolbar" aria-label="Kontrol PDF">
            <div className="pdf-controls">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={current <= 1}
                aria-label="Halaman sebelumnya"
                onClick={() => go(current - 1)}
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={15} />
              </Button>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  go(Number(page));
                }}
              >
                <input
                  type="number"
                  aria-label="Halaman PDF"
                  min={1}
                  max={count}
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                  onBlur={() => go(Number(page))}
                />
                <span> / {count}</span>
              </form>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={current >= count}
                aria-label="Halaman berikutnya"
                onClick={() => go(current + 1)}
              >
                <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
              </Button>
            </div>
            <div className="pdf-controls">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={zoom <= 0.5}
                aria-label="Perkecil PDF"
                onClick={() => changeZoom(Math.max(0.5, zoom - 0.25))}
              >
                −
              </Button>
              <output className="pdf-zoom" aria-label="Zoom PDF">
                {Math.round(zoom * 100)}%
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={zoom >= 2}
                aria-label="Perbesar PDF"
                onClick={() => changeZoom(Math.min(2, zoom + 0.25))}
              >
                +
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Sesuaikan lebar"
                onClick={() => changeZoom(1)}
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} size={15} />
              </Button>
            </div>
          </div>
          <div className="pdf-pages" style={{ minWidth: pageWidth + 32 }}>
            {width > 0 &&
              numbers.map((number) => (
                <PdfPage
                  key={number}
                  document={view.document}
                  number={number}
                  width={pageWidth}
                  aspect={view.aspect}
                />
              ))}
          </div>
        </>
      )}
    </div>
  );
}
