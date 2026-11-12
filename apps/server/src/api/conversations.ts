import type { Elysia } from "elysia";
import { z } from "zod";
import { readAgentActivities } from "../agents/activity";
import { agentInput, agentUpdate, id, threadInput } from "../contracts";
import { Conversations, historyQuery, timelineQuery } from "../conversations";
import {
  Creation,
  createAgentConversation,
  createGroupConversation,
  openingState,
  retryOpening,
} from "../conversations/creation";
import { readConversationPreviews } from "../conversations/previews";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerConversationRoutes(api: Elysia, lifecycle: Lifecycle, command: Command) {
  const conversations = new Conversations(lifecycle);
  const creation = new Creation(lifecycle);
  return api
    .get("/v1/agents/activity", async () => await readAgentActivities(lifecycle.store))
    .get("/v1/conversations/previews", async () => await readConversationPreviews(lifecycle.store))
    .get(
      "/v1/threads/:id/opening",
      async ({ params }) => await openingState(lifecycle, params.id),
      {
        params: z.object({ id }),
      },
    )
    .post(
      "/v1/threads/:id/opening/retry",
      async ({ request, params, body }) =>
        await command(
          request,
          body,
          async () => await retryOpening(lifecycle, params.id, body.expected_run_id),
        ),
      { params: z.object({ id }), body: z.strictObject({ expected_run_id: id }) },
    )
    .post(
      "/v1/creation/agents",
      async ({ request, body }) =>
        await creation.agent(id.parse(request.headers.get("Idempotency-Key")), body),
      { body: createAgentConversation },
    )
    .post(
      "/v1/creation/groups",
      async ({ request, body }) =>
        await creation.group(id.parse(request.headers.get("Idempotency-Key")), body),
      { body: createGroupConversation },
    )
    .post(
      "/v1/setup",
      async ({ request, body }) =>
        await command(request, body, async () => await conversations.setup()),
      {
        body: z.strictObject({}),
      },
    )
    .get(
      "/v1/threads/:id/snapshot",
      async ({ params }) => await conversations.snapshot(params.id),
      {
        params: z.object({ id }),
      },
    )
    .get(
      "/v1/threads/:id/history",
      async ({ params, query }) => await conversations.history(params.id, query),
      { params: z.object({ id }), query: historyQuery },
    )
    .get(
      "/v1/threads/:id/timeline",
      async ({ params, query }) => await conversations.timeline(params.id, query),
      {
        params: z.object({ id }),
        query: timelineQuery,
      },
    )
    .post(
      "/v1/agents",
      async ({ request, body }) =>
        await command(request, body, async () => await lifecycle.create("agent", body)),
      { body: agentInput },
    )
    .post(
      "/v1/agents/:id/configuration",
      async ({ request, params, body }) =>
        await command(request, body, async () => await lifecycle.updateAgent(params.id, body)),
      { params: z.object({ id }), body: agentUpdate },
    )
    .post(
      "/v1/agents/:id/dm",
      async ({ request, params, body }) =>
        await command(
          request,
          body,
          async () =>
            await lifecycle.create("thread", { type: "dm", member_agent_ids: [params.id] }),
        ),
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/threads",
      async ({ request, body }) =>
        await command(request, body, async () => await lifecycle.create("thread", body)),
      { body: threadInput },
    );
}
