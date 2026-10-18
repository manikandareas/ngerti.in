import { UserButton } from "@clerk/tanstack-react-start";
import { Ellipsis, PanelLeftClose, Plus, Search } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import type { ChatThread } from "./types";

interface ThreadListProps {
  threads: ChatThread[];
  selectedId: string | null;
  search: string;
  onSearch: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onClose: () => void;
  creating: boolean;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
  mobile: boolean;
}

export function ThreadList({
  threads,
  selectedId,
  search,
  onSearch,
  onSelect,
  onCreate,
  onClose,
  creating,
  loading,
  failed,
  onRetry,
  mobile,
}: ThreadListProps) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!mobile) input.current?.focus({ preventScroll: true });
  }, [mobile]);
  const main = threads.find((thread) => thread.kind === "main");
  const query = search.trim().toLocaleLowerCase("id");
  const sideChats = threads.filter(
    (thread) => thread.kind === "side" && thread.title.toLocaleLowerCase("id").includes(query),
  );
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-3 py-3">
      <div className="mb-2 flex shrink-0 items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={input}
            type="search"
            className="h-9 rounded-full border-border bg-transparent pr-3 pl-9 text-sm focus-visible:border-ring focus-visible:ring-1 dark:bg-transparent"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Cari chat…"
            aria-label="Cari chat"
          />
        </div>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label="Opsi riwayat chat"
            >
              <Ellipsis />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={onCreate} disabled={creating}>
              <Plus /> Chat baru
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onClose}>
              <PanelLeftClose /> Tutup {mobile ? "riwayat" : "panel"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {main ? (
        <div className="shrink-0">
          <ThreadButton thread={main} selectedId={selectedId} onSelect={onSelect} />
        </div>
      ) : null}
      <div className="mt-2 mr-1 mb-1 ml-3 flex shrink-0 items-center justify-between text-muted-foreground [&_h2]:text-sm [&_h2]:font-normal">
        <h2>Side chats</h2>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Buat side chat"
          onClick={onCreate}
          disabled={creating}
        >
          <Plus />
        </Button>
      </div>
      <nav
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0.5 overflow-y-auto overscroll-y-contain"
        aria-label="Side chats"
      >
        {sideChats.map((thread) => (
          <ThreadButton
            key={thread.id}
            thread={thread}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
        {loading ? (
          <p className="px-4 py-3 text-[13px] leading-relaxed text-muted-foreground" role="status">
            Memuat riwayat…
          </p>
        ) : null}
        {failed ? (
          <div role="status" className="px-3 py-4 text-sm text-muted-foreground">
            <p>Riwayat belum dapat diperbarui.</p>
            <Button type="button" variant="outline" className="mt-3" onClick={onRetry}>
              Coba lagi
            </Button>
          </div>
        ) : null}
        {!loading && !failed && sideChats.length === 0 ? (
          <p className="px-4 py-3 text-[13px] leading-relaxed text-muted-foreground">
            {query ? "Chat tidak ditemukan." : "Mulai topik baru lewat tombol +."}
          </p>
        ) : null}
      </nav>
      {mobile ? (
        <div className="flex shrink-0 items-center gap-3 px-3 pt-5 text-sm">
          <UserButton /> Akunmu
        </div>
      ) : null}
    </div>
  );
}

interface ThreadButtonProps {
  thread: ChatThread;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function ThreadButton({ thread, selectedId, onSelect }: ThreadButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className="min-h-11 h-auto w-full justify-start rounded-lg px-3 py-2 text-sm font-normal aria-[current=page]:bg-muted"
      aria-current={thread.id === selectedId ? "page" : undefined}
      title={thread.title}
      onClick={() => onSelect(thread.id)}
    >
      <span className="min-w-0 truncate">{thread.title}</span>
    </Button>
  );
}
