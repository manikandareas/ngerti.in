import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/workspace";

const tones = ["pink", "blue", "teal", "purple", "orange"] as const;

// A local visual identity, stable across DM/group views and profile renames.
// This does not add a color field to the published agent contract.
export function agentStyle(agent?: Agent): CSSProperties {
  const hash = Array.from(agent?.id ?? "").reduce((value, char) => value + char.charCodeAt(0), 0);
  const tone = agent?.system_role === "tobi" ? "silver" : tones[hash % tones.length];
  return {
    "--agent-color": `var(--identity-${tone})`,
    "--agent-bubble":
      tone === "silver" ? "#5a5a5a" : "color-mix(in srgb, var(--agent-color) 72%, #000)",
  } as CSSProperties;
}

export function AgentAvatar({
  agent,
  name,
  group = false,
  className,
}: {
  agent?: Agent;
  name?: string;
  group?: boolean;
  className?: string;
}) {
  return (
    <Avatar
      className={cn(
        "agent-avatar w-9.5 h-9.5 rounded-[12px] [background:var(--agent-bubble,_var(--user-bubble))] [color:#fff] [font-size:16px] inline-flex items-center justify-center shrink-0 font-medium",
        className,
      )}
      style={agentStyle(agent)}
      aria-hidden="true"
    >
      <AvatarFallback className="rounded-[inherit] bg-transparent text-inherit [font-size:inherit]">
        {group ? (
          <HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.6} />
        ) : (
          (agent?.avatar ?? (agent?.name ?? name ?? "n").slice(0, 1).toLocaleUpperCase())
        )}
      </AvatarFallback>
    </Avatar>
  );
}
