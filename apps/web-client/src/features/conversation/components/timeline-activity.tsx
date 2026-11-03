import { Clock01Icon, Target02Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ConversationPart } from "@/types/workspace";
import { routineName } from "../lib/routine-name";
import { ConversationEvent } from "./conversation-event";
import { InlineReferenceChip, InlineReferenceText } from "./inline-references";

const labels: Record<ConversationPart["kind"], string> = {
  message: "",
  goal_created: "Goal dibuat",
  goal_completed: "Goal selesai",
  goal_blocked: "Goal membutuhkan perhatian",
  goal_resumed: "Goal dilanjutkan",
  routine_resumed: "Routine dilanjutkan",
  goal_paused: "Goal dijeda",
  goal_stopped: "Goal dihentikan",
  routine_created: "Routine dibuat",
  routine_paused: "Routine dijeda",
  routine_stopped: "Routine dihentikan",
  handoff_requested: "Meminta bantuan",
  handoff_failed: "Pekerjaan membutuhkan perhatian",
};
function Milestone({
  part,
  open,
}: {
  part: ConversationPart;
  open: (tab: "goals" | "routine", id: string) => void;
}) {
  const kind = part.kind.startsWith("goal_")
    ? "goal"
    : part.kind.startsWith("routine_")
      ? "routine"
      : "handoff";
  const label =
    part.kind === "handoff_requested" && part.name === "review"
      ? "Meminta tinjauan"
      : labels[part.kind];
  return (
    <div
      id={part.message_id ? `message-${part.message_id}` : `part-${part.id}`}
      data-timeline-part={part.id}
      data-part-sequence={part.sequence}
      data-collaboration-activity={kind === "handoff" ? "" : undefined}
    >
      <ConversationEvent
        kind={kind}
        icon={
          <HugeiconsIcon
            icon={kind === "goal" ? Target02Icon : kind === "routine" ? Clock01Icon : UserGroupIcon}
            size={15}
            strokeWidth={1.5}
            aria-hidden="true"
          />
        }
        label={label}
        name={
          kind === "handoff" ? (
            <span className="inline-flex max-w-full flex-wrap items-center justify-center gap-1.5">
              {part.actors.map((actor, index) => (
                <span key={actor.id} className="inline-flex min-w-0 items-center gap-1.5">
                  {index > 0 && <span aria-hidden="true">→</span>}
                  <InlineReferenceChip
                    actor={actor}
                    reference={{ kind: "agent", id: actor.id, label: `@${actor.name}` }}
                  />
                </span>
              ))}
            </span>
          ) : (
            <InlineReferenceText
              text={
                kind === "routine" ? routineName({ name: null, instruction: part.name }) : part.name
              }
            />
          )
        }
        description={part.summary}
        accessibleName={`${label}: ${part.name}`}
        onClick={
          kind !== "handoff" && part.resource_id
            ? () => open(kind === "goal" ? "goals" : "routine", part.resource_id as string)
            : undefined
        }
      />
    </div>
  );
}
export function TimelineActivity({
  parts,
  open,
}: {
  parts: ConversationPart[];
  open: (tab: "goals" | "routine", id: string) => void;
}) {
  if (parts[0].kind.startsWith("routine_"))
    return (
      <div className="space-y-1">
        {parts.map((part) => (
          <Milestone key={part.id} part={part} open={open} />
        ))}
      </div>
    );
  if (parts.length === 1) return <Milestone part={parts[0]} open={open} />;
  return (
    <details
      className="group/milestones w-full min-w-0 text-[12px] leading-[18px] text-(--conversation-event-muted)"
      data-activity-batch
    >
      <summary className="mx-auto flex min-h-8 w-fit max-w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-[5px] text-center outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:min-h-11">
        {parts.length} {labels[parts[0].kind]}
        <span className="text-[10px] group-open/milestones:rotate-180" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="space-y-1 pt-1">
        {parts.map((part) => (
          <Milestone key={part.id} part={part} open={open} />
        ))}
      </div>
    </details>
  );
}
