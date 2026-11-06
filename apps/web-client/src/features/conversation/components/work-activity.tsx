import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Message as ChatMessage, MessageContent } from "@/components/ui/message";
import { activityGuidance, routingLabel } from "@/features/conversation/lib/activity-presentation";
import type { Message, Run, Snapshot } from "@/types/workspace";
import { ActivityStatus } from "./activity-status";
import { AgentAvatar } from "./identity";
import { MessageActions } from "./message-actions";

const routingLabels: Record<string, string> = {
  preparing: "Getting ready…",
  retrying: "Reconnecting…",
  blocked: "I couldn’t get started.",
};

export function WorkActivity({
  message,
  snapshot,
  retryRoute,
  retryPreparation,
  busy,
}: {
  message: Message;
  run?: Run;
  snapshot: Snapshot;
  retryRoute: (route: Snapshot["routes"][number]) => void;
  retryPreparation: (runId: string, revision: number) => void;
  busy: boolean;
}) {
  const route = snapshot.routes.find((r) => r.message_id === message.id);
  const execution = route?.execution;
  const stage = execution?.stage ?? (route?.state === "pending" ? "classifying" : route?.state);
  const retry =
    stage === "blocked" &&
    execution?.retry_preparation &&
    execution.run_id &&
    execution.run_revision !== null
      ? { runId: execution.run_id, revision: execution.run_revision }
      : null;
  const group = snapshot.thread.type === "group";
  const avatar = group && (
    <span className="agent-activity-avatar">
      <AgentAvatar
        group
        members={snapshot.thread.member_agent_ids.flatMap((id) => {
          const member = snapshot.agents.find((agent) => agent.id === id);
          return member ? [member] : [];
        })}
        threadId={snapshot.thread.id}
        animated={false}
        showActivityLabel={false}
        className="size-8"
      />
    </span>
  );
  return (
    <div className="w-full min-w-0 space-y-2 text-caption text-muted-foreground empty:hidden">
      {route?.state === "pending" && stage && stage !== "reconcile" && (
        <ChatMessage
          className="agent-activity-row"
          data-group-routing
          data-loading={stage !== "blocked"}
          data-group={group}
        >
          {avatar}
          <MessageContent>
            <MessageActions
              text={routingLabels[stage] ?? routingLabel(route.id)}
              busy={busy}
              retry={retry ? () => retryPreparation(retry.runId, retry.revision) : undefined}
            >
              <Bubble variant="secondary" className="agent-activity-bubble">
                <BubbleContent>
                  <ActivityStatus
                    name={snapshot.thread.name ?? "Group"}
                    label={routingLabels[stage] ?? routingLabel(route.id)}
                    loading={stage !== "blocked"}
                  />
                </BubbleContent>
              </Bubble>
            </MessageActions>
          </MessageContent>
        </ChatMessage>
      )}
      {stage === "blocked" && (
        <p>{activityGuidance(execution?.diagnostic?.code ?? "SERVICE_UNAVAILABLE")}</p>
      )}
      {route && (route.state === "unknown" || stage === "reconcile") && (
        <p role="status">
          {route.state === "unknown" || stage === "reconcile"
            ? "I couldn’t confirm who should reply."
            : route.clarification || activityGuidance(route.error_code ?? "ROUTING_UNAVAILABLE")}
        </p>
      )}
      {route?.state === "rejected" && (
        <ChatMessage className="agent-activity-row" data-group-routing data-group={group}>
          {avatar}
          <MessageContent>
            <MessageActions
              text={
                route.clarification || activityGuidance(route.error_code ?? "ROUTING_UNAVAILABLE")
              }
              busy={busy}
              retry={() => retryRoute(route)}
            >
              <Bubble variant="secondary" className="agent-activity-bubble">
                <BubbleContent>
                  {route.clarification ||
                    activityGuidance(route.error_code ?? "ROUTING_UNAVAILABLE")}
                </BubbleContent>
              </Bubble>
            </MessageActions>
          </MessageContent>
        </ChatMessage>
      )}
    </div>
  );
}
