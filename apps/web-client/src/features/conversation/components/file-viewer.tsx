import { Download04Icon, File02Icon, Loading03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
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
import { MarkdownDocument } from "./answer";
import { AnswerCode } from "./answer-code";
import { RichTable } from "./rich-table";
import "./file-viewer.css";

export type FileView = { name: string; url: string; mediaType?: string };
type FileContent = {
  url: string;
  text?: string;
  image?: string;
  table?: TextTable;
  language?: string;
  markdown?: boolean;
  truncated?: boolean;
  error?: string;
};
const codeLanguages: Record<string, string> = {
  json: "json",
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  py: "python",
  html: "html",
  css: "css",
  yaml: "yaml",
  yml: "yaml",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  sql: "sql",
  sh: "bash",
  xml: "xml",
  toml: "toml",
};
export function FileViewer({ file, close }: { file: FileView | null; close: () => void }) {
  const [content, setContent] = useState<FileContent | null>(null);
  const [attempt, setAttempt] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt explicitly retries the same scoped file read.
  useEffect(() => {
    if (!file) return;
    setContent(null);
    const abort = new AbortController();
    let objectUrl: string | undefined;
    void fetch(file.url, { signal: abort.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error("File tidak dapat dibuka. Periksa akses folder dan coba lagi.");
        const raster =
          /^(image\/(png|jpeg|webp))$/.test(file.mediaType ?? "") ||
          /\.(png|jpe?g|webp)$/i.test(file.name);
        const text =
          file.mediaType?.startsWith("text/") ||
          /\.(txt|md|json|csv|tsv|log|ts|tsx|js|py|html|css|yaml|yml)$/i.test(file.name);
        if (abort.signal.aborted) return;
        if (raster) {
          const blob = await response.blob();
          if (abort.signal.aborted) return;
          objectUrl = URL.createObjectURL(blob);
          setContent({ url: file.url, image: objectUrl });
        } else if (text) {
          const delimiter = tableDelimiter(file.name);
          const preview = await readFilePreview(response, FILE_PREVIEW_MAX_BYTES, abort.signal);
          if (delimiter && preview.truncated)
            throw new Error(
              "Tabel melewati batas pratinjau 128 KB. Unduh file untuk membaca seluruh tabel.",
            );
          let value: string;
          try {
            value = new TextDecoder("utf-8", { fatal: !!delimiter }).decode(preview.bytes);
          } catch {
            throw new Error("Tabel bukan teks UTF-8 yang valid. Unduh file untuk membukanya.");
          }
          if (abort.signal.aborted) return;
          const extension = file.name.split(".").at(-1)?.toLowerCase() ?? "";
          if (delimiter) {
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
              language: codeLanguages[extension],
              markdown: extension === "md",
              truncated: preview.truncated,
            });
        } else {
          void response.body?.cancel().catch(() => {});
          setContent({
            url: file.url,
            text: "Pratinjau belum tersedia untuk format ini. Unduh file untuk membukanya.",
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
  }, [file, attempt]);
  const view = content?.url === file?.url ? content : null;
  return (
    <Dialog
      open={!!file}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <DialogContent
        overlayClassName="file-preview-overlay"
        className={`flex flex-col overflow-hidden rounded-2xl ${view?.table ? "max-h-[94dvh] w-[min(96vw,1400px)] gap-0 border border-border bg-panel p-0 shadow-2xl ring-0 sm:max-w-none" : "max-h-[90svh] gap-3 p-4 sm:max-w-3xl"}`}
      >
        <DialogHeader
          className={view?.table ? "shrink-0 border-b border-border/40 px-4 py-3" : undefined}
        >
          <DialogTitle
            className={`flex items-start gap-2 pr-7 font-medium ${view?.table ? "text-[14px]" : "text-[15px]"}`}
          >
            <HugeiconsIcon
              icon={File02Icon}
              size={17}
              strokeWidth={1.5}
              className="mt-0.5 shrink-0"
            />
            <span className="break-all">{file?.name}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">
            File dari folder percakapan yang dipilih.
          </DialogDescription>
        </DialogHeader>
        <div className={`min-h-0 min-w-0 flex-1 overflow-auto ${view?.table ? "p-3 sm:p-5" : ""}`}>
          {view?.error ? (
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
          ) : view?.image ? (
            <img
              src={view.image}
              alt={file?.name ?? "File"}
              className="max-h-[65svh] w-full object-contain"
            />
          ) : view?.table ? (
            <RichTable
              expanded
              name={file?.name}
              columns={view.table.headers.map((text, index) => ({ id: `column-${index}`, text }))}
              rows={view.table.rows.map((row) => row.map((text) => ({ text })))}
            />
          ) : view?.markdown ? (
            <MarkdownDocument text={view.text ?? ""} />
          ) : view?.language ? (
            <AnswerCode code={view.text ?? ""} lang={view.language} />
          ) : view?.text !== undefined ? (
            <pre className="max-h-[60svh] overflow-auto whitespace-pre-wrap break-words rounded-xl bg-foreground/[0.045] px-4 py-3 font-mono text-[13px] leading-relaxed">
              {view.text}
            </pre>
          ) : (
            <div
              role="status"
              className="flex items-center justify-center gap-2 p-12 text-[13px] text-muted-foreground"
            >
              <HugeiconsIcon icon={Loading03Icon} size={16} className="motion-safe:animate-spin" />
              Membuka file…
            </div>
          )}
        </div>
        {view?.truncated && (
          <p role="status" className="text-[12px] text-muted-foreground">
            Pratinjau dibatasi 128 KB. Unduh untuk membaca seluruh file.
          </p>
        )}
        <Button
          asChild
          variant="outline"
          className={`shrink-0 self-start ${view?.table ? "mx-4 mb-4" : ""}`}
        >
          <a href={file?.url} download={file?.name}>
            <HugeiconsIcon icon={Download04Icon} size={14} strokeWidth={1.5} />
            Unduh file
          </a>
        </Button>
      </DialogContent>
    </Dialog>
  );
}
