import { useEffect, useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useResourceContext } from "./resource-context";
import { ResourceDetailPanel, ResourcePanelHeader } from "./resource-detail";
export function ResourceSurface({ mobile }: { mobile: boolean }) {
  const context = useResourceContext();
  const region = useRef<HTMLElement>(null);
  const previous = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!context.opened) return;
    previous.current = document.activeElement as HTMLElement;
    region.current?.focus();
    return () => {
      previous.current?.isConnected && previous.current.focus();
    };
  }, [context.opened]);
  if (!context.opened) return null;
  if (mobile)
    return (
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) context.open(null);
        }}
      >
        <SheetContent className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-none">
          <SheetHeader className="border-b pr-12">
            <SheetTitle>Detail pilihan</SheetTitle>
            <SheetDescription>Buka hasil atau bicarakan kembali dengan Gwen.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            <ResourceDetailPanel key={JSON.stringify(context.opened)} refValue={context.opened} />
          </div>
        </SheetContent>
      </Sheet>
    );
  return (
    <aside
      ref={region}
      tabIndex={-1}
      className="flex min-h-0 w-[min(520px,45vw)] shrink-0 flex-col border-l bg-background outline-none"
      aria-label="Detail pilihan"
      onKeyDown={(e) => {
        if (e.key === "Escape") context.open(null);
      }}
    >
      <ResourcePanelHeader />
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <ResourceDetailPanel key={JSON.stringify(context.opened)} refValue={context.opened} />
      </div>
    </aside>
  );
}
