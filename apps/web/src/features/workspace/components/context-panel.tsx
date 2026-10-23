import { ArrowLeft, Maximize2, Minimize2, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** One mounted surface across split, maximized, collapsed and mobile states. */
export function ContextPanel({
  title,
  children,
  onClose,
  mobile,
  id,
  overlay = false,
  initialWidth = 480,
  discussing = false,
  discussionRequest = 0,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  mobile: boolean;
  id?: string;
  overlay?: boolean;
  initialWidth?: number;
  discussing?: boolean;
  discussionRequest?: number;
}) {
  const [width, setWidth] = useState(initialWidth);
  const [maximized, setMaximized] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: every discuss request must reveal chat, including from a maximized viewer.
  useEffect(() => {
    if (discussing) {
      setMaximized(false);
      setCollapsed(false);
    }
  }, [discussing, discussionRequest]);
  const region = useRef<HTMLElement>(null);
  const origin = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!(maximized || (mobile && !discussing))) return;
    const siblings = Array.from(region.current?.parentElement?.children ?? []).filter(
      (node): node is HTMLElement => node instanceof HTMLElement && node !== region.current,
    );
    const previous = siblings.map((node) => node.inert);
    for (const node of siblings) node.inert = true;
    return () =>
      siblings.forEach((node, index) => {
        node.inert = previous[index];
      });
  }, [mobile, maximized, discussing]);
  useEffect(() => {
    origin.current = document.activeElement as HTMLElement;
    region.current?.focus();
    return () => {
      if (
        origin.current?.isConnected &&
        origin.current !== document.body &&
        !origin.current.closest("[inert]")
      )
        origin.current.focus();
      else document.querySelector<HTMLTextAreaElement>("#main textarea")?.focus();
    };
  }, []);
  const expanded = mobile || !collapsed;
  return (
    <aside
      id={id}
      ref={region}
      tabIndex={-1}
      aria-label={title}
      style={
        mobile && discussing
          ? { height: "45dvh", bottom: "auto" }
          : mobile || maximized
            ? undefined
            : { width: collapsed ? 52 : `min(${width}px, 52vw)` }
      }
      className={cn(
        "relative flex min-h-0 shrink-0 flex-col border-l bg-background outline-none",
        (mobile || maximized) && "absolute inset-0 z-20",
        overlay && !mobile && !maximized && "absolute inset-y-0 right-0 z-20",
      )}
      onKeyDown={(event) => {
        if (event.key === "Tab" && (maximized || (mobile && !discussing))) {
          const controls = Array.from(
            region.current?.querySelectorAll<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
            ) ?? [],
          ).filter((node) => node.getClientRects().length > 0 && !node.closest("[inert]"));
          const first = controls[0];
          const last = controls.at(-1);
          if (
            event.shiftKey &&
            (document.activeElement === first || document.activeElement === region.current)
          ) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }

        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {!mobile && !maximized && !collapsed ? (
        // biome-ignore lint/a11y/useSemanticElements: interactive window splitter, not a thematic break.
        <div
          role="separator"
          tabIndex={0}
          aria-label={`Ubah lebar ${title}`}
          aria-orientation="vertical"
          aria-valuemin={320}
          aria-valuemax={900}
          aria-valuenow={width}
          className="absolute inset-y-0 -left-1 z-10 w-2 cursor-col-resize touch-none hover:bg-primary/20 focus-visible:bg-primary/20 focus-visible:outline-none"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) {
              const right = region.current?.getBoundingClientRect().right ?? window.innerWidth;
              setWidth(Math.max(320, Math.min(900, right - event.clientX)));
            }
          }}
          onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            setWidth((value) =>
              event.key === "Home"
                ? 320
                : event.key === "End"
                  ? 900
                  : Math.max(320, Math.min(900, value + (event.key === "ArrowLeft" ? 32 : -32))),
            );
          }}
        />
      ) : null}
      <div
        className={cn(
          "flex min-h-14 shrink-0 items-center gap-1 border-b px-2",
          !expanded && "flex-col py-2",
        )}
      >
        {mobile ? (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={overlay ? "Kembali ke panel sebelumnya" : "Kembali ke percakapan"}
          >
            <ArrowLeft />
          </Button>
        ) : null}
        {expanded ? (
          <h2 className="min-w-0 flex-1 truncate px-2 text-sm font-semibold">{title}</h2>
        ) : null}
        {!mobile ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              aria-label={collapsed ? "Buka panel" : "Ciutkan panel"}
              onClick={() => {
                setCollapsed(!collapsed);
                setMaximized(false);
              }}
            >
              {collapsed ? <PanelRightOpen /> : <PanelRightClose />}
            </Button>
            {!collapsed ? (
              <Button
                variant="ghost"
                size="icon"
                aria-label={maximized ? "Tampilkan berdampingan" : "Perbesar panel"}
                onClick={() => setMaximized(!maximized)}
              >
                {maximized ? <Minimize2 /> : <Maximize2 />}
              </Button>
            ) : null}
            <Button variant="ghost" size="icon" aria-label={`Tutup ${title}`} onClick={onClose}>
              <X />
            </Button>
          </>
        ) : null}
      </div>
      <div className={cn("flex min-h-0 flex-1 flex-col", !expanded && "hidden")} inert={!expanded}>
        {children}
      </div>
    </aside>
  );
}
