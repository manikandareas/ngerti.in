import {
  CalendarClock,
  File,
  FileText,
  ListTodo,
  MessageCircle,
  Search,
  Target,
} from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useRef, useState } from "react";
import { useResourceSearch } from "../hooks/use-library";
import type { ResourceItem, ResourceKind } from "../types";
import { useResourceContext } from "./resource-context";

const icons = {
  thread: MessageCircle,
  task: ListTodo,
  file: File,
  result: FileText,
  goal: Target,
  schedule: CalendarClock,
} satisfies Record<ResourceKind, typeof Search>;
function relativeTime(value?: string) {
  if (!value) return "";
  const seconds = Math.round((Date.parse(value) - Date.now()) / 1000);
  if (!Number.isFinite(seconds)) return "";
  const format = new Intl.RelativeTimeFormat("id", { numeric: "auto", style: "short" });
  const [divisor, unit] =
    Math.abs(seconds) < 60
      ? [1, "second"]
      : Math.abs(seconds) < 3600
        ? [60, "minute"]
        : Math.abs(seconds) < 86400
          ? [3600, "hour"]
          : [86400, "day"];
  return format.format(Math.round(seconds / Number(divisor)), unit as Intl.RelativeTimeFormatUnit);
}

export function SearchDialog({
  open,
  onOpenChange,
  onSelectThread,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectThread: (id: string) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/55" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[16dvh] z-50 flex max-h-[min(520px,72dvh)] w-[min(600px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-3xl bg-background p-3 shadow-2xl outline-none max-sm:top-[8dvh] max-sm:max-h-[84dvh] max-sm:rounded-3xl max-sm:p-3"
        >
          <Dialog.Title className="sr-only">Cari pekerjaan dan percakapan</Dialog.Title>
          <SearchResults close={() => onOpenChange(false)} onSelectThread={onSelectThread} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function SearchResults({
  close,
  onSelectThread,
}: {
  close: () => void;
  onSelectThread: (id: string) => void;
}) {
  const context = useResourceContext();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const results = useRef<HTMLFieldSetElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 200);
    return () => clearTimeout(timer);
  }, [query]);
  const data = useResourceSearch({ query: search, sort: search ? "relevance" : "recent" });
  const items = (data.data?.pages.flatMap((page) => page.items) ?? []).filter(
    (item, index, all) =>
      all.findIndex((other) => other.ref.kind === item.ref.kind && other.ref.id === item.ref.id) ===
      index,
  );
  const loading = query.trim() !== search || data.isPending;
  function choose(item: ResourceItem) {
    close();
    if (item.ref.kind === "thread") onSelectThread(item.ref.id);
    else context.open(item.ref);
  }
  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-border/50 px-3 py-1.5 max-sm:px-2">
        <span className="flex size-9 shrink-0 items-center justify-center text-muted-foreground">
          <Search className="size-[18px]" strokeWidth={1.7} />
        </span>
        <input
          ref={input}
          aria-label="Search"
          placeholder="Search"
          value={query}
          maxLength={300}
          autoComplete="off"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              results.current?.querySelector<HTMLButtonElement>("button")?.focus();
            }
            if (event.key === "Enter" && !loading && items[0]) {
              event.preventDefault();
              choose(items[0]);
            }
          }}
          className="h-9 min-w-0 flex-1 border-0 bg-transparent p-0 text-sm leading-5 text-foreground outline-none! placeholder:text-muted-foreground"
        />
      </div>
      <fieldset
        aria-label="Daftar hasil pencarian"
        className="min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain pt-2"
        ref={results}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
          const buttons = Array.from(
            results.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          if (event.key === "ArrowUp" && index === 0) input.current?.focus();
          else
            buttons[
              Math.min(
                buttons.length - 1,
                Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
              )
            ]?.focus();
        }}
      >
        {loading ? (
          <p role="status" className="px-4 py-8 text-sm text-muted-foreground">
            Mencari…
          </p>
        ) : data.isError ? (
          <div role="alert" className="px-4 py-6 text-sm">
            <p>Pencarian belum dapat dimuat.</p>
            <button type="button" onClick={() => void data.refetch()} className="mt-2 underline">
              Coba lagi
            </button>
          </div>
        ) : !items.length ? (
          <p role="status" className="px-4 py-8 text-sm text-muted-foreground">
            {search
              ? "Tidak ada hasil yang cocok. Coba kata lain."
              : "Belum ada aktivitas tersimpan."}
          </p>
        ) : (
          <ul aria-label="Hasil pencarian" className="space-y-0.5">
            {items.map((item) => {
              const Icon = icons[item.ref.kind];
              return (
                <li key={`${item.ref.kind}:${item.ref.id}`}>
                  <button
                    type="button"
                    onClick={() => choose(item)}
                    className="group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-muted/65 focus-visible:bg-muted/65 focus-visible:outline-none! max-sm:gap-3"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted/60 group-hover:bg-transparent group-focus-visible:bg-transparent">
                      <Icon className="size-5" strokeWidth={1.7} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-normal">
                      {item.title}
                    </span>
                    {item.updated_at && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {relativeTime(item.updated_at)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && data.hasNextPage && (
          <button
            type="button"
            disabled={data.isFetchingNextPage}
            onClick={() => void data.fetchNextPage()}
            className="mt-2 w-full rounded-xl py-3 text-sm text-muted-foreground hover:bg-muted"
          >
            {data.isFetchingNextPage ? "Memuat…" : "Lihat lainnya"}
          </button>
        )}
      </fieldset>
    </>
  );
}
