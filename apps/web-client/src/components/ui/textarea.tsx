import { cn } from "cn";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-32 w-full rounded-control border border-input bg-card px-2.5 py-2 text-base transition-colors duration-(--duration-fast) outline-none placeholder:text-muted-foreground focus-visible:border-input-focus disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-(length:--text-control-label)/5 dark:aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
