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
import { MessageActions } from "./message-actions";
import { MessageTime } from "./message-time";

export function AgentActivityBubble({
  embedded = false,
  agent,
  run,
  at = run.created_at,
  online,
  waitingForUser,
  targetName,
  showName,
  busy,
  openAgent,
  openSettings,
  retryPreparation,
  retryResponse,
  reconcile,
}: {
  embedded?: boolean;
  agent: Agent;
  run: Run;
  at?: string;
  online: boolean;
  waitingForUser: boolean;
  targetName?: string;
  showName: boolean;
  busy: boolean;
  openAgent: () => void;
  openSettings: () => void;
  retryPreparation: () => void;
  retryResponse?: () => void;
  reconcile: () => void;
}) {
  const view = activityPresentation(run, { online, waitingForUser, targetName });
  const guidance =
    run.diagnostic && (run.status === "failed" || run.preparation?.state === "blocked")
      ? activityGuidance(run.diagnostic.code)
      : undefined;
  const content = (
    <MessageActions
      text={view.label}
      busy={busy || !online}
      retry={
        run.preparation?.state === "blocked" && run.status === "queued"
          ? retryPreparation
          : run.status === "failed"
            ? retryResponse
            : undefined
      }
    >
      <Bubble variant="secondary" className="agent-activity-bubble" data-tone={view.tone}>
        <BubbleContent>
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
          {(run.preparation?.state === "blocked" ||
            (run.diagnostic &&
              !["succeeded", "cancelled", "unknown"].includes(run.status) &&
              run.diagnostic.outcome !== "not_dispatched")) && (
            <Button size="sm" variant="ghost" onClick={openSettings}>
              Open settings
            </Button>
          )}
          <MessageTime at={at} />
        </BubbleContent>
      </Bubble>
    </MessageActions>
  );
  if (embedded) return content;
  return (
    <Message
      className="agent-activity-row"
      data-agent-activity={run.id}
      data-activity-agent={agent.id}
      data-loading={view.isLoading}
      data-group={showName}
    >
      {showName && (
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
            animated
            followPointer
            showActivityLabel={false}
            className="size-8"
          />
        </button>
      )}
      <MessageContent>{content}</MessageContent>
    </Message>
  );
}
