import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";
import "./button.css";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-control border border-transparent bg-clip-padding text-(length:--text-control-label)/5 font-medium whitespace-nowrap transition-colors duration-(--duration-fast) outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-100 disabled:bg-disabled-surface disabled:bg-none disabled:text-disabled-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "button-surface bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-pressed",
        outline:
          "button-surface border-border bg-control text-foreground hover:bg-control-hover aria-expanded:bg-control-hover",
        secondary:
          "button-surface bg-secondary text-secondary-foreground hover:bg-control-hover aria-expanded:bg-control-hover",
        ghost:
          "hover:bg-menu-hover hover:text-foreground active:bg-menu-active aria-expanded:bg-menu-active aria-expanded:text-foreground",
        destructive:
          "button-surface [--button-highlight-strength:3%] bg-danger-action text-destructive-foreground hover:bg-danger-action/90 focus-visible:ring-destructive",
        link: "text-link underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-control-md gap-2 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-control px-2 text-xs in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-control-sm gap-1.5 rounded-control px-2.5 text-(length:--text-control-label)/5 in-data-[slot=button-group]:rounded-control has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-control-lg gap-2 px-5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-control-md",
        "icon-xs":
          "size-6 rounded-control in-data-[slot=button-group]:rounded-control [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-control-sm rounded-control in-data-[slot=button-group]:rounded-control",
        "icon-lg": "size-control-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
