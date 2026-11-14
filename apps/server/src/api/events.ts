import type { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "../auth/service";
import { id, kindSchema } from "../contracts";
import { conversationEvent } from "../conversations/projection";
import { eventStream } from "../event-stream";
import type { Lifecycle } from "../lifecycle";
import { asyncMap } from "../persistence/async-collections";

export function registerEventRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  authentication?: Authentication,
) {
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
          authentication?.lease(request),
        ),
      { query: z.object({ after: z.coerce.number().int().min(0).default(0) }) },
    )
    .get(
      "/v1/events",
      async ({ query }) => {
        const page = await lifecycle.store.replay(query.after, { limit: query.limit });
        const events = await asyncMap(
          page.events,
          async (event) => await conversationEvent(lifecycle.store, event),
        );
        return { events, next_cursor: page.next_cursor };
      },
      {
        query: z.object({
          after: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(1000).default(100),
        }),
      },
    );
}
