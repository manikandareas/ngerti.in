import { conversationTime } from "../lib/conversation-time";

export function MessageTime({ at, className = "" }: { at?: string; className?: string }) {
  const time = conversationTime(at);
  if (!time) return null;
  return (
    <time className={`message-time ${className}`} dateTime={at} title={time.title}>
      {time.clock}
    </time>
  );
}
