import type { WorkspaceEvent } from "@/lib/api-client";
import type { Snapshot } from "@/types/workspace";
import { message as messageSchema } from "../../../server/src/conversations/contracts";
import { run as runSchema } from "../../../server/src/runs/contracts";
import { mergeEntity } from "./workspace-events";

export function applyConversationEvent(snapshot: Snapshot, event: WorkspaceEvent): Snapshot | null {
  if (event.data.thread_id !== snapshot.thread.id) return null;
  if (event.entity_kind === "run") {
    const result = runSchema.safeParse(event.data);
    if (!result.success) return null;
    return {
      ...snapshot,
      cursor: Math.max(snapshot.cursor, event.cursor),
      runs: mergeEntity(snapshot.runs, result.data),
    };
  }
  if (
    event.entity_kind !== "message" ||
    ["continuation", "handoff", "review"].includes(event.data.purpose ?? "")
  )
    return null;
  const result = messageSchema.safeParse(event.data);
  if (!result.success) return null;
  const message = result.data;
  const part = event.conversation_part;
  if (!part && !snapshot.timeline.messages.some((item) => item.id === message.id)) return null;
  if (part && (part.thread_id !== snapshot.thread.id || part.message_id !== message.id))
    return null;
  return {
    ...snapshot,
    cursor: Math.max(snapshot.cursor, event.cursor),
    messages: mergeEntity(snapshot.messages, message),
    timeline: {
      ...snapshot.timeline,
      messages: mergeEntity(snapshot.timeline.messages, message),
      parts:
        part && !snapshot.timeline.parts.some((item) => item.id === part.id)
          ? [...snapshot.timeline.parts, part].sort((a, b) => a.sequence - b.sequence)
          : snapshot.timeline.parts,
    },
  };
}

export function reconcileConversationSnapshot(fresh: Snapshot, current?: Snapshot): Snapshot {
  if (!current || current.thread.id !== fresh.thread.id || current.cursor <= fresh.cursor)
    return fresh;
  return {
    ...fresh,
    cursor: current.cursor,
    messages: current.messages.reduce(mergeEntity, fresh.messages),
    runs: current.runs.reduce(mergeEntity, fresh.runs),
    timeline: {
      ...fresh.timeline,
      messages: current.timeline.messages.reduce(mergeEntity, fresh.timeline.messages),
      parts: [
        ...fresh.timeline.parts,
        ...current.timeline.parts.filter(
          (part) =>
            part.source_cursor > fresh.cursor &&
            !fresh.timeline.parts.some((item) => item.id === part.id),
        ),
      ].sort((a, b) => a.sequence - b.sequence),
    },
  };
}
