import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const descriptions = {
  Memory:
    "Memory keeps useful details your agent learns from your conversations, such as your preferences and ongoing context. To add, update, or remove a memory, tell your agent what to remember, change, or forget.",
  Goals:
    "Goals are outcomes your agent tracks from your conversations. Progress updates appear here as work moves forward. Tell your agent to add a goal, change its direction, pause it, or mark it complete.",
  Routine:
    "Routines are scheduled tasks or recurring checks your agent runs for you. Ask your agent to create a routine, change its schedule, pause it, or stop it.",
};

export function PanelHelp({ topic }: { topic: keyof typeof descriptions }) {
  const [open, setOpen] = useState(false);
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`About ${topic}`}
          onClick={() => setOpen(true)}
          className="grid size-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          <HugeiconsIcon icon={InformationCircleIcon} size={15} strokeWidth={1.5} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        align="end"
        sideOffset={6}
        className="max-w-[min(18rem,calc(100vw-2rem))] text-[12px] leading-relaxed"
      >
        {descriptions[topic]}
      </TooltipContent>
    </Tooltip>
  );
}
