/** Native-output fixtures must publish the same timeline parts as the real API. */
export function withTimeline<T extends Record<string, unknown>>(value: T, published?: unknown[]) {
  if (!Array.isArray(value.messages)) return value;
  const messages = (published ?? value.messages) as Record<string, unknown>[];
  const agents = (value.agents ?? []) as Record<string, unknown>[];
  return {
    ...value,
    timeline: {
      has_more: false,
      next_before: null,
      messages,
      parts: messages.map((message, index) => {
        const actor = agents.find((agent) => agent.id === message.author_agent_id);
        return {
          id: `fixture-part:${message.id}`,
          sequence: index + 1,
          source_cursor: value.cursor,
          thread_id: message.thread_id,
          created_at: message.created_at,
          kind: "message",
          message_id: message.id,
          resource_id: null,
          source_message_id: null,
          name: "",
          summary: null,
          actors: actor
            ? [
                {
                  id: actor.id,
                  name: actor.name,
                  handle: actor.handle ?? null,
                  avatar_config: actor.avatar_config ?? null,
                },
              ]
            : [],
        };
      }),
    },
  };
}
