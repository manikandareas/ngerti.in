import { conversationDateLabel, conversationDay } from "../lib/conversation-time";

export function ConversationDate({ at }: { at: string }) {
  const day = conversationDay(at);
  const label = conversationDateLabel(at);
  if (!day || !label) return null;
  return (
    <div className="conversation-date" data-conversation-date={day}>
      <time dateTime={day}>{label}</time>
    </div>
  );
}
