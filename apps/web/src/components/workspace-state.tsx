import { CircleDashed, Compass, RefreshCw, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface WorkspaceStateProps {
  kind: "loading" | "error" | "empty" | "unavailable";
  title: string;
  description?: string;
  onRetry?: () => void;
  children?: ReactNode;
}

export function WorkspaceState({
  kind,
  title,
  description,
  onRetry,
  children,
}: WorkspaceStateProps) {
  const Icon = kind === "error" ? TriangleAlert : kind === "unavailable" ? Compass : CircleDashed;
  return (
    <div
      className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-6 py-12 text-center"
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading"}
    >
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <h2 className="text-base">{title}</h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {kind === "loading" ? (
        <div className="w-full max-w-xs space-y-3 motion-safe:animate-pulse" aria-hidden="true">
          <div className="h-3 rounded bg-muted" />
          <div className="mx-auto h-3 w-2/3 rounded bg-muted" />
        </div>
      ) : null}
      {onRetry ? (
        <Button type="button" variant="outline" onClick={onRetry}>
          <RefreshCw /> Coba lagi
        </Button>
      ) : null}
      {children}
    </div>
  );
}
