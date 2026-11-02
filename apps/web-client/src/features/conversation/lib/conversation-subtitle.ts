import type { Agent, AgentActivity, ConversationPreview, Thread } from "@/types/workspace";
import { avatarActivity } from "./avatar-activity";

function priority(activity: AgentActivity) {
  if (activity.waiting_for_user) return 4;
  if (["running", "dispatching", "cancel_requested"].includes(activity.status)) return 3;
  if (activity.status === "unknown") return 2;
  return activity.status === "queued" ? 1 : 0;
}

export function conversationSubtitle(
  thread: Thread,
  agents: Map<string, Agent>,
  activities: AgentActivity[],
  preview?: ConversationPreview,
) {
  const live = activities.reduce<AgentActivity | undefined>((current, activity) => {
    if (!thread.member_agent_ids.includes(activity.agent_id) || priority(activity) === 0)
      return current;
    return !current || priority(activity) > priority(current) ? activity : current;
  }, undefined);
  if (live) {
    const label = avatarActivity(live).label;
    const name = agents.get(live.agent_id)?.name;
    return thread.type === "group" && name ? `${name}: ${label}` : label;
  }
  const message = preview?.latest_message;
  if (!message) return "Belum ada pesan";
  const text = message.text || (message.has_attachments ? "Lampiran" : "Belum ada pesan");
  if (message.author === "user") return `Kamu: ${text}`;
  const name = message.author_agent_id ? agents.get(message.author_agent_id)?.name : undefined;
  return thread.type === "group" && name ? `${name}: ${text}` : text;
}
