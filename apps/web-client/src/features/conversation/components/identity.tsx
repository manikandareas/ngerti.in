import { Users } from "lucide-react";
import type { CSSProperties } from "react";
import chromeAvatar from "@/assets/openmaus/cursor-chrome.webp";
import { CursorAvatar, type CursorState } from "@/components/openmaus-avatar/CursorAvatar";
import { cn } from "@/lib/utils";
import type { Agent } from "@/types/workspace";

const tones = ["pink", "blue", "teal", "purple", "orange"] as const;
const colors = {
  pink: "#d84f8b",
  blue: "#377fe6",
  teal: "#01a492",
  purple: "#8057c8",
  orange: "#e78531",
  silver: "#a8adb4",
};
// Flat Simple-mode fills evaluated with upstream userBubbleTone at the pinned revision.
const bubbleFills = {
  pink: "#d03b73",
  blue: "#0076d4",
  teal: "#00846e",
  purple: "#8057c8",
  orange: "#af6100",
  silver: "#70757c",
};

function toneOf(agent?: Agent) {
  const hash = Array.from(agent?.id ?? "").reduce((value, char) => value + char.charCodeAt(0), 0);
  return agent?.system_role === "tobi" ? "silver" : tones[hash % tones.length];
}

// The same three-stop material used by OpenMausBot's GradientAvatar.
function gradientOf(color: string): [string, string, string] {
  const mix = (toward: number, amount: number) =>
    `#${[1, 3, 5]
      .map((at) =>
        Math.round(parseInt(color.slice(at, at + 2), 16) * (1 - amount) + toward * amount)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  return [mix(255, 0.55), color, mix(0, 0.42)];
}

// A local visual identity, stable across DM/group views and profile renames.
// This does not add a color field to the published agent contract.
export function agentStyle(agent?: Agent): CSSProperties {
  const tone = toneOf(agent);
  return {
    "--agent-color": `var(--identity-${tone})`,
    "--agent-bubble": bubbleFills[tone],
  } as CSSProperties;
}

export function AgentAvatar({
  agent,
  name,
  group = false,
  largeGroup = false,
  members,
  className,
  state = "idle",
  animated = false,
}: {
  agent?: Agent;
  name?: string;
  group?: boolean;
  largeGroup?: boolean;
  members?: Agent[];
  className?: string;
  state?: CursorState;
  animated?: boolean;
}) {
  return (
    <span
      className={cn(
        "agent-avatar relative size-9 inline-flex shrink-0 items-center justify-center text-base font-medium",
        className,
      )}
      style={agentStyle(agent)}
      aria-hidden="true"
    >
      {group ? (
        members?.length ? (
          <span className="flex w-full items-center justify-center -space-x-2.5">
            {members.slice(0, 2).map((member) => (
              <AgentAvatar
                key={member.id}
                agent={member}
                className={largeGroup ? "size-[26px]" : "size-[58%]"}
              />
            ))}
            {members.length > 2 && (
              <span className="z-10 flex size-4 shrink-0 items-center justify-center rounded-full border border-border/40 bg-secondary text-[9px] text-muted-foreground">
                +{members.length - 2}
              </span>
            )}
          </span>
        ) : (
          <Users className="size-6 text-muted-foreground" strokeWidth={1.5} />
        )
      ) : agent?.system_role === "tobi" ? (
        <img src={chromeAvatar} alt="" className="size-full object-contain" />
      ) : agent?.avatar && agent.avatar !== "🤖" ? (
        <span className="flex size-full items-center justify-center rounded-[25%] bg-secondary text-[inherit]">
          {agent.avatar}
        </span>
      ) : (
        <CursorAvatar
          size="100%"
          className="size-full"
          title={null}
          state={state}
          gradient={gradientOf(colors[toneOf(agent)])}
          eyeScale={1.12}
          mouthStroke={11}
          paused={!animated}
          autoBlink={animated}
          autoExpression={animated}
          lookAround={0}
        />
      )}
      <span className="sr-only">{agent?.name ?? name}</span>
    </span>
  );
}
