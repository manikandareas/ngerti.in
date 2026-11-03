import type { DomainEvent, Entity } from "../contracts";
import type { Store } from "../store";

export function conversationMessage(store: Store, message: Entity<"message">) {
  if (["handoff", "review"].includes(message.purpose)) {
    const task = store.list("peer_task").find((task) => task.request_message_id === message.id);
    return { ...message, text: task?.summary ?? "", artifact_ids: [] };
  }
  return message;
}

/** Public event cursors retain chronology without broadcasting internal instruction bodies. */
export function conversationEvent(store: Store, event: DomainEvent): DomainEvent {
  if ("thread_id" in event.data && typeof event.data.thread_id === "string") {
    const thread = store.get("thread", event.data.thread_id);
    if (thread.purpose === "routing" && thread.group_thread_id)
      event = { ...event, conversation_thread_id: thread.group_thread_id };
  }
  if (event.data.kind !== "message") return event;
  const message = event.data;
  const internal =
    message.purpose === "continuation" ||
    store.get("thread", message.thread_id).purpose === "routing";
  return {
    ...event,
    data: internal
      ? { ...message, text: "[Internal execution input]", artifact_ids: [] }
      : conversationMessage(store, message),
  };
}
