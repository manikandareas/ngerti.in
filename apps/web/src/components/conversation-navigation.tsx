import { UserButton, useAuth } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Plus, Search, Settings, Users } from "lucide-react";
import { useState } from "react";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import type { Agent } from "@/features/agents/agents-page";
import { listThreads } from "@/features/direct-messages/client";
import { api } from "@/lib/api";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";

export function ConversationNavigation({ mobile = false }: { mobile?: boolean }) {
  const { getToken, userId, isSignedIn } = useAuth();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["navigation-threads", userId, path],
    queryFn: async () => listThreads(await getToken()),
    enabled: !!isSignedIn,
  });
  const profiles = useQuery({
    queryKey: ["navigation-agent-profiles", userId, path],
    enabled: !!isSignedIn,
    queryFn: async () => {
      const token = await getToken();
      const items: Agent[] = [];
      let after: string | null = null;
      do {
        const page: { items: Agent[]; next_cursor: string | null } = await api(
          `/api/agent-engine/v1/agents${after ? `?after=${encodeURIComponent(after)}` : ""}`,
          token,
        );
        items.push(...page.items);
        after = page.next_cursor;
      } while (after);
      return items;
    },
  });
  const items = data?.filter((thread) =>
    thread.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const content = (
    <div className="flex h-full min-h-0 flex-col gap-[22px] p-5 md:p-7">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-muted-foreground" />
        <Input
          className="conversation-search h-11 pl-10"
          aria-label="Cari percakapan"
          placeholder="Cari percakapan"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">Percakapan</h2>
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/agents" aria-label="Percakapan baru" onClick={() => setOpen(false)}>
            <Plus className="size-4" />
          </Link>
        </Button>
      </div>
      <nav aria-label="DM dan grup" className="min-h-0 flex-1 space-y-1 overflow-y-auto">
        {isPending && isSignedIn && (
          <p role="status" className="text-sm text-muted-foreground">
            Memuat percakapan…
          </p>
        )}
        {error && (
          <div role="alert" className="text-sm">
            <p>Percakapan belum dapat dimuat.</p>
            <Button variant="ghost" onClick={() => void refetch()}>
              Coba lagi
            </Button>
          </div>
        )}
        {items?.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            {search ? "Tidak ada percakapan yang cocok." : "Percakapanmu akan muncul di sini."}
          </p>
        )}
        {items?.map((thread) => (
          <Link
            key={thread.thread_id}
            to="/conversations/$threadId"
            params={{ threadId: thread.thread_id }}
            onClick={() => setOpen(false)}
            activeProps={{ className: "font-medium", "aria-current": "page" }}
            className="conversation-link flex min-h-14 items-center gap-3 rounded-[10px] border border-transparent px-2.5 py-3 text-sm hover:bg-card/40"
          >
            {thread.kind === "group" ? (
              <Users className="size-4 shrink-0" />
            ) : (
              <AgentAvatar
                name={thread.title}
                url={
                  profiles.data?.find((agent) => agent.agent_id === thread.dm_agent_id)?.config
                    .avatar_url
                }
                className="size-9 text-sm"
              />
            )}
            <span className="min-w-0 break-words [overflow-wrap:anywhere]">
              {thread.title}
              <span className="block text-xs text-muted-foreground">
                {thread.kind === "group" ? "Grup" : "DM"}
              </span>
            </span>
          </Link>
        ))}
      </nav>
      <nav aria-label="Pengaturan" className="space-y-1 border-t pt-3">
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link to="/agents" onClick={() => setOpen(false)}>
            <Users />
            Kelola agent dan grup
          </Link>
        </Button>
        <Button asChild variant="ghost" className="w-full justify-start">
          <Link to="/connections" onClick={() => setOpen(false)}>
            <Settings />
            Koneksi dan pengaturan
          </Link>
        </Button>
      </nav>
      <div className="flex items-center gap-3 text-sm">
        {isSignedIn ? (
          <>
            <div className="size-8 shrink-0">
              <UserButton />
            </div>
            <span>Akun saya</span>
          </>
        ) : (
          <Link to="/sign-in">Masuk</Link>
        )}
      </div>
    </div>
  );
  if (!mobile)
    return (
      <aside className="conversation-sidebar hidden w-[280px] shrink-0 lg:w-[344px] md:block">
        {content}
      </aside>
    );
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Buka navigasi">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="gap-0 data-[side=left]:w-[min(344px,100vw)]">
        <SheetTitle className="sr-only">Navigasi</SheetTitle>
        <SheetDescription className="sr-only">
          Percakapan, agent dan pengaturan akun.
        </SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  );
}
