import type { WorkspaceEvent } from "@/lib/api-client";

export type Projection = "activity" | "previews" | "conversation" | "opening";

/** Refresh public projections rather than rendering raw internal event bodies. */
export function eventProjections(
  event: WorkspaceEvent,
  threadId: string | null,
  openingMessageId?: string | null,
) {
  const result = new Set<Projection>();
  const current =
    event.conversation_thread_id === threadId ||
    event.data.thread_id === threadId ||
    event.entity_id === threadId;
  if (event.entity_kind === "run") {
    result.add("activity");
    result.add("previews");
  }
  if (event.entity_kind === "message" && event.data.purpose !== "continuation")
    result.add("previews");
  if (["human_request", "peer_task"].includes(event.entity_kind)) result.add("activity");
  if (current && event.entity_kind !== "native_dispatch") result.add("conversation");
  // These resources are owner-scoped and expose their thread grants through
  // separate contextual APIs rather than a top-level event thread_id.
  if (
    [
      "browser_profile",
      "browser_session",
      "app_connection",
      "app_session",
      "skill",
      "skill_revision",
      "skill_assignment",
      "memory",
    ].includes(event.entity_kind)
  )
    result.add("conversation");
  if (["agent", "connection"].includes(event.entity_kind)) {
    result.add("conversation");
    result.add("activity");
    result.add("opening");
  }
  if (
    openingMessageId &&
    (event.data.input_message_id === openingMessageId || event.data.message_id === openingMessageId)
  )
    result.add("opening");
  return result;
}

export function mergeEntity<T extends { id: string; revision: number }>(
  current: T[],
  value: T,
): T[] {
  const previous = current.find((item) => item.id === value.id);
  if (previous && previous.revision >= value.revision) return current;
  return previous
    ? current.map((item) => (item.id === value.id ? value : item))
    : [...current, value];
}
