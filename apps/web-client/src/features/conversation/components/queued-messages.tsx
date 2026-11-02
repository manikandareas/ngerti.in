import { ArrowTurnForwardIcon, Delete02Icon, PencilEdit01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { repairMessage } from "@/lib/api-errors";
import type { Message, Run } from "@/types/workspace";

export interface QueuedMessage {
  message: Message;
  run: Run;
  target?: Run;
}

// OpenMausBot 7124ebc4 ComposerQueuedMessages.tsx. Ngertiin keeps the durable
// admitted message/run and revision; this tray changes only where they appear.
export function QueuedMessages({
  items,
  busy,
  edit,
  remove,
  steer,
  settings,
}: {
  items: QueuedMessage[];
  busy: boolean;
  edit: (message: Message) => void;
  remove: (message: Message) => void;
  steer: (item: QueuedMessage) => void;
  settings: () => void;
}) {
  if (!items.length) return null;
  const diagnostic = items.find((item) => item.run.diagnostic)?.run.diagnostic;
  return (
    <section
      className="composer-queue relative z-[1] mx-3 -mb-3 max-h-36 overflow-y-auto rounded-t-2xl border border-b-0 border-border/40 bg-secondary/95 pb-3 shadow-sm backdrop-blur-sm"
      aria-label={`${items.length} pesan menunggu`}
      aria-live="polite"
    >
      {diagnostic && (
        <p className="px-3 pt-2 text-[12px] leading-[18px] text-muted-foreground">
          {repairMessage(diagnostic.code)}{" "}
          <button
            type="button"
            onClick={settings}
            className="text-link underline underline-offset-2"
          >
            Periksa pengaturan
          </button>
        </p>
      )}
      <ul className="divide-y divide-border/25" aria-label="Antrean pesan">
        {items.map((item, index) => (
          <li
            key={item.message.id}
            id={`message-${item.message.id}`}
            data-slot="message"
            data-queued-message
            className="flex min-h-10 min-w-0 items-center gap-2 px-2.5 py-1.5"
          >
            <HugeiconsIcon
              icon={ArrowTurnForwardIcon}
              size={14}
              strokeWidth={1.8}
              className="shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span
              dir="auto"
              className="min-w-0 flex-1 truncate text-[14px] text-foreground"
              title={item.message.text}
            >
              {item.message.text}
            </span>
            {index === 0 && item.target && (
              <button
                type="button"
                onClick={() => steer(item)}
                disabled={busy}
                aria-label="Arahkan sekarang"
                title="Arahkan pesan berikutnya ke pekerjaan yang sedang berjalan"
                className="flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[13px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-wait disabled:opacity-60"
              >
                <HugeiconsIcon icon={ArrowTurnForwardIcon} size={13} strokeWidth={2} />
                Arahkan
              </button>
            )}
            <button
              type="button"
              onClick={() => edit(item.message)}
              disabled={busy}
              aria-label="Edit"
              title="Edit pesan menunggu"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              <HugeiconsIcon icon={PencilEdit01Icon} size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => remove(item.message)}
              disabled={busy}
              aria-label="Hapus"
              title="Hapus pesan menunggu"
              className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              <HugeiconsIcon icon={Delete02Icon} size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
