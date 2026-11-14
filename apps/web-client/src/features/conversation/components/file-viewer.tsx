import { Download04Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ComponentType, lazy, type ReactNode, Suspense, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readFilePreview } from "@/features/conversation/lib/file-preview";
import {
  FILE_PREVIEW_MAX_BYTES,
  parseTableFile,
  type TextTable,
  tableDelimiter,
} from "@/features/conversation/lib/table-file";
import { downloadFile, scopedFetch } from "@/lib/client-scope";
import type { ViewerFile } from "../lib/content-viewer";
import { fileLanguage, isTextFile } from "../lib/file-format";
import { MarkdownDocument } from "./answer";
import { RichTable } from "./rich-table";

const SourceCodeViewer = lazy(() => import("./source-code-viewer"));

export type FileView = ViewerFile;
type LoadedContent = {
  url: string;
  text?: string;
  image?: string;
  table?: TextTable;
  language?: string;
  markdown?: boolean;
  html?: string;
  pdf?: { bytes: Uint8Array; View: ComponentType<{ bytes: Uint8Array }> };
  truncated?: boolean;
  error?: string;
};
export function FileContent({ file, headerInset = 0 }: { file: FileView; headerInset?: number }) {
  const [content, setContent] = useState<LoadedContent | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the same scoped file read.
  useEffect(() => {
    setContent(null);
    const abort = new AbortController();
    let objectUrl: string | undefined;
    void scopedFetch(file.url, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("File tidak dapat dibuka. Periksa akses folder dan coba lagi.");
        const mediaType = (file.mediaType ?? response.headers.get("content-type") ?? "")
          .split(";")[0]
          .trim()
          .toLowerCase();
        const pdf = mediaType === "application/pdf" || /\.pdf$/i.test(file.name);
        const raster =
          /^(image\/(png|jpeg|webp))$/.test(file.mediaType ?? "") ||
          /\.(png|jpe?g|webp)$/i.test(file.name);
        const text = isTextFile(file.name, mediaType);
        if (abort.signal.aborted) return;
        if (pdf) {
          const preview = await readFilePreview(response, 16 * 1024 * 1024, abort.signal);
          if (preview.truncated)
            throw new Error(
              "PDF melewati batas pratinjau 16 MB. Unduh untuk membaca seluruh dokumen.",
            );
          const { default: View } = await import("./pdf-content");
          if (!abort.signal.aborted)
            setContent({ url: file.url, pdf: { bytes: preview.bytes.slice(), View } });
        } else if (raster) {
          const preview = await readFilePreview(response, 16 * 1024 * 1024, abort.signal);
          if (preview.truncated)
            throw new Error(
              "Image exceeds the 16 MB preview limit. Download it to view the original.",
            );
          const blob = new Blob([preview.bytes], {
            type:
              file.mediaType ?? response.headers.get("content-type") ?? "application/octet-stream",
          });
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setContent({ url: file.url, image: objectUrl });
        } else {
          const delimiter = tableDelimiter(file.name);
          const preview = await readFilePreview(response, FILE_PREVIEW_MAX_BYTES, abort.signal);
          if (
            (delimiter || /\.html?$/i.test(file.name) || file.mediaType === "text/html") &&
            preview.truncated
          )
            throw new Error(
              "File melewati batas pratinjau 128 KB. Unduh file untuk membaca seluruh isi.",
            );
          let value: string;
          try {
            value = new TextDecoder("utf-8", { fatal: true }).decode(preview.bytes, {
              stream: preview.truncated,
            });
            // biome-ignore lint/suspicious/noControlCharactersInRegex: Reject binary controls before previewing an unknown format as text.
            if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))
              throw new Error("Binary content.");
          } catch {
            if (text)
              throw new Error("File bukan teks UTF-8 yang valid. Unduh file untuk membukanya.");
            setContent({
              url: file.url,
              text: "Pratinjau belum tersedia untuk format ini. Unduh file untuk membukanya.",
            });
            return;
          }
          if (abort.signal.aborted) return;
          const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
          if (extension === "html" || extension === "htm" || file.mediaType === "text/html") {
            const { htmlPreview } = await import("../lib/html-preview");
            if (abort.signal.aborted) return;
            setContent({ url: file.url, html: htmlPreview(value, headerInset) });
          } else if (delimiter) {
            try {
              setContent({ url: file.url, table: parseTableFile(value, delimiter) });
            } catch {
              throw new Error(
                "Tabel tidak valid atau terlalu besar untuk ditampilkan. Periksa jumlah kolom dan tanda kutip, atau unduh file.",
              );
            }
          } else
            setContent({
              url: file.url,
              text: value,
              language:
                fileLanguage(file.name) ?? (mediaType === "application/json" ? "json" : "text"),
              markdown: extension === "md",
              truncated: preview.truncated,
            });
        }
      })
      .catch((error) => {
        if (!abort.signal.aborted) setContent({ url: file.url, error: error.message });
      });
    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file, headerInset, attempt]);
  const view = content?.url === file?.url ? content : null;
  function renderBody(): ReactNode {
    if (view?.pdf) {
      const Pdf = view.pdf.View;
      return <Pdf bytes={view.pdf.bytes} />;
    }
    if (view?.html !== undefined)
      return (
        <iframe title={file.name} sandbox="" srcDoc={view.html} className="content-viewer-html" />
      );
    if (view?.error)
      return (
        <div className="space-y-3 p-8 text-center">
          <p role="alert" className="text-[13px] leading-5 text-destructive">
            {view.error}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setContent(null);
              setAttempt((value) => value + 1);
            }}
          >
            Coba buka lagi
          </Button>
        </div>
      );
    if (view?.image)
      return <img src={view.image} alt={file.name} className="max-h-full w-full object-contain" />;
    if (view?.table)
      return (
        <RichTable
          expanded
          name={file.name}
          columns={view.table.headers.map((text, index) => ({ id: `column-${index}`, text }))}
          rows={view.table.rows.map((row) => row.map((text) => ({ text })))}
        />
      );
    if (view?.markdown) return <MarkdownDocument text={view.text ?? ""} />;
    if (view?.language)
      return (
        <Suspense
          fallback={
            <p role="status" className="px-5 py-24 text-sm text-muted-foreground">
              Opening source code…
            </p>
          }
        >
          <SourceCodeViewer
            code={view.text ?? ""}
            language={view.language}
            name={file.name}
            truncated={view.truncated}
          />
        </Suspense>
      );
    if (view?.text !== undefined)
      return (
        <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.045] px-4 py-3 font-mono text-[13px] leading-relaxed">
          {view.text}
        </pre>
      );
    return (
      <div
        role="status"
        className="flex items-center justify-center gap-2 p-12 text-[13px] text-muted-foreground"
      >
        <HugeiconsIcon icon={Loading03Icon} size={16} className="motion-safe:animate-spin" />
        Membuka file…
      </div>
    );
  }
  return (
    <div
      className={`file-content ${view?.html !== undefined ? "file-content-html" : ""} ${view?.pdf ? "file-content-pdf" : ""} ${view?.language && !view.markdown ? "file-content-code" : ""}`}
    >
      {renderBody()}
      {view?.truncated && (view.markdown || !view.language) && (
        <p role="status" className="text-[12px] text-muted-foreground">
          Pratinjau dibatasi 128 KB. Unduh untuk membaca seluruh file.
        </p>
      )}
    </div>
  );
}

export function FileViewer({ file, close }: { file: FileView | null; close: () => void }) {
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent className="flex h-[90svh] flex-col overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{file?.name}</DialogTitle>
          <DialogDescription className="sr-only">File preview</DialogDescription>
        </DialogHeader>
        {file && (
          <div className="min-h-0 flex-1 overflow-auto">
            <FileContent file={file} />
          </div>
        )}
        <Button
          variant="outline"
          className="self-start"
          onClick={() => {
            if (file) void downloadFile(file.url, file.name);
          }}
        >
          <HugeiconsIcon icon={Download04Icon} size={14} />
          Unduh file
        </Button>
      </DialogContent>
    </Dialog>
  );
}
