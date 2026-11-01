import { Add01Icon, Settings02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "./identity";
import type { Agent, Thread } from "./types";

export function ConversationNavigation({
  agents,
  threads,
  threadId,
  busy,
  online,
  createMenu,
  setCreateMenu,
  createAgent,
  choose,
  openSettings,
}: {
  agents: Agent[];
  threads: Thread[];
  threadId: string | null;
  busy: boolean;
  online: boolean;
  createMenu: boolean;
  setCreateMenu: (open: boolean) => void;
  createAgent: () => void;
  choose: (id: string) => void;
  openSettings: () => void;
}) {
  const tobi = agents.find((agent) => agent.system_role === "tobi");
  const primary = threads.find(
    (thread) => thread.type === "dm" && thread.member_agent_ids[0] === tobi?.id,
  );
  return (
    <div className="conversation-navigation">
      <div className="navigation-heading">
        <Link to="/" className="wordmark" aria-label="Ngertiin">
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
            <Button
              variant="ghost"
              className="w-full justify-start"
              disabled
              title="Pembuatan grup belum tersedia."
            >
              Create group
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      {primary && tobi && (
        <button
          type="button"
          className="primary-contact"
          aria-current={primary.id === threadId ? "page" : undefined}
          onClick={() => choose(primary.id)}
        >
          <AgentAvatar agent={tobi} className="size-16 rounded-2xl text-2xl" />
          <span>{tobi.name}</span>
          <span className="sr-only">Asisten personal</span>
        </button>
      )}
      <nav aria-label="Percakapan" className="conversation-list">
        {threads
          .filter((thread) => thread.id !== primary?.id)
          .map((thread) => {
            const member = agents.find((agent) => agent.id === thread.member_agent_ids[0]);
            const name = thread.name ?? member?.name ?? "Percakapan";
            return (
              <button
                type="button"
                key={thread.id}
                aria-current={thread.id === threadId ? "page" : undefined}
                onClick={() => choose(thread.id)}
                className={cn("contact-row", thread.id === threadId && "contact-row-active")}
              >
                <AgentAvatar agent={member} name={name} group={thread.type === "group"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{name}</span>
                  <span className="contact-description">
                    {thread.type === "group"
                      ? `${thread.member_agent_ids.length} agent`
                      : member?.soul ||
                        (member?.harness === "muse" ? "Muse Code" : "Codex / ChatGPT")}
                  </span>
                </span>
              </button>
            );
          })}
      </nav>
      <div className="navigation-footer">
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
