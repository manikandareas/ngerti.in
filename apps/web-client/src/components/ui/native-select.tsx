import { UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "cn";
import type * as React from "react";

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default";
};

function NativeSelect({ className, size = "default", ...props }: NativeSelectProps) {
  return (
    <div
      className={cn(
        "group/native-select relative w-fit has-[select:disabled]:text-disabled-foreground",
        className,
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        data-slot="native-select"
        data-size={size}
        className="h-control-md w-full min-w-0 appearance-none rounded-control border border-input bg-card py-1 pr-8 pl-2.5 text-base transition-colors duration-(--duration-fast) outline-none select-none selection:bg-primary selection:text-primary-foreground placeholder:text-muted-foreground focus-visible:border-input-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled-foreground md:text-(length:--text-control-label)/5 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 data-[size=sm]:h-7 data-[size=sm]:rounded-control data-[size=sm]:py-0.5 dark:aria-invalid:ring-destructive/20"
        {...props}
      />
      <HugeiconsIcon
        icon={UnfoldMoreIcon}
        strokeWidth={1.75}
        className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  );
}

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return (
    <option
      data-slot="native-select-option"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

function NativeSelectOptGroup({ className, ...props }: React.ComponentProps<"optgroup">) {
  return (
    <optgroup
      data-slot="native-select-optgroup"
      className={cn("bg-[Canvas] text-[CanvasText]", className)}
      {...props}
    />
  );
}

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption };
