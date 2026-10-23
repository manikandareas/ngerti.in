import { type ReactNode, useEffect, useRef } from "react";
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from "@/components/ui/drawer";

export function AssistantSurface({
  mobile,
  onClose,
  children,
  overlay = false,
}: {
  mobile: boolean;
  onClose: () => void;
  children: ReactNode;
  overlay?: boolean;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!mobile) panel.current?.focus();
  }, [mobile]);
  if (mobile)
    return (
      <Drawer
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DrawerContent
          id="assistant-panel"
          className="h-[90dvh] border-0 bg-background data-[vaul-drawer-direction=bottom]:max-h-[90dvh] data-[vaul-drawer-direction=bottom]:rounded-t-[28px]"
        >
          <DrawerTitle className="sr-only">Asisten personalmu</DrawerTitle>
          <DrawerDescription className="sr-only">
            Aktivitas, persetujuan, jadwal, dan identitas asisten.
          </DrawerDescription>
          <div className="min-h-0 flex-1 overflow-hidden pb-[env(safe-area-inset-bottom)]">
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <aside
      ref={panel}
      id="assistant-panel"
      aria-label="Asisten personalmu"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !event.defaultPrevented) {
          event.stopPropagation();
          onClose();
        }
      }}
      className={`${overlay ? "absolute inset-y-0 right-0 z-30 shadow-xl" : "relative"} flex min-h-0 w-[360px] max-w-[calc(100vw-56px)] shrink-0 flex-col bg-background outline-none`}
    >
      {children}
    </aside>
  );
}
