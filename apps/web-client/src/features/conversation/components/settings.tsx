import { SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Agent, Connection } from "@/types/workspace";
import { ModelPicker } from "./model-picker";

type AgentModelRowProps = {
  agent: Agent;
  connections: Connection[];
  refresh: () => Promise<unknown>;
  report: (error: string) => void;
  manageProviders: () => void;
};

// OpenMausBot DetailsTab: a compact Model row reuses the shared account/model menu.
export function AgentModelRow(props: AgentModelRowProps) {
  return (
    <div className="px-3.5 py-0.5">
      <ModelPicker
        {...props}
        contained
        label={
          <span className="flex min-w-0 flex-1 items-center gap-2.5">
            <span
              className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground max-md:size-8 max-md:rounded-full"
              aria-hidden="true"
            >
              <HugeiconsIcon icon={SparklesIcon} size={15} strokeWidth={1.5} />
            </span>
            <span className="text-[14px] font-medium text-foreground">Model</span>
          </span>
        }
      />
    </div>
  );
}
