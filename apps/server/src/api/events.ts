import type { Elysia } from "elysia";
import { z } from "zod";
import { id, kindSchema } from "../contracts";
import { conversationEvent } from "../conversations/projection";
import { eventStream } from "../event-stream";
import type { Lifecycle } from "../lifecycle";
import { asyncMap } from "../persistence/async-collections";

export function registerEventRoutes(api: Elysia, lifecycle: Lifecycle) {
  return api
    .get("/v1/entities/:kind", async ({ params }) => await lifecycle.store.list(params.kind), {
      params: z.object({ kind: kindSchema }),
    })
    .get(
      "/v1/entities/:kind/:id",
      async ({ params }) => await lifecycle.store.get(params.kind, params.id),
      {
        params: z.object({ kind: kindSchema, id }),
      },
    )
    .get(
      "/v1/events/stream",
      ({ request, query }) =>
        eventStream(
          lifecycle.store,
          z.coerce
            .number()
            .int()
            .min(0)
            .parse(request.headers.get("Last-Event-ID") ?? query.after),
          request.signal,
        ),
      { query: z.object({ after: z.coerce.number().int().min(0).default(0) }) },
    )
    .get(
      "/v1/events",
      async ({ query }) => {
        const events = await asyncMap(
          await lifecycle.store.events(query.after, query.limit),
          async (event) => await conversationEvent(lifecycle.store, event),
        );
        return { events, next_cursor: events.at(-1)?.cursor ?? query.after };
      },
      {
        query: z.object({
          after: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(1000).default(100),
        }),
      },
    );
}
