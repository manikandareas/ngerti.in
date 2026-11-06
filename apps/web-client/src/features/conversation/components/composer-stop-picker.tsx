import { StopIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { Run } from "@/types/workspace";

/** Several active agents require an explicit stop target. Typing still restores Send. */
export function ComposerStopPicker({
  enabled,
  runs,
  label,
  busy,
  stop,
  children,
}: {
  enabled: boolean;
  runs: Run[];
  label: (run: Run) => string;
  busy: boolean;
  stop: (run: Run) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (!enabled) return children;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="end"
        side="top"
        aria-label="Pilih agent untuk dihentikan"
        className="w-64 gap-1 p-2"
      >
        <p className="px-2 py-1 text-[12px] text-muted-foreground">Hentikan aktivitas siapa?</p>
        {runs.map((run) => (
          <Button
            key={run.id}
            type="button"
            variant="ghost"
            className="justify-start"
            disabled={busy || run.status === "cancel_requested"}
            onClick={() => {
              setOpen(false);
              stop(run);
            }}
          >
            <HugeiconsIcon icon={StopIcon} size={11} className="fill-current" />
            {label(run)}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
