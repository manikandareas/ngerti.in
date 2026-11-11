import { request } from "@/lib/api-client";
import type { ConversationTimeline, Snapshot } from "@/types/workspace";

/** Export only published conversation data from the authenticated public timeline. */
export async function exportConversation(snapshot: Snapshot, signal: AbortSignal) {
  let timeline = snapshot.timeline;
  const messages = new Map(timeline.messages.map((message) => [message.id, message]));
  const order = new Map(timeline.parts.map((part) => [part.message_id, part.sequence]));
  const cursors = new Set<number>();
  while (timeline.has_more && timeline.next_before !== null) {
    const cursor = timeline.next_before;
    if (cursors.has(cursor))
      throw new Error("Riwayat belum dapat dimuat secara lengkap. Coba lagi.");
    cursors.add(cursor);
    timeline = await request<ConversationTimeline>(
      `/v1/threads/${snapshot.thread.id}/timeline?before=${cursor}&limit=100`,
      undefined,
      undefined,
      signal,
    );
    for (const message of timeline.messages) messages.set(message.id, message);
    for (const part of timeline.parts) order.set(part.message_id, part.sequence);
  }
  signal.throwIfAborted();
  return {
    version: 1,
    exported_at: new Date().toISOString(),
    conversation: {
      id: snapshot.thread.id,
      name: snapshot.thread.name,
      type: snapshot.thread.type,
    },
    messages: [...messages.values()]
      .filter((message) => message.state !== "deleted")
      .sort((a, b) => {
        const first = order.get(a.id);
        const second = order.get(b.id);
        return first !== undefined && second !== undefined
          ? first - second
          : a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id);
      })
      .map((message) => ({
        id: message.id,
        author: message.author,
        agent: snapshot.agents.find((agent) => agent.id === message.author_agent_id)?.name ?? null,
        text: message.text,
        created_at: message.created_at,
        attachment_ids: message.artifact_ids,
      })),
  };
}
