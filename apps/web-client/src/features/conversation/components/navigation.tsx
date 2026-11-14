import { Add01Icon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { OrganizationSwitcher } from "@/features/account/organization-switcher";
import { useAccount } from "@/features/account/session";
import { NavigationSearch } from "@/features/conversation/components/navigation-search";
import { command } from "@/lib/api-client";
import type { Agent, AgentActivity, ConversationPreview, Thread } from "@/types/workspace";
import { ConversationList } from "./conversation-list";
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
}) {
  const [search, setSearch] = useState("");
  const [opening, setOpening] = useState<string | null>(null);
  const [error, setError] = useState("");
  const account = useAccount();
  const scoped = account?.mode === "accounts";
  const teamAgents = agents.filter(
    (agent) =>
      agent.organization_id &&
      agent.actor_id === null &&
      (!search || agent.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  );
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
      <OrganizationSwitcher />
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
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} /> Create agent
            </Button>
            <Button variant="ghost" className="w-full justify-start" onClick={createGroup}>
              <HugeiconsIcon icon={UserGroupIcon} size={16} strokeWidth={1.5} /> Create group
            </Button>
          </PopoverContent>
        </Popover>
      </div>
      <nav aria-label="Percakapan" className="min-h-0 flex-1 overflow-y-auto">
        {loading && <ConversationListSkeleton />}
        {!loading && query && filteredThreads.length === 0 && (
          <p role="status" className="px-2 py-6 text-center text-sm text-muted-foreground">
            Tidak ada agent atau grup yang cocok.
          </p>
        )}
        {!loading && scoped && <div className="agent-section-label">My agents</div>}
        {!loading &&
          filteredThreads.some(
            (thread) =>
              !scoped ||
              thread.type === "group" ||
              agentsById.get(thread.member_agent_ids[0])?.actor_id !== null,
          ) && (
            <ConversationList
              agents={agents}
              threads={
                scoped
                  ? filteredThreads.filter(
                      (thread) =>
                        thread.type === "group" ||
                        agentsById.get(thread.member_agent_ids[0])?.actor_id !== null,
                    )
                  : filteredThreads
              }
              agentsById={agentsById}
              activitiesByThread={activitiesByThread}
              previewsByThread={previewsByThread}
              threadId={threadId}
              choose={choose}
            />
          )}
        {!loading && scoped && teamAgents.length > 0 && (
          <>
            <div className="agent-section-label">Team agents</div>
            {teamAgents.map((agent) => {
              const thread = threads.find(
                (item) => item.type === "dm" && item.member_agent_ids[0] === agent.id,
              );
              return thread ? (
                <ConversationList
                  key={agent.id}
                  agents={agents}
                  threads={[thread]}
                  agentsById={agentsById}
                  activitiesByThread={activitiesByThread}
                  previewsByThread={previewsByThread}
                  threadId={threadId}
                  choose={choose}
                />
              ) : (
                <Button
                  key={agent.id}
                  variant="ghost"
                  className="w-full justify-start min-h-12 px-2"
                  disabled={!!opening || busy}
                  onClick={() => {
                    setOpening(agent.id);
                    setError("");
                    void command<Thread>(`/v1/agents/${agent.id}/dm`)
                      .then((value) => choose(value.id))
                      .catch((failure) => setError(failure.message))
                      .finally(() => setOpening(null));
                  }}
                >
                  {agent.name}
                  {opening === agent.id ? "…" : ""}
                </Button>
              );
            })}
          </>
        )}
        {error && (
          <p role="alert" className="account-error px-2 py-3">
            {error}
          </p>
        )}
      </nav>
    </div>
  );
}
