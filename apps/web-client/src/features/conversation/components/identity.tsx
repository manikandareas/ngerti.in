import { UserGroupIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar as ProceduralAvatar } from "@/features/avatar/components/agent-avatar";
import type { AvatarState } from "@/features/avatar/engine/catalog";
import { defaultAgentAvatar, parseAvatarConfig } from "@/features/avatar/engine/config";
import type { AvatarController } from "@/features/avatar/engine/controller";
import type { ReferenceAgent } from "@/features/conversation/lib/inline-references";
import { cn } from "@/lib/utils";
import { useAvatarActivity } from "./avatar-activity";

const tones = ["pink", "blue", "teal", "purple", "orange"] as const;
// Flat Simple-mode fills evaluated with upstream userBubbleTone at the pinned revision.
const bubbleFills = {
  pink: "#d03b73",
  blue: "#0076d4",
  teal: "#00846e",
  purple: "#8057c8",
  orange: "#af6100",
  silver: "#70757c",
};

function toneOf(agent?: ReferenceAgent) {
  const hash = Array.from(agent?.id ?? "").reduce((value, char) => value + char.charCodeAt(0), 0);
  return agent?.system_role === "tobi" ? "silver" : tones[hash % tones.length];
}

// A local visual identity, stable across DM/group views and profile renames.
// This does not add a color field to the published agent contract.
export function agentStyle(agent?: ReferenceAgent): CSSProperties {
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
  state,
  animated,
  threadId,
  interactive = false,
  followPointer = false,
  showActivityLabel = true,
  deferred = false,
  isLoading = false,
}: {
  agent?: ReferenceAgent;
  name?: string;
  group?: boolean;
  largeGroup?: boolean;
  members?: ReferenceAgent[];
  className?: string;
  state?: AvatarState;
  animated?: boolean;
  threadId?: string;
  interactive?: boolean;
  followPointer?: boolean;
  showActivityLabel?: boolean;
  deferred?: boolean;
  isLoading?: boolean;
}) {
  const view = useAvatarActivity(agent?.id, threadId);
  const { version, seed, shape, color, face } = agent?.avatar_config ?? {};
  const config = useMemo(
    () =>
      parseAvatarConfig({ version, seed, shape, color, face }) ??
      defaultAgentAvatar(agent?.id ?? "unknown-agent", agent?.system_role === "tobi"),
    [agent?.id, agent?.system_role, version, seed, shape, color, face],
  );
  const controller = useRef<AvatarController | null>(null);
  const runId = view.activity?.run_id;
  const status = view.activity?.status;
  const waiting = view.activity?.waiting_for_user;
  const previous = useRef({ runId, status });
  const [celebrating, setCelebrating] = useState(false);
  useEffect(() => {
    const last = previous.current;
    previous.current = { runId, status };
    if (last.runId === runId && last.status !== "succeeded" && status === "succeeded" && !waiting) {
      setCelebrating(true);
      const timer = setTimeout(() => setCelebrating(false), 1600);
      return () => clearTimeout(timer);
    }
    setCelebrating(false);
  }, [runId, status, waiting]);
  const effectiveState =
    state ?? (celebrating && view.state === "idle" ? "celebrating" : view.state);
  const animate = animated ?? (isLoading || effectiveState !== "idle");
  const Host = interactive && !group ? "button" : "span";
  return (
    <Host
      type={Host === "button" ? "button" : undefined}
      onClick={Host === "button" ? () => controller.current?.play("boop") : undefined}
      aria-label={Host === "button" ? `Sapa ${agent?.name ?? name ?? "agent"}` : undefined}
      aria-hidden={Host === "button" ? undefined : true}
      title={showActivityLabel ? view.label : undefined}
      data-agent-id={group ? undefined : agent?.id}
      data-activity-label={showActivityLabel ? view.label : undefined}
      data-avatar-seed={group ? undefined : config.seed}
      className={cn(
        "agent-avatar relative size-9 inline-flex shrink-0 items-center justify-center text-base font-medium",
        className,
      )}
      style={agentStyle(agent)}
    >
      {group ? (
        members?.length ? (
          <span className="flex w-full items-center justify-center -space-x-2.5">
            {members.slice(0, 2).map((member) => (
              <AgentAvatar
                key={member.id}
                agent={member}
                threadId={threadId}
                animated={animated}
                deferred={deferred}
                showActivityLabel={showActivityLabel}
                className={largeGroup ? "size-8" : "size-[58%]"}
              />
            ))}
            {members.length > 2 && (
              <span className="z-10 flex size-4 shrink-0 items-center justify-center rounded-full border border-border/40 bg-secondary text-[9px] text-muted-foreground">
                +{members.length - 2}
              </span>
            )}
          </span>
        ) : (
          <HugeiconsIcon
            icon={UserGroupIcon}
            className="size-6 text-muted-foreground"
            strokeWidth={1.5}
          />
        )
      ) : (
        <ProceduralAvatar
          ref={controller}
          config={config}
          state={effectiveState}
          loading={isLoading}
          size="100%"
          animated={animate}
          deferred={deferred}
          followPointer={followPointer}
        />
      )}
    </Host>
  );
}
