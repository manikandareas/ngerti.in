import { ArrowUp, LoaderCircle, Square } from "lucide-react";
import { type Ref, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker } from "@/features/files/components/attachment-picker";
import { OutputFields } from "@/features/files/components/output-fields";
import type { AttachmentsState } from "@/features/files/hooks/use-attachments";
import type { OutputSpec } from "@/features/files/types";
import { cn } from "@/lib/utils";

type ComposerProps = {
  draft: string;
  empty: boolean;
  sending: boolean;
  active: boolean;
  blocked: boolean;
  offline: boolean;
  inputRef: Ref<HTMLTextAreaElement>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  attachments: AttachmentsState;
  outputs: OutputSpec[];
  onOutputs: (value: OutputSpec[]) => void;
};

export function ChatComposer({
  draft,
  empty,
  sending,
  active,
  blocked,
  offline,
  inputRef,
  onDraftChange,
  onSend,
  onStop,
  attachments,
  outputs,
  onOutputs,
}: ComposerProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const canSend =
    Boolean(draft.trim()) &&
    !active &&
    !sending &&
    !blocked &&
    !offline &&
    attachments.progress === null;

  useLayoutEffect(() => {
    const form = formRef.current;
    const measure = measureRef.current;
    if (!form || !measure) return;
    const update = () => {
      // Reserve both 44px controls, padding, and a little breathing room.
      setExpanded(draft.includes("\n") || measure.scrollWidth + 8 > form.clientWidth - 112);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(form);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [draft]);

  return (
    <div className="relative">
      <div className="max-h-[30svh] space-y-2 overflow-y-auto [&:has(>div>div:nth-child(n+2))]:mb-3">
        <AttachmentPicker compact state={attachments} disabled={sending || active || offline} />
        {attachments.items.length ? (
          <OutputFields value={outputs} onChange={onOutputs} disabled={sending || active} />
        ) : null}
        {attachments.items.some(({ file }) =>
          ["text/csv", "application/json"].includes(file.content_type),
        ) ? (
          <p className="px-3 text-xs text-muted-foreground">
            Hasil pengolahan file akan tersimpan dan bisa dibuka kembali.
          </p>
        ) : null}
      </div>
      <form
        ref={formRef}
        className={cn(
          "relative min-h-[62px] border border-border/60 bg-card shadow-[0_4px_20px_-6px_color-mix(in_oklab,var(--foreground)_12%,transparent)] transition-[border-color,box-shadow,border-radius] duration-200 focus-within:border-ring/70 focus-within:ring-2 focus-within:ring-ring/15 motion-reduce:transition-none",
          expanded ? "rounded-3xl px-4 pt-2 pb-16" : "rounded-[31px] py-2 pr-14 pl-14",
        )}
        onSubmit={(event) => {
          event.preventDefault();
          if (canSend) {
            onSend();
          }
        }}
      >
        <span
          ref={measureRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 max-w-full overflow-hidden whitespace-pre text-base leading-6"
        >
          {draft}
        </span>
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          aria-label="Pesan untuk Gwen"
          placeholder={empty ? "Apa yang ingin kamu kerjakan?" : "Balas Gwen atau tanya sesuatu…"}
          maxLength={12000}
          rows={1}
          className="max-h-[180px] min-h-11 min-w-0 flex-1 resize-none rounded-none border-0 bg-transparent px-0 py-2.5 text-base leading-6 shadow-none focus-visible:ring-0 min-[701px]:text-base dark:bg-transparent"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              window.matchMedia("(min-width: 701px)").matches
            ) {
              event.preventDefault();
              if (canSend) {
                onSend();
              }
            }
          }}
        />
        <div className="absolute right-2 bottom-2 flex items-center">
          {active ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="size-11 rounded-full"
              onClick={() => onStop()}
              aria-label="Hentikan respons"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              variant="ghost"
              className="size-11 rounded-full border-0 bg-primary text-primary-foreground shadow-none hover:bg-primary/90 hover:text-primary-foreground active:not-aria-[haspopup]:translate-y-0 transition-[color,background-color,transform] duration-150 active:scale-95 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 motion-reduce:transition-none"
              disabled={!canSend}
              aria-label="Kirim pesan"
            >
              {sending ? (
                <LoaderCircle className="animate-spin motion-reduce:animate-none" />
              ) : (
                <ArrowUp />
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
