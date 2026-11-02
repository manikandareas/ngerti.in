import { Check, Copy, Download, MoreHorizontal, WrapText, X } from "lucide-react";
import { Fragment, type ReactNode, useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { highlightSnippet } from "@/features/conversation/lib/code-highlight";
import {
  countLines,
  downloadSnippetFile,
  formatLineCount,
  getLanguageDisplayName,
  getSnippetFileName,
} from "@/features/conversation/lib/code-snippet";
import { useContentCopy } from "@/features/conversation/lib/rich-content-actions";
import { cn } from "@/lib/utils";

const plateButton =
  "inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-menu-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60";

// Simple-mode CodeBlock/CodePlate from OpenMausBot 0.1.137. No model-authored HTML is inserted.
export function AnswerCode({
  code,
  lang,
  initialWrap = false,
}: {
  code: string;
  lang: string;
  initialWrap?: boolean;
}) {
  const [highlighted, setHighlighted] = useState<{
    code: string;
    lang: string;
    lines: ReactNode[][];
  } | null>(null);
  const [wrap, setWrap] = useState(initialWrap);
  const [menu, setMenu] = useState(false);
  const { state: copied, copy } = useContentCopy(code);
  useEffect(() => {
    setWrap(initialWrap);
  }, [initialWrap]);
  useEffect(() => {
    let alive = true;
    void highlightSnippet(code, lang)
      .then((lines) => {
        if (alive && lines) setHighlighted({ code, lang, lines });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [code, lang]);
  const lines = highlighted?.code === code && highlighted.lang === lang ? highlighted.lines : null;
  const copyLabel =
    copied === "copied"
      ? "Kode disalin"
      : copied === "failed"
        ? "Gagal menyalin kode"
        : "Salin kode";
  return (
    <div
      dir="ltr"
      data-code-block
      className="chat-code-block group/code relative my-2.5 min-w-0 overflow-hidden rounded-lg bg-foreground/[0.04]"
    >
      <div
        data-code-plate
        className={cn(
          "absolute end-1 top-1 z-10 flex gap-0.5 rounded-full bg-composer p-0.5 opacity-0 ring-[0.5px] ring-foreground/10 transition-opacity focus-within:opacity-100 group-hover/code:opacity-100 touch:opacity-100",
          menu && "opacity-100",
        )}
      >
        <button
          type="button"
          onClick={() => void copy()}
          className={plateButton}
          title={copyLabel}
          aria-label={copyLabel}
        >
          {copied === "failed" ? (
            <X size={14} className="text-destructive" aria-hidden="true" />
          ) : copied === "copied" ? (
            <Check size={14} className="text-(--success-foreground)" aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
        </button>
        {copied !== "idle" && (
          <span role={copied === "failed" ? "alert" : "status"} className="sr-only">
            {copyLabel}
          </span>
        )}
        <DropdownMenu open={menu} onOpenChange={setMenu}>
          <DropdownMenuTrigger asChild>
            <button type="button" className={plateButton} aria-label="Opsi kode" title="Opsi kode">
              <MoreHorizontal size={14} aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuCheckboxItem checked={wrap} onCheckedChange={setWrap}>
              <WrapText size={14} aria-hidden="true" />
              Bungkus baris
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={() => downloadSnippetFile(getSnippetFileName(lang), code)}>
              <Download size={14} aria-hidden="true" />
              Simpan sebagai file
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>
              {getLanguageDisplayName(lang)} · {formatLineCount(countLines(code))}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <pre
        data-code-body
        className={cn(
          "m-0 bg-transparent px-3 py-2 font-mono text-[13px] leading-5 text-muted-foreground",
          wrap
            ? "overflow-x-hidden whitespace-pre-wrap break-words"
            : "overflow-x-auto whitespace-pre",
        )}
      >
        <code className="[font:inherit]">
          {lines
            ? lines.map((line, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Line positions are stable while code streams.
                <Fragment key={`line-${index}`}>
                  {line}
                  {index < lines.length - 1 ? "\n" : ""}
                </Fragment>
              ))
            : code}
        </code>
      </pre>
    </div>
  );
}
