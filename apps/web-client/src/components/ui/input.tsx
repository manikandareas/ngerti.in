import { cn } from "cn";
import type * as React from "react";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-control-md w-full min-w-0 rounded-control border border-input bg-card px-2.5 py-1 text-base transition-colors duration-(--duration-fast) outline-none file:inline-flex file:h-6 file:border-0 file:bg-card file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-input-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 md:text-(length:--text-control-label)/5 dark:aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
