import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { createContext, type ReactNode, useContext } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// OpenMausBot 7124ebc4: bot-panel/rows.tsx. Keep contextual pages on one row/card recipe.
export const panelRow = "flex min-h-[46px] items-center gap-2.5 px-3.5 py-[11px]";

export function PanelCard({
  label,
  action,
  children,
  className,
}: {
  label?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {label && (
        <div className="mx-1 mb-2 mt-5 flex min-h-5 items-center justify-between gap-3 text-[13px] text-muted-foreground">
          <h3 className="min-w-0 font-normal">{label}</h3>
          {action}
        </div>
      )}
      <div className="divide-y divide-foreground/[0.05] overflow-hidden rounded-[12px] bg-composer ring-1 ring-inset ring-foreground/[0.06] max-md:rounded-[20px] max-md:border max-md:border-border max-md:bg-card max-md:ring-0">
        {children}
      </div>
    </section>
  );
}

export function PanelNavRow({
  title,
  hint,
  value,
  icon: Icon,
  onClick,
  children,
  ...props
}: {
  title: string;
  hint?: ReactNode;
  value?: ReactNode;
  icon?: IconSvgElement;
  onClick: () => void;
  children?: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <button
      type="button"
      data-panel-nav={title}
      {...props}
      onClick={onClick}
      className={cn(
        panelRow,
        "w-full text-left hover:bg-foreground/[0.03] focus-visible:-outline-offset-2",
      )}
    >
      {children ??
        (Icon && (
          <span
            className="grid size-7 shrink-0 place-items-center rounded-lg bg-foreground/[0.05] text-muted-foreground max-md:size-8 max-md:rounded-full"
            aria-hidden="true"
          >
            <HugeiconsIcon icon={Icon} size={15} strokeWidth={1.5} />
          </span>
        ))}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium text-foreground">{title}</span>
        {hint && (
          <span className="mt-px block text-[13px] leading-[1.35] text-muted-foreground">
            {hint}
          </span>
        )}
      </span>
      {value != null && value !== "" && (
        <span className="max-w-[42%] shrink-0 truncate text-[13px] text-muted-foreground">
          {value}
        </span>
      )}
      <HugeiconsIcon
        icon={ArrowRight01Icon}
        size={15}
        strokeWidth={1.5}
        className="shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  );
}

export const PanelHeaderSlot = createContext<HTMLDivElement | null>(null);

export function PanelPageHeader({
  title,
  back = "Details",
  onBack,
  intro,
  action,
  focusBack,
}: {
  title: ReactNode;
  back?: string;
  onBack: () => void;
  intro?: ReactNode;
  action?: ReactNode;
  focusBack?: boolean;
}) {
  const slot = useContext(PanelHeaderSlot);
  return (
    <>
      {slot &&
        createPortal(
          <>
            <Button
              type="button"
              autoFocus={focusBack}
              size="icon"
              variant="secondary"
              onClick={onBack}
              data-panel-back=""
              aria-label={`Back to ${back}`}
              className="size-8 shrink-0 rounded-lg text-muted-foreground max-md:size-10 max-md:rounded-full max-md:border max-md:border-border max-md:bg-card"
            >
              <HugeiconsIcon
                icon={ArrowLeft01Icon}
                size={17}
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Button>
            <h3 className="min-w-0 flex-1 truncate text-[18px] font-medium text-foreground">
              {title}
            </h3>
            {action}
          </>,
          slot,
        )}
      {intro && (
        <p className="mx-1 mb-4 text-[13px] leading-normal text-muted-foreground">{intro}</p>
      )}
    </>
  );
}

export function PanelEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="px-3.5 py-7 text-center text-[13px] leading-[18px] text-muted-foreground">
      {children}
    </p>
  );
}
