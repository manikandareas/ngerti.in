import { Add01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { ThemeSwitcher } from "@/components/theme-switcher";
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
}) {
  const tobi = agents.find((agent) => agent.system_role === "tobi");
  const primary = threads.find(
    (thread) => thread.type === "dm" && thread.member_agent_ids[0] === tobi?.id,
  );
  return (
    <div className="conversation-navigation p-3 flex flex-col h-full min-h-0">
      <div className="navigation-heading gap-3 p-1 flex items-center justify-between">
        <Link
          to="/"
          className="wordmark [font-size:16px] [letter-spacing:-0.03em] font-semibold"
          aria-label="Ngertiin"
        >
          ngertiin<span>.</span>
        </Link>
        <Popover open={createMenu} onOpenChange={setCreateMenu}>
          <PopoverTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full"
              aria-label="Buat baru"
              disabled={busy}
            >
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.6} />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-52 rounded-[14px] p-1.5">
            <Button variant="ghost" className="w-full justify-start" onClick={createAgent}>
              <HugeiconsIcon icon={Add01Icon} strokeWidth={1.6} /> Create agent
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={createGroup}>
              Create group
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {primary && tobi && (
        <Button
          variant="ghost"
          type="button"
          className="primary-contact gap-2 [width:fit-content] [max-width:100%] [margin:22px_auto_28px] rounded-[12px] p-3 [font-size:14px] flex flex-col items-center font-medium h-auto whitespace-normal"
          aria-current={primary.id === threadId ? "page" : undefined}
          onClick={() => choose(primary.id)}
        >
          <AgentAvatar agent={tobi} className="size-16 rounded-2xl text-2xl" />
          <span>{tobi.name}</span>
          <span className="sr-only">Asisten personal</span>
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
                  "contact-row gap-2.5 min-h-13.5 [margin:2px_0] [padding:8px_10px] rounded-[10px] [text-align:left] [transition:background-color_var(--duration-fast)] flex items-center w-full h-auto whitespace-normal",
                  thread.id === threadId && "contact-row-active",
                )}
              >
                <AgentAvatar agent={member} name={name} group={thread.type === "group"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
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
      <div className="navigation-footer gap-4 [padding:16px_4px_4px] flex flex-col">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full"
            aria-label="Pengaturan"
            onClick={openSettings}
          >
            <HugeiconsIcon icon={Settings02Icon} strokeWidth={1.6} />
          </Button>
          <ThemeSwitcher compact />
        </div>
      </div>
    </div>
  );
}
