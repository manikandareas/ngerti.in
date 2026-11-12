import { z } from "zod";
import { id, message } from "../contracts";
import type { Store } from "../store";

const latestMessage = z.strictObject({
  id,
  text: z.string().max(240),
  author: message.shape.author,
  author_agent_id: id.nullable(),
  has_attachments: z.boolean(),
});
export const conversationPreviews = z.strictObject({
  cursor: z.int().nonnegative(),
  items: z.array(z.strictObject({ thread_id: id, latest_message: latestMessage.nullable() })),
});

/** Read one visible message excerpt per owner conversation without opening native sessions. */
export async function readConversationPreviews(
  store: Store,
): Promise<z.infer<typeof conversationPreviews>> {
  return await store.transaction(async () => {
    const latest = new Map<string, z.infer<typeof latestMessage>>();
    for (const current of await store.list("message")) {
      if (
        current.state === "deleted" ||
        ["continuation", "handoff", "review"].includes(current.purpose)
      )
        continue;
      const text = current.text
        .replace(/\[((?:\\.|[^\]\\])*)\]\(ngertiin:\/\/[^\s)]+\)/g, (_, label: string) =>
          label.replace(/\\(.)/g, "$1"),
        )
        .replace(/\s+/g, " ")
        .trim();
      if (!text && !current.artifact_ids.length) continue;
      latest.set(current.thread_id, {
        id: current.id,
        text: text.slice(0, 240),
        author: current.author,
        author_agent_id: current.author_agent_id,
        has_attachments: current.artifact_ids.length > 0,
      });
    }
    return {
      cursor: await store.cursor,
      items: (await store.list("thread"))
        .filter((thread) => thread.purpose === "conversation")
        .map((thread) => ({ thread_id: thread.id, latest_message: latest.get(thread.id) ?? null })),
    };
  });
}
