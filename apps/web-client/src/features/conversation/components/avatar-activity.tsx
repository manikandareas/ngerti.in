import { createContext, useContext } from "react";
import type { AgentActivity } from "@/types/workspace";
import { activityPresentation } from "../lib/activity-presentation";
import { avatarActivity } from "../lib/avatar-activity";

export const AvatarActivityContext = createContext<{
  items: AgentActivity[];
  threadId: string | null;
  listeningThreadId: string | null;
  online: boolean;
}>({ items: [], threadId: null, listeningThreadId: null, online: true });

export function useAvatarActivity(agentId?: string, threadId?: string) {
  const context = useContext(AvatarActivityContext);
  const thread = threadId ?? context.threadId;
  const activity = context.items.find(
    (item) => item.agent_id === agentId && item.thread_id === thread,
  );
  return {
    activity,
    isLoading: activityPresentation(activity ?? { status: "idle" }, { online: context.online })
      .isLoading,
    ...avatarActivity(
      activity,
      context.online,
      thread !== null && thread === context.listeningThreadId,
    ),
  };
}
