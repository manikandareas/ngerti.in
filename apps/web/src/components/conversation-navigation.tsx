import { useAuth, useClerk, useUser } from "@clerk/tanstack-react-start";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ChevronsUpDown,
  LogOut,
  Menu,
  Moon,
  Plus,
  Search,
  Settings,
  UserRound,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { AgentAvatar } from "@/features/agents/agent-avatar";
import type { Agent } from "@/features/agents/agents-page";
import { GroupAvatar } from "@/features/agents/group-avatar";
import { listConversationSummaries, listThreads } from "@/features/direct-messages/client";
import { api } from "@/lib/api";

import { Button } from "./ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./ui/sheet";

function GroupAvatars({ threadId }: { threadId: string }) {
  const { getToken, userId, isSignedIn } = useAuth();
  const { data } = useQuery({
    queryKey: ["navigation-group-members", userId, threadId],
    enabled: !!isSignedIn,
    queryFn: async () =>
      api<{ agents: Agent[] }>(
        `/api/agent-engine/v1/threads/${encodeURIComponent(threadId)}`,
        await getToken(),
      ),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const agents = data?.agents ?? [];
  return <GroupAvatar agents={agents} />;
}

export function ConversationNavigation({ mobile = false }: { mobile?: boolean }) {
  const { getToken, userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const { openUserProfile, signOut } = useClerk();
  const userName = user?.fullName || user?.username || "Akun saya";
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const sync = () =>
      setDark(
        document.documentElement.dataset.theme === "dark" ||
          document.documentElement.classList.contains("dark"),
      );
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "class"],
    });
    return () => observer.disconnect();
  }, []);
  const toggleTheme = (checked: boolean) => {
    document.documentElement.dataset.theme = checked ? "dark" : "light";
    document.documentElement.classList.toggle("dark", checked);
    setDark(checked);
    try {
      localStorage.setItem("ngertiin-theme", checked ? "dark" : "light");
    } catch {}
  };
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["navigation-threads", userId],
    refetchInterval: 15000,
    queryFn: async () => listThreads(await getToken()),
    enabled: !!isSignedIn,
  });
  const summaries = useQuery({
    queryKey: ["conversation-summaries", userId],
    queryFn: async () => listConversationSummaries(await getToken()),
    enabled: !!isSignedIn,
    refetchInterval: 15000,
  });
  const profiles = useQuery({
    queryKey: ["navigation-agent-profiles", userId],
    refetchInterval: 30000,
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
    <div className="flex h-full min-h-0 flex-col gap-3 p-3 text-foreground">
      <div className="conversation-search-wrapper relative isolate">
        <Search className="pointer-events-none absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="conversation-search h-9 pl-10"
          aria-label="Cari percakapan"
          placeholder="Cari percakapan"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="conversation-section relative flex h-8 items-center justify-between">
        <h2 className="text-xs font-medium text-muted-foreground">Percakapan</h2>
        <Button asChild variant="ghost" size="icon-sm" className="absolute right-0">
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
            title={thread.title}
            aria-label={thread.title}
            className="conversation-link flex min-h-12 items-center gap-2.5 rounded-lg border border-transparent px-2 py-2 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {thread.kind === "group" ? (
              <GroupAvatars threadId={thread.thread_id} />
            ) : (
              <AgentAvatar
                name={thread.title}
                url={
                  profiles.data?.find((agent) => agent.agent_id === thread.dm_agent_id)?.config
                    .avatar_url
                }
                className="size-8 text-xs"
              />
            )}
            <span className="conversation-preview min-w-0 flex-1 truncate">
              {thread.title}
              <span className="block truncate text-xs text-muted-foreground">
                {summaries.data?.find((item) => item.thread_id === thread.thread_id)?.last_message
                  ?.preview || (thread.kind === "group" ? "Grup" : "DM")}
              </span>
            </span>
            {summaries.data?.some(
              (item) => item.thread_id === thread.thread_id && BigInt(item.unread_count) > 0n,
            ) && (
              <span
                className="size-2 shrink-0 rounded-full bg-primary"
                role="img"
                aria-label="Hasil belum dibaca"
              />
            )}
          </Link>
        ))}
      </nav>
      <div className="conversation-account pt-1">
        {isSignedIn ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="conversation-user-trigger h-12 w-full justify-start gap-2.5 px-2"
                aria-label={`Menu pengguna: ${userName}`}
              >
                <AgentAvatar
                  name={userName}
                  url={user?.imageUrl}
                  className="size-8 shrink-0 text-xs"
                />
                <span className="conversation-user-label min-w-0 flex-1 truncate text-left">
                  {userName}
                </span>
                <ChevronsUpDown className="conversation-user-label size-4 shrink-0 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side="top"
              align="start"
              sideOffset={8}
              className="min-w-60 [&_[role=menuitem]]:gap-2.5 [&_[role=menuitem]]:px-2 [&_[role=menuitem]]:py-2"
            >
              <DropdownMenuLabel className="flex items-center gap-2.5 p-2">
                <AgentAvatar
                  name={userName}
                  url={user?.imageUrl}
                  className="size-9 shrink-0 text-xs"
                />
                <span className="min-w-0">
                  <span className="block truncate">{userName}</span>
                  <span className="block truncate text-xs font-normal text-muted-foreground">
                    {user?.primaryEmailAddress?.emailAddress}
                  </span>
                </span>
              </DropdownMenuLabel>

              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  openUserProfile();
                }}
              >
                <UserRound />
                Akun saya
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/agents" onClick={() => setOpen(false)}>
                  <Users />
                  Agent dan grup
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link to="/connections" onClick={() => setOpen(false)}>
                  <Settings />
                  Koneksi dan pengaturan
                </Link>
              </DropdownMenuItem>

              <DropdownMenuCheckboxItem
                checked={dark}
                onCheckedChange={toggleTheme}
                onSelect={(event) => event.preventDefault()}
                className="gap-2.5 py-2"
              >
                <Moon className="size-4" />
                Mode gelap
              </DropdownMenuCheckboxItem>
              <DropdownMenuItem
                onSelect={() => {
                  setOpen(false);
                  void signOut({ redirectUrl: "/sign-in" });
                }}
              >
                <LogOut />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button asChild variant="ghost" className="w-full justify-start">
            <Link to="/sign-in">Masuk</Link>
          </Button>
        )}
      </div>
    </div>
  );
  if (!mobile)
    return (
      <aside className="conversation-sidebar hidden w-[260px] shrink-0 lg:w-[280px] md:block">
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
      <SheetContent
        side="bottom"
        className="h-[85dvh] max-h-[calc(100dvh-48px)] gap-0 rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetTitle className="sr-only">Navigasi</SheetTitle>
        <SheetDescription className="sr-only">
          Percakapan, agent dan pengaturan akun.
        </SheetDescription>
        {content}
      </SheetContent>
    </Sheet>
  );
}
