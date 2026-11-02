import { Link } from "@tanstack/react-router";
import { Crown, Plug, Plus, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AgentAvatar } from "@/features/conversation/components/identity";
import { cn } from "@/lib/utils";
import type { Agent, Thread } from "@/types/workspace";

export function ConversationNavigation({
  agents,
  threads,
  threadId,
  busy,
  createMenu,
  setCreateMenu,
  createAgent,
  createGroup,
  choose,
  openSettings,
  openApps,
}: {
  agents: Agent[];
  threads: Thread[];
  threadId: string | null;
  busy: boolean;
  createMenu: boolean;
  setCreateMenu: (open: boolean) => void;
  createAgent: () => void;
  createGroup: () => void;
  choose: (id: string) => void;
  openSettings: () => void;
  openApps: () => void;
}) {
  const tobi = agents.find((agent) => agent.system_role === "tobi");
  const primary = threads.find(
    (thread) => thread.type === "dm" && thread.member_agent_ids[0] === tobi?.id,
  );
  return (
    <div className="conversation-navigation relative p-3 flex flex-col h-full min-h-0">
      <div className="navigation-heading absolute top-2.5 right-3 flex items-center gap-1">
        <Link to="/" className="sr-only" aria-label="Ngertiin">
          ngertiin<span>.</span>
        </Link>
        <Popover open={createMenu} onOpenChange={setCreateMenu}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-[26px] rounded-lg text-muted-foreground"
              aria-label="Buat baru"
              disabled={busy}
            >
              <Plus size={17} strokeWidth={1.5} />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
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
              <Plus size={16} strokeWidth={1.5} /> Create agent
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={createGroup}>
              <Users size={16} strokeWidth={1.5} /> Create group
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {primary && tobi && (
        <Button
          variant="ghost"
          type="button"
          className="primary-contact mx-auto mb-4 mt-0.5 flex h-[92px] w-[78px] max-w-full shrink-0 flex-col items-center justify-start gap-0 rounded-[10px] px-1 pt-2 pb-0 text-[13px] font-medium leading-4 whitespace-normal"
          aria-current={primary.id === threadId ? "page" : undefined}
          onClick={() => choose(primary.id)}
        >
          <span className="relative flex">
            <AgentAvatar agent={tobi} className="size-14" />
            <span className="primary-role-badge absolute -bottom-px -right-px flex size-4 items-center justify-center rounded-full bg-[#e8993a] text-white ring-2 ring-panel">
              <Crown size={10} strokeWidth={1.5} fill="currentColor" aria-hidden="true" />
            </span>
          </span>
          <span className="primary-contact-name mt-1.5 w-full truncate text-center">
            {tobi.name}
          </span>
          <span className="primary-contact-role sr-only">Asisten personal</span>
        </Button>
      )}
      <nav aria-label="Percakapan" className="min-h-0 flex-1 overflow-y-auto">
        {threads
          .filter((thread) => thread.id !== primary?.id)
          .map((thread) => {
            const member = agents.find((agent) => agent.id === thread.member_agent_ids[0]);
            const name = thread.name ?? member?.name ?? "Percakapan";
            return (
              <Button
                variant="ghost"
                type="button"
                key={thread.id}
                aria-current={thread.id === threadId ? "page" : undefined}
                onClick={() => choose(thread.id)}
                className={cn(
                  "contact-row gap-2.5 min-h-[54px] my-0.5 px-2 py-1.5 rounded-[10px] text-left transition-colors duration-150 flex items-center w-full h-auto whitespace-normal",
                  thread.id === threadId && "contact-row-active",
                )}
              >
                <AgentAvatar
                  agent={member}
                  name={name}
                  group={thread.type === "group"}
                  largeGroup
                  members={agents.filter((agent) => thread.member_agent_ids.includes(agent.id))}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium leading-5">{name}</span>
                  <span className="contact-description [text-overflow:ellipsis] [white-space:nowrap] mt-0.5 [font-size:13px] [line-height:18px] block overflow-hidden text-muted-foreground">
                    {thread.type === "group"
                      ? `${thread.member_agent_ids.length} agent`
                      : member?.soul ||
                        (member?.harness === "muse" ? "Muse Code" : "Codex / ChatGPT")}
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
            <UserRound size={18} strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            className="h-9 min-w-0 flex-1 gap-2 rounded-full bg-card text-[13px] font-medium"
            onClick={openApps}
          >
            <Plug size={16} strokeWidth={1.5} />
            Hubungkan aplikasi
          </Button>
        </div>
      </div>
    </div>
  );
}
