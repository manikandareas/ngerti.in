import type { Elysia } from "elysia";
import { z } from "zod";
import { readAgentActivities } from "../agents/activity";
import { agentInput, agentUpdate, id, threadInput } from "../contracts";
import { Conversations, historyQuery } from "../conversations";
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
    .get("/v1/agents/activity", () => readAgentActivities(lifecycle.store))
    .get("/v1/conversations/previews", () => readConversationPreviews(lifecycle.store))
    .get("/v1/threads/:id/opening", ({ params }) => openingState(lifecycle, params.id), {
      params: z.object({ id }),
    })
    .post(
      "/v1/threads/:id/opening/retry",
      ({ request, params, body }) =>
        command(request, body, () => retryOpening(lifecycle, params.id, body.expected_run_id)),
      { params: z.object({ id }), body: z.strictObject({ expected_run_id: id }) },
    )
    .post(
      "/v1/creation/agents",
      ({ request, body }) => creation.agent(id.parse(request.headers.get("Idempotency-Key")), body),
      { body: createAgentConversation },
    )
    .post(
      "/v1/creation/groups",
      ({ request, body }) => creation.group(id.parse(request.headers.get("Idempotency-Key")), body),
      { body: createGroupConversation },
    )
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
