import type { ConversationPart, Message } from "@/types/workspace";
import { conversationDay } from "./conversation-time";

export type ConversationEntry =
  | { type: "message"; part: ConversationPart; message: Message }
  | { type: "activity"; parts: ConversationPart[] };

/** Publication sequence is authoritative; grouping never crosses a conversational message. */
export function conversationEntries(parts: ConversationPart[], messages: Message[]) {
  const entries: ConversationEntry[] = [];
  const byId = new Map(messages.map((message) => [message.id, message]));
  const ordered = [...new Map(parts.map((part) => [part.id, part])).values()].sort(
    (a, b) => a.sequence - b.sequence,
  );
  for (const part of ordered) {
    if (part.kind === "message") {
      const message = part.message_id ? byId.get(part.message_id) : undefined;
      if (
        message &&
        message.state !== "deleted" &&
        !["continuation", "handoff", "review"].includes(message.purpose)
      )
        entries.push({ type: "message", part, message });
    } else {
      const last = entries.at(-1);
      if (
        last?.type === "activity" &&
        last.parts[0].kind === part.kind &&
        conversationDay(last.parts[0].created_at) === conversationDay(part.created_at) &&
        !part.kind.startsWith("routine_") &&
        !["handoff_requested", "handoff_failed", "goal_blocked"].includes(part.kind)
      )
        last.parts.push(part);
      else entries.push({ type: "activity", parts: [part] });
    }
  }
  return entries;
}
