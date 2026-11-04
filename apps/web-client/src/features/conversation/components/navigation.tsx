import {
  Add01Icon,
  Cancel01Icon,
  Plug01Icon,
  UserGroupIcon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgentAvatar } from "@/features/conversation/components/identity";
import { NavigationSearch } from "@/features/conversation/components/navigation-search";
import { conversationSubtitle } from "@/features/conversation/lib/conversation-subtitle";
import { cn } from "@/lib/utils";
import type { Agent, AgentActivity, ConversationPreview, Thread } from "@/types/workspace";
import { ConversationListSkeleton } from "./conversation-loading";

export function ConversationNavigation({
  agents,
  threads,
  activities,
  previews,
  threadId,
  busy,
  loading = false,
  createMenu,
  setCreateMenu,
  createAgent,
  createGroup,
  choose,
  openSettings,
  openApps,
  closeNavigation,
}: {
  agents: Agent[];
  threads: Thread[];
  activities: AgentActivity[];
  previews: ConversationPreview[];
  threadId: string | null;
  busy: boolean;
  loading?: boolean;
  createMenu: boolean;
  setCreateMenu: (open: boolean) => void;
  createAgent: () => void;
  createGroup: () => void;
  choose: (id: string) => void;
  openSettings: () => void;
  openApps: () => void;
  closeNavigation?: () => void;
}) {
  const [search, setSearch] = useState("");
  const query = search.trim().toLocaleLowerCase();
  const agentsById = new Map(agents.map((agent) => [agent.id, agent]));
  const filteredThreads = query
    ? threads.filter((thread) => {
        const agentName = agentsById.get(thread.member_agent_ids[0])?.name ?? "";
        const name = thread.name ?? agentName;
        return (
          name.toLocaleLowerCase().includes(query) ||
          (thread.type === "dm" && agentName.toLocaleLowerCase().includes(query))
        );
      })
    : threads;
  const previewsByThread = new Map(previews.map((preview) => [preview.thread_id, preview]));
  const activitiesByThread = new Map<string, AgentActivity[]>();
  for (const activity of activities) {
    const items = activitiesByThread.get(activity.thread_id) ?? [];
    items.push(activity);
    activitiesByThread.set(activity.thread_id, items);
  }
  return (
    <div className="conversation-navigation relative p-3 flex flex-col h-full min-h-0">
      <div className="navigation-heading mb-2 flex shrink-0 items-center justify-end gap-2">
        <Link to="/" className="sr-only" aria-label="Ngertiin">
          ngertiin<span>.</span>
        </Link>
        <NavigationSearch value={search} onValueChange={setSearch} />
        <Popover open={createMenu} onOpenChange={setCreateMenu}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="secondary"
              className="navigation-create size-8 shrink-0 rounded-lg text-muted-foreground"
              aria-label="Buat baru"
              disabled={busy}
            >
              <HugeiconsIcon icon={Add01Icon} size={17} strokeWidth={1.5} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align={closeNavigation ? "start" : "end"}
            className="source-menu creation-menu w-52 gap-1 p-1.5"
            onKeyDown={(event) => {
              const items = Array.from(
                event.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
              );
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === "ArrowDown"
                  ? (current + 1) % items.length
                  : event.key === "ArrowUp"
                    ? (current - 1 + items.length) % items.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? items.length - 1
                        : null;
              if (next !== null && items[next]) {
                event.preventDefault();
                items[next].focus();
              }
            }}
          >
            <Button variant="ghost" className="w-full justify-start" onClick={createAgent}>
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} /> Create agent
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={createGroup}>
              <HugeiconsIcon icon={UserGroupIcon} size={16} strokeWidth={1.5} /> Create group
            </Button>
          </PopoverContent>
        </Popover>
        {closeNavigation && (
          <Button
            variant="ghost"
            size="icon"
            className="size-10 rounded-full text-muted-foreground"
            aria-label="Close"
            onClick={closeNavigation}
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} strokeWidth={1.5} />
          </Button>
        )}
      </div>
      <nav aria-label="Percakapan" className="min-h-0 flex-1 overflow-y-auto">
        {loading && <ConversationListSkeleton />}
        {!loading && query && filteredThreads.length === 0 && (
          <p role="status" className="px-2 py-6 text-center text-sm text-muted-foreground">
            Tidak ada agent atau grup yang cocok.
          </p>
        )}
        {filteredThreads.map((thread) => {
          const member = agentsById.get(thread.member_agent_ids[0]);
          const name = thread.name ?? member?.name ?? "Percakapan";
          const subtitle = conversationSubtitle(
            thread,
            agentsById,
            activitiesByThread.get(thread.id) ?? [],
            previewsByThread.get(thread.id),
          );
          return (
            <Button
              variant="ghost"
              type="button"
              key={thread.id}
              data-thread-id={thread.id}
              aria-current={thread.id === threadId ? "page" : undefined}
              onClick={() => choose(thread.id)}
              className={cn(
                "contact-row gap-3 min-h-[60px] my-0.5 px-2 py-2 rounded-[10px] text-left transition-colors duration-150 flex items-center w-full h-auto whitespace-normal",
                thread.id === threadId && "contact-row-active",
              )}
            >
              <AgentAvatar
                agent={member}
                animated
                followPointer={false}
                deferred
                showLoadingActivity
                threadId={thread.id}
                name={name}
                group={thread.type === "group"}
                largeGroup
                className="size-11"
                members={agents.filter((agent) => thread.member_agent_ids.includes(agent.id))}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium leading-5">{name}</span>
                <span
                  title={subtitle}
                  className="contact-description mt-0.5 block truncate text-[13px] leading-[18px] text-muted-foreground"
                >
                  {subtitle}
                </span>
              </span>
            </Button>
          );
        })}
      </nav>
      <div className="navigation-footer pt-4 pb-1 flex flex-col">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-full bg-card text-muted-foreground"
            aria-label="Pengaturan"
            onClick={openSettings}
          >
            <HugeiconsIcon icon={UserIcon} size={18} strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            className="h-9 min-w-0 flex-1 gap-2 rounded-full bg-card text-[13px] font-medium"
            onClick={openApps}
          >
            <HugeiconsIcon icon={Plug01Icon} size={16} strokeWidth={1.5} />
            Hubungkan aplikasi
          </Button>
        </div>
      </div>
    </div>
  );
}
