import { Users } from "lucide-react";
import { AgentAvatar } from "./agent-avatar";
import type { Agent } from "./agents-page";

export function GroupAvatar({ agents }: { agents: Agent[] }) {
  if (!agents.length) return <Users className="size-8 shrink-0 p-1.5" />;
  return (
    <span
      role="img"
      className="conversation-group-avatars flex shrink-0 -space-x-3"
      aria-label={`${agents.length} agent`}
    >
      {agents.slice(0, 3).map((agent) => (
        <AgentAvatar
          key={agent.agent_id}
          name={agent.display_name}
          url={agent.config.avatar_url}
          className="size-7 rounded-full! ring-2 ring-background text-xs"
        />
      ))}
      {agents.length > 3 && (
        <span className="relative flex size-7 items-center justify-center rounded-full bg-secondary text-[10px] font-semibold text-secondary-foreground ring-2 ring-background">
          +{agents.length - 3}
        </span>
      )}
    </span>
  );
}
