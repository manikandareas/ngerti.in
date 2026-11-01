import type { Elysia } from "elysia";
import { z } from "zod";
import { id, kindSchema } from "../contracts";
import { eventStream } from "../event-stream";
import type { Lifecycle } from "../lifecycle";

export function registerEventRoutes(api: Elysia, lifecycle: Lifecycle) {
  return api
    .get("/v1/entities/:kind", ({ params }) => lifecycle.store.list(params.kind), {
      params: z.object({ kind: kindSchema }),
    })
    .get("/v1/entities/:kind/:id", ({ params }) => lifecycle.store.get(params.kind, params.id), {
      params: z.object({ kind: kindSchema, id }),
    })
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
      ({ query }) => {
        const events = lifecycle.store.events(query.after, query.limit);
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
