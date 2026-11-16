import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  InformationCircleIcon,
  Loading03Icon,
  MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import "./sonner.css";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      closeButton
      expand
      duration={5000}
      icons={{
        success: (
          <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={1.75} className="size-4" />
        ),
        info: <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={1.75} className="size-4" />,
        warning: <HugeiconsIcon icon={Alert02Icon} strokeWidth={1.75} className="size-4" />,
        error: (
          <HugeiconsIcon
            icon={MultiplicationSignCircleIcon}
            strokeWidth={1.75}
            className="size-4"
          />
        ),
        loading: (
          <HugeiconsIcon icon={Loading03Icon} strokeWidth={1.75} className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          fontFamily: "var(--font-sans)",
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius-menu)",
          "--success-bg": "var(--success)",
          "--success-text": "var(--success-foreground)",
          "--success-border": "var(--success-foreground)",
          "--error-bg": "var(--danger-soft)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--destructive)",
          "--warning-bg": "var(--warning)",
          "--warning-text": "var(--warning-foreground)",
          "--warning-border": "var(--warning-foreground)",
          "--info-bg": "color-mix(in srgb, var(--link) 8%, var(--popover))",
          "--info-text": "var(--link)",
          "--info-border": "color-mix(in srgb, var(--link) 24%, var(--border))",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
