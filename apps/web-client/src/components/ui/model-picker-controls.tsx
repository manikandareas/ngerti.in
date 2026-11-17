import { Brain, ImageIcon } from "lucide-react";
import { Fragment, type KeyboardEvent, useId, useRef } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ModelCapability, ThinkingEffort } from "./model-picker-types";

const CAPABILITY = {
  reasoning: { label: "Reasoning", icon: Brain, accent: "text-violet-600 dark:text-violet-400" },
  image: { label: "Image input", icon: ImageIcon, accent: "text-teal-600 dark:text-teal-400" },
};

export const THINKING_LABEL: Record<ThinkingEffort, string> = {
  none: "Off",
  minimal: "Min",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-high",
  max: "Max",
};

export function CapabilityChips({ capabilities }: { capabilities?: readonly ModelCapability[] }) {
  if (!capabilities?.length) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1.5 ring-1 ring-border/70 ring-inset">
      {capabilities.map((capability, index) => {
        const { label, icon: Icon, accent } = CAPABILITY[capability];
        return (
          <Fragment key={capability}>
            {index > 0 && <span aria-hidden="true" className="h-3 w-px shrink-0 bg-border/70" />}
            <Tooltip>
              <TooltipTrigger asChild>
                <span className={cn("inline-flex size-4 items-center justify-center", accent)}>
                  <Icon aria-hidden="true" className="size-3.5" strokeWidth={2} />
                  <span className="sr-only">{label}</span>
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">{label}</TooltipContent>
            </Tooltip>
          </Fragment>
        );
      })}
    </span>
  );
}

export function EffortMeter({
  levels,
  value,
}: {
  levels: readonly ThinkingEffort[];
  value?: ThinkingEffort;
}) {
  const filled = value && value !== "none" ? levels.indexOf(value) + 1 : 0;
  return (
    <span aria-hidden="true" className="flex items-end gap-0.5">
      {levels.map((effort, index) => (
        <span
          key={effort}
          style={{ height: `${5 + index * 2.5}px` }}
          className={cn(
            "w-0.75 rounded-full transition-colors motion-reduce:transition-none",
            index < filled ? "bg-foreground" : "bg-border",
          )}
        />
      ))}
    </span>
  );
}

export function ThinkingTrack({
  levels,
  value,
  onChange,
}: {
  levels: readonly ThinkingEffort[];
  value?: ThinkingEffort;
  onChange: (effort: ThinkingEffort) => void;
}) {
  const name = useId();
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const activeIndex = Math.max(0, levels.indexOf(value ?? levels[0]));
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    let next = activeIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown")
      next = (activeIndex + 1) % levels.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = (activeIndex - 1 + levels.length) % levels.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = levels.length - 1;
    else return;
    event.preventDefault();
    onChange(levels[next]);
    refs.current[next]?.focus();
  }
  return (
    <fieldset
      aria-label="Thinking effort"
      className="relative flex min-w-0 flex-1 items-center rounded-full bg-muted/60 p-1 ring-1 ring-border/60 ring-inset"
    >
      {value !== undefined && (
        <span
          aria-hidden="true"
          style={{
            width: `calc((100% - 0.5rem) / ${levels.length})`,
            transform: `translateX(${activeIndex * 100}%)`,
          }}
          className="pointer-events-none absolute inset-y-1 left-1 rounded-full bg-popover ring-1 ring-border/70 ring-inset transition-transform duration-150 ease-out motion-reduce:transition-none"
        />
      )}
      {levels.map((effort, index) => (
        <label
          key={effort}
          className="relative z-10 min-w-0 flex-1 cursor-pointer touch-manipulation rounded-full text-center"
        >
          <input
            type="radio"
            name={name}
            value={effort}
            checked={effort === value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            onChange={() => onChange(effort)}
            onKeyDown={onKeyDown}
            className="peer sr-only"
          />
          <span className="block rounded-full px-1 py-2 text-[13px] leading-none font-medium whitespace-nowrap text-muted-foreground transition-colors peer-checked:text-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring motion-reduce:transition-none touch:py-3.5">
            {THINKING_LABEL[effort] ?? effort}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
