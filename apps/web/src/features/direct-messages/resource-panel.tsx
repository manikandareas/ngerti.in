import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

/** Contextual resources share the same keyboard and mobile drawer behavior. */
export function ResourcePanel({
  title,
  description,
  children,
  open,
  onOpenChange,
  icon,
}: {
  title: string;
  description: string;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  icon?: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="sm">
          {icon}
          {title}
        </Button>
      </SheetTrigger>
      <SheetContent
        overlayClassName="lg:hidden"
        data-context-editor="true"
        className="gap-4 border-0 p-4 data-[side=right]:w-full data-[side=right]:sm:max-w-[360px]"
      >
        <SheetHeader className="px-0 pr-10">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
        </SheetHeader>
        <div className="min-w-0 space-y-4 pb-6">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
