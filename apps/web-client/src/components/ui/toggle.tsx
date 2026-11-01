import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Toggle as TogglePrimitive } from "radix-ui";
import type * as React from "react";

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-1 rounded-control text-(length:--text-control-label)/5 font-medium whitespace-nowrap transition-colors duration-(--duration-fast) outline-none hover:bg-menu-hover hover:text-foreground focus-visible:border-input-focus focus-visible:ring-1 focus-visible:ring-input-focus/20 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-secondary aria-pressed:text-secondary-foreground data-[state=on]:bg-secondary data-[state=on]:text-secondary-foreground dark:aria-invalid:ring-destructive/20 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline: "border border-input bg-control hover:bg-control-hover",
      },
      size: {
        default:
          "h-control-md min-w-control-md px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        sm: "h-control-sm min-w-control-sm rounded-control px-2.5 text-(length:--text-control-label)/5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-control-lg min-w-control-lg px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Toggle, toggleVariants };
