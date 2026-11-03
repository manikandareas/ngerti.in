import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";

export function ConversationEvent({
  kind,
  icon,
  label,
  name,
  status,
  description,
  onClick,
  accessibleName,
}: {
  kind: "goal" | "routine" | "handoff";
  icon: ReactNode;
  label: string;
  name: string;
  status?: string;
  description?: string | null;
  onClick?: () => void;
  accessibleName?: string;
}) {
  const content = (
    <>
      {icon}
      <span className="flex min-w-0 flex-wrap items-baseline justify-center gap-x-2 gap-y-0.5">
        <span>{label}</span>
        <span className="font-medium text-(--conversation-event-foreground) [overflow-wrap:anywhere]">
          {name}
        </span>
        {status && <span>· {status}</span>}
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
    "mx-auto flex min-h-7 w-full min-w-0 items-center justify-center gap-2 py-[5px] text-center text-[12px] leading-[18px] text-(--conversation-event-muted)";
  return (
    <div data-conversation-event={kind} className="w-full min-w-0">
      {onClick ? (
        <button
          type="button"
          aria-label={accessibleName}
          onClick={onClick}
          className={`${className} cursor-pointer rounded-sm outline-none transition-colors hover:text-(--conversation-event-foreground) focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:min-h-11`}
        >
          {content}
        </button>
      ) : (
        <div className={className}>{content}</div>
      )}
      {description && (
        <p className="mx-auto max-w-[min(100%,40rem)] px-6 text-center text-[12px] leading-[18px] text-(--conversation-event-muted) [overflow-wrap:anywhere]">
          {description}
        </p>
      )}
    </div>
  );
}
