import { ArrowUp, LoaderCircle, Square } from "lucide-react";
import type { Ref } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AttachmentPicker } from "@/features/files/components/attachment-picker";
import { OutputFields } from "@/features/files/components/output-fields";
import type { AttachmentsState } from "@/features/files/hooks/use-attachments";
import type { OutputSpec } from "@/features/files/types";

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
  return (
    <div className="space-y-2 rounded-3xl bg-background p-1">
      <div className="max-h-[30svh] space-y-2 overflow-y-auto">
        <AttachmentPicker state={attachments} disabled={sending || active || offline} />
        {attachments.items.length ? (
          <OutputFields value={outputs} onChange={onOutputs} disabled={sending || active} />
        ) : null}
      </div>
      <form
        className="flex items-end gap-2 rounded-[32px] border border-transparent bg-muted px-3 py-2.5 min-[701px]:px-[18px] focus-within:border-ring"
        onSubmit={(event) => {
          event.preventDefault();
          onSend();
        }}
      >
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          aria-label="Pesan untuk Gwen"
          placeholder={empty ? "Apa yang ingin kamu kerjakan?" : "Balas Gwen atau tanya sesuatu…"}
          maxLength={12000}
          className="max-h-[180px] min-w-0 flex-1 resize-none leading-relaxed min-h-10 rounded-none border-0 bg-transparent px-1 py-2 text-base min-[701px]:text-[18px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              window.matchMedia("(min-width: 701px)").matches
            ) {
              event.preventDefault();
              onSend();
            }
          }}
        />
        <div className="flex items-center justify-between gap-3">
          {active ? (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              onClick={() => onStop()}
              aria-label="Hentikan respons"
            >
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="rounded-full"
              disabled={
                !draft.trim() || sending || blocked || offline || attachments.progress !== null
              }
              aria-label="Kirim pesan"
            >
              {sending ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
