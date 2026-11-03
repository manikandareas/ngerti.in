import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Message, MessageContent } from "@/components/ui/message";
import {
  activityGuidance,
  activityPresentation,
} from "@/features/conversation/lib/activity-presentation";
import type { Agent, Run } from "@/types/workspace";
import { ActivityStatus } from "./activity-status";
import { AgentAvatar } from "./identity";

export function AgentActivityBubble({
  agent,
  run,
  online,
  waitingForUser,
  targetName,
  showName,
  busy,
  openAgent,
  openSettings,
  retryPreparation,
  reconcile,
}: {
  agent: Agent;
  run: Run;
  online: boolean;
  waitingForUser: boolean;
  targetName?: string;
  showName: boolean;
  busy: boolean;
  openAgent: () => void;
  openSettings: () => void;
  retryPreparation: () => void;
  reconcile: () => void;
}) {
  const view = activityPresentation(run, { online, waitingForUser, targetName });
  const guidance =
    run.diagnostic && (run.status === "failed" || run.preparation?.state === "blocked")
      ? activityGuidance(run.diagnostic.code)
      : undefined;
  return (
    <Message
      className="agent-activity-row"
      data-agent-activity={run.id}
      data-activity-agent={agent.id}
      data-loading={view.isLoading}
    >
      <button
        type="button"
        className="agent-activity-avatar rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Open ${agent.name}’s profile`}
        onClick={openAgent}
      >
        <AgentAvatar
          agent={agent}
          state={view.state}
          isLoading={view.isLoading}
          animated={view.isLoading}
          showActivityLabel={false}
          className="size-8"
        />
      </button>
      <MessageContent>
        <Bubble variant="secondary" className="agent-activity-bubble" data-tone={view.tone}>
          <BubbleContent>
            {showName && (
              <button
                type="button"
                className="agent-activity-name text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={openAgent}
              >
                {agent.name}
              </button>
            )}
            <ActivityStatus name={agent.name} label={view.label} loading={view.isLoading} />
            {guidance && (
              <p className="message-diagnostic text-[12px] leading-[18px] text-muted-foreground">
                {guidance}
              </p>
            )}
            {run.status === "unknown" && (
              <Button size="sm" variant="ghost" disabled={busy || !online} onClick={reconcile}>
                Check status
              </Button>
            )}
            {run.preparation?.state === "blocked" && run.status === "queued" && (
              <Button
                size="sm"
                variant="ghost"
                disabled={busy || !online}
                onClick={retryPreparation}
              >
                Try again
              </Button>
            )}
            {(run.preparation?.state === "blocked" ||
              (run.diagnostic &&
                !["succeeded", "cancelled", "unknown"].includes(run.status) &&
                run.diagnostic.outcome !== "not_dispatched")) && (
              <Button size="sm" variant="ghost" onClick={openSettings}>
                Open settings
              </Button>
            )}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  );
}
