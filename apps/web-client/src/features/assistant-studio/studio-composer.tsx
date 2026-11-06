import { ArrowUp02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { ComposerInput } from "@/features/conversation/components/composer-input";
import {
  ComposerRequestContext,
  useComposerRequests,
} from "@/features/conversation/lib/composer-requests";

/** The same composer binding as the workspace, with local preview callbacks only. */
export function StudioComposer({
  children,
  initialText = "",
}: {
  children: ReactNode;
  initialText?: string;
}) {
  const replies = useComposerRequests("studio");
  const [text, setText] = useState(initialText);
  const [multiline, setMultiline] = useState(false);
  const reply = replies.active;
  const tooLong = reply?.maxLength !== undefined && text.length > reply.maxLength;
  async function send() {
    if (!reply || reply.busy || reply.locked || !text.trim() || tooLong) return;
    if (await reply.submit(text)) setText("");
  }
  return (
    <ComposerRequestContext.Provider value={replies.registry}>
      {children}
      {reply && (reply.error || reply.check || tooLong) && (
        <p role="status" className="mt-4 text-[12px] text-muted-foreground">
          {reply.error}
          {tooLong && `Jawaban dibatasi ${reply.maxLength} karakter.`}
          {reply.check && (
            <button
              type="button"
              className="ms-2 text-link underline"
              disabled={reply.busy}
              onClick={() => void reply.check?.()}
            >
              Periksa status
            </button>
          )}
        </p>
      )}
      {reply && (
        <form
          className="conversation-composer mt-6 flex items-end gap-2 p-2"
          data-multiline={multiline || undefined}
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <ComposerInput
            ref={null}
            label="Pesan"
            value={reply.restoreText ?? text}
            placeholder={`Pesan untuk ${reply.author}…`}
            readOnly={reply.busy || reply.locked}
            lookup={() => undefined}
            retry={() => {}}
            onChange={setText}
            onEnter={() => void send()}
            onFiles={() => {}}
            onMultiline={setMultiline}
            report={() => {}}
            suggestions={false}
          />
          <Button
            type="submit"
            size="icon"
            className="composer-send"
            aria-label="Kirim"
            disabled={reply.busy || reply.locked || !text.trim() || tooLong}
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={16} />
          </Button>
        </form>
      )}
    </ComposerRequestContext.Provider>
  );
}
