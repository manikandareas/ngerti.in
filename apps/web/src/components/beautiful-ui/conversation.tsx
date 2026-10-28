// Adapted from Beautiful UI LoadingState, TaskRows, ChatComposer and PromptBar.
// Copyright (c) 2026 Shane Levine. MIT; see LICENSE and README.md in this directory.
import { Check, ChevronDown, Circle, CircleAlert } from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { Button } from "@/components/ui/button";

const cells = Array.from({ length: 9 }, (_, index) => ({
  id: `cell-${index}`,
  delay: ((index % 3) + Math.abs(Math.floor(index / 3) - 1)) * 90,
}));

export function LoadingState({ label }: { label: string }) {
  return (
    <span role="status" className="inline-flex items-center gap-2.5 text-xs text-muted-foreground">
      <span aria-hidden="true" className="grid shrink-0 grid-cols-3 gap-[1.5px]">
        {cells.map((cell) => (
          <span
            key={cell.id}
            className="beautiful-loader-cell size-1 rounded-[1px] bg-current"
            style={{ animationDelay: `${cell.delay}ms` }}
          />
        ))}
      </span>
      {label}
    </span>
  );
}

export function TaskRow({
  title,
  status,
  state,
  children,
}: {
  title: string;
  status: string;
  state: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const done = ["completed", "succeeded"].includes(state);
  const failed = [
    "failed",
    "error",
    "unknown",
    "indeterminate",
    "blocked",
    "schema_invalid",
  ].includes(state);
  const Icon = done ? Check : failed ? CircleAlert : Circle;
  return (
    <div className="min-w-0 rounded-xl border bg-background">
      <Button
        type="button"
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="h-auto min-h-11 w-full justify-start gap-2.5 whitespace-normal px-3 py-2 text-left"
      >
        <Icon
          aria-hidden="true"
          className={`size-4 shrink-0 ${done ? "text-success-foreground" : failed ? "text-warning-foreground" : "text-muted-foreground"}`}
        />
        <span className="min-w-0 flex-1 text-sm wrap-anywhere">
          {title}
          <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{status}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`size-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </Button>
      <div id={id} hidden={!open} className="space-y-3 px-4 pb-4 text-sm wrap-anywhere">
        {children}
      </div>
    </div>
  );
}

export function PromptBar({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-2xl border bg-background p-2 focus-within:border-ring">
      {children}
    </div>
  );
}

export function ChatMessage({
  author,
  user,
  avatar,
  children,
  id,
}: {
  author: string;
  user: boolean;
  avatar?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <article
      id={id}
      aria-label={`Pesan ${author}`}
      className={`flex min-w-0 gap-2.5 scroll-mt-4 ${user ? "justify-end" : ""}`}
    >
      {!user && <div className="mt-1 shrink-0">{avatar}</div>}
      <div
        className={`min-w-0 max-w-[90%] rounded-xl px-4 py-3 sm:max-w-[85%] ${user ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground"}`}
      >
        <h2 className={user ? "sr-only" : "mb-1.5 text-xs font-medium"}>{author}</h2>
        {children}
      </div>
    </article>
  );
}
