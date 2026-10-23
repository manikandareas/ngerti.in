import { UserButton } from "@clerk/tanstack-react-start";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import { Mascot } from "@/components/mascot/mascot";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { primaryWorkspaceLinks } from "@/features/workspace/config/navigation";
import type { WorkspaceView } from "@/features/workspace/types";
import { cn } from "@/lib/utils";

interface NavigationProps {
  view: WorkspaceView;
  onNavigate: (view: WorkspaceView) => void;
  onSearch?: () => void;
}

export function DesktopNavigation({
  view,
  onNavigate,
  onSearch,
  header,
}: NavigationProps & { header?: ReactNode }) {
  const navigate = useNavigate();
  const showMascot = view !== "chat";
  return (
    <aside
      className="relative hidden w-[72px] shrink-0 flex-col items-center bg-card px-1 py-3 min-[701px]:flex"
      aria-label="Navigasi utama"
    >
      {(showMascot || header) && (
        <div className="absolute inset-x-0 top-1 flex justify-center">
          {showMascot
            ? (header ?? (
                <button
                  type="button"
                  aria-label="Buka percakapan dengan Gwen"
                  onClick={() => {
                    void navigate({ to: "/" });
                  }}
                  className="rounded-full focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <Mascot className="size-16" />
                </button>
              ))
            : header}
        </div>
      )}
      <nav
        className="flex flex-1 flex-col items-center justify-center gap-1"
        aria-label="Menu utama"
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="order-1 size-11"
              aria-label="Cari pekerjaan dan hasil"
              onClick={onSearch}
            >
              <Search className="size-6" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Cari pekerjaan dan hasil</TooltipContent>
        </Tooltip>
        {primaryWorkspaceLinks.map(({ view: destination, label, icon: Icon }) => (
          <Tooltip key={destination}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={cn(
                  "size-11 rounded-xl",
                  destination === "chat" ? "order-0" : "order-2",
                  view === destination && "bg-muted",
                )}
                aria-label={label}
                aria-current={view === destination ? "page" : undefined}
                onClick={() => onNavigate(destination)}
              >
                <Icon className="size-6" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={10}>
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </nav>
      <div className="flex w-full shrink-0 items-center justify-center">
        <UserButton
          appearance={{
            elements: {
              rootBox: "flex items-center justify-center",
              userButtonTrigger: {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "44px",
                height: "44px",
                padding: 0,
              },
              avatarBox: "size-7",
            },
          }}
        />
      </div>
    </aside>
  );
}

export function MobileNavigation({ view, onNavigate }: NavigationProps) {
  return (
    <nav
      aria-label="Menu utama mobile"
      className="fixed inset-x-0 bottom-0 z-10 flex h-[calc(56px+env(safe-area-inset-bottom))] items-start justify-around border-t bg-background px-2 pb-[env(safe-area-inset-bottom)] min-[701px]:hidden"
    >
      {primaryWorkspaceLinks.map(({ view: destination, label, icon: Icon }) => (
        <Button
          key={destination}
          variant="ghost"
          className={cn(
            "mt-1 h-12 min-w-14 flex-col gap-0.5 px-2 text-[10px] font-normal",
            view === destination && "bg-muted",
          )}
          aria-label={label}
          aria-current={view === destination ? "page" : undefined}
          onClick={() => onNavigate(destination)}
        >
          <Icon className="size-5" />
          {label}
        </Button>
      ))}
    </nav>
  );
}
