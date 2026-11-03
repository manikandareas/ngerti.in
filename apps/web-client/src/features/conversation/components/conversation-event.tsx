import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

export function ConversationEvent({
  kind,
  icon,
  label,
  name,
  description,
  onClick,
  accessibleName,
}: {
  kind: "goal" | "routine" | "handoff";
  icon: ReactNode;
  label: string;
  name: ReactNode;
  description?: string | null;
  onClick?: () => void;
  accessibleName?: string;
}) {
  const content = (
    <>
      <span data-conversation-event-label-group className="inline-flex items-center gap-2">
        <span
          data-conversation-event-icon
          className="inline-flex size-4 shrink-0 items-center justify-center"
          aria-hidden="true"
        >
          {icon}
        </span>
        <span data-conversation-event-label>{label}</span>
      </span>
      <span
        data-conversation-event-name
        className="inline-flex min-w-0 max-w-full items-center justify-center font-medium text-(--conversation-event-foreground) [overflow-wrap:anywhere]"
      >
        {name}
      </span>
      {onClick && (
        <HugeiconsIcon
          icon={ArrowUpRight01Icon}
          size={14}
          strokeWidth={1.5}
          className="shrink-0"
          aria-hidden="true"
        />
      )}
    </>
  );
  const className =
    "mx-auto flex min-h-7 w-full min-w-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 py-[5px] text-center text-[12px] leading-[18px] text-(--conversation-event-muted)";
  return (
    <div data-conversation-event={kind} className="w-full min-w-0">
      {onClick ? (
        <button
          type="button"
          data-conversation-event-row
          aria-label={accessibleName}
          onClick={onClick}
          className={`${className} cursor-pointer rounded-sm outline-none transition-colors hover:text-(--conversation-event-foreground) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:min-h-11`}
        >
          {content}
        </button>
      ) : (
        <div data-conversation-event-row className={className}>
          {content}
        </div>
      )}
      {description && (
        <p className="mx-auto max-w-[min(100%,40rem)] px-6 text-center text-[12px] leading-[18px] text-(--conversation-event-muted) [overflow-wrap:anywhere]">
          {description}
        </p>
      )}
    </div>
  );
}
