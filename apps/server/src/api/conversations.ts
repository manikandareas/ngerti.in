import type { Elysia } from "elysia";
import { z } from "zod";
import { agentInput, agentUpdate, id, threadInput } from "../contracts";
import { Conversations, historyQuery } from "../conversations";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerConversationRoutes(api: Elysia, lifecycle: Lifecycle, command: Command) {
  const conversations = new Conversations(lifecycle);
  return api
    .post("/v1/setup", ({ request, body }) => command(request, body, () => conversations.setup()), {
      body: z.strictObject({}),
    })
    .get("/v1/threads/:id/snapshot", ({ params }) => conversations.snapshot(params.id), {
      params: z.object({ id }),
    })
    .get(
      "/v1/threads/:id/history",
      ({ params, query }) => conversations.history(params.id, query),
      { params: z.object({ id }), query: historyQuery },
    )
    .post(
      "/v1/agents",
      ({ request, body }) => command(request, body, () => lifecycle.create("agent", body)),
      { body: agentInput },
    )
    .post(
      "/v1/agents/:id/configuration",
      ({ request, params, body }) =>
        command(request, body, () => lifecycle.updateAgent(params.id, body)),
      { params: z.object({ id }), body: agentUpdate },
    )
    .post(
      "/v1/agents/:id/dm",
      ({ request, params, body }) =>
        command(request, body, () =>
          lifecycle.create("thread", { type: "dm", member_agent_ids: [params.id] }),
        ),
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/threads",
      ({ request, body }) => command(request, body, () => lifecycle.create("thread", body)),
      { body: threadInput },
    );
}
