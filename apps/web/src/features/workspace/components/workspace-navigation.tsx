import { UserButton } from "@clerk/tanstack-react-start";
import { Menu, Sprout } from "lucide-react";
import { useRef, useState } from "react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { workspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { cn } from "@/lib/utils";

interface NavigationProps {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
}

export function DesktopNavigation({ view, onNavigate }: NavigationProps) {
  return (
    <aside
      className="hidden w-[72px] shrink-0 flex-col items-center border-r bg-card py-5 min-[701px]:flex"
      aria-label="Navigasi utama"
    >
      <span
        className="mb-8 flex size-10 items-center justify-center rounded-xl bg-secondary text-foreground"
        aria-label="Ngertiin"
        role="img"
      >
        <Sprout className="size-6" aria-hidden="true" />
      </span>
      <nav className="flex flex-1 flex-col items-center gap-3" aria-label="Menu utama">
        {workspaceLinks.map(({ view: destination, label, icon: Icon }) => (
          <Tooltip key={destination}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn("size-11 rounded-xl", view === destination && "bg-muted")}
                aria-label={label}
                aria-current={view === destination ? "page" : undefined}
                onClick={() => onNavigate(destination)}
              >
                <Icon className="size-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>
      <UserButton />
    </aside>
  );
}

export function MobileNavigation({ view, onNavigate }: NavigationProps) {
  const [open, setOpen] = useState(false);
  const navigating = useRef(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11 min-[701px]:hidden"
          aria-label="Buka menu utama"
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="left"
        className="w-[min(320px,calc(100%-24px))] gap-0"
        onCloseAutoFocus={(event) => {
          if (!navigating.current) return;
          event.preventDefault();
          (
            document.getElementById("workspace-heading") ?? document.getElementById("main")
          )?.focus();
          navigating.current = false;
        }}
      >
        <SheetHeader className="px-5 pt-8 pb-6">
          <SheetTitle>
            <Brand />
          </SheetTitle>
          <SheetDescription>Mulai dari percakapan, lanjutkan idemu.</SheetDescription>
        </SheetHeader>
        <nav className="flex flex-col gap-2 px-3" aria-label="Menu utama">
          {workspaceLinks.map(({ view: destination, label, icon: Icon }) => (
            <Button
              key={destination}
              type="button"
              variant="ghost"
              className={cn("h-12 justify-start gap-3 px-3", view === destination && "bg-muted")}
              aria-current={view === destination ? "page" : undefined}
              onClick={() => {
                navigating.current = true;
                setOpen(false);
                onNavigate(destination);
              }}
            >
              <Icon className="size-5" />
              {label}
            </Button>
          ))}
        </nav>
        <div className="mt-auto flex items-center gap-3 border-t p-5 text-sm">
          <UserButton /> Akunmu
        </div>
      </SheetContent>
    </Sheet>
  );
}
