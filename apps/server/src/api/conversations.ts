import type { Elysia } from "elysia";
import { z } from "zod";
import { readAgentActivities } from "../agents/activity";
import { cloneProfile, portableProfile, profileExport } from "../agents/profile-contracts";
import { AgentProfiles } from "../agents/profiles";
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
import { ConversationSearch } from "../conversations/search";
import { historySearchInput } from "../conversations/search-contracts";
import { outputPluginInput } from "../integrations/output-plugin-contracts";
import { OutputPlugins } from "../integrations/output-plugins";
import { learningContext } from "../learning/contracts";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerConversationRoutes(api: Elysia, lifecycle: Lifecycle, command: Command) {
  const conversations = new Conversations(lifecycle);
  const history = new ConversationSearch(lifecycle);
  const creation = new Creation(lifecycle);
  const profiles = new AgentProfiles(lifecycle);
  const outputPlugins = new OutputPlugins(lifecycle);
  return api
    .get("/v1/agents/activity", async () => await readAgentActivities(lifecycle.store))
    .get("/v1/conversations/previews", async () => await readConversationPreviews(lifecycle.store))
    .get(
      "/v1/conversations/history/search",
      async ({ query: { thread_id, agent_id, ...input } }) =>
        await history.search({ thread_id, agent_id }, input),
      {
        query: learningContext.extend({
          query: historySearchInput.shape.query,
          limit: z.coerce.number().int().min(1).max(8).default(4),
        }),
      },
    )
    .get(
      "/v1/conversations/history/source",
      async ({ query: { thread_id, agent_id, source_thread_id, message_id } }) =>
        await history.source({ thread_id, agent_id }, { thread_id: source_thread_id, message_id }),
      { query: learningContext.extend({ source_thread_id: id, message_id: id }) },
    )
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
    .get("/v1/threads/:id/output-plugins", ({ params }) => outputPlugins.list(params.id), {
      params: z.object({ id }),
    })
    .post(
      "/v1/threads/:id/output-plugins",
      ({ request, params, body }) =>
        command(request, { ...body, thread_id: params.id }, () =>
          outputPlugins.set(params.id, body),
        ),
      { params: z.object({ id }), body: outputPluginInput },
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
      "/v1/profiles/import",
      ({ request, body }) => command(request, body, () => profiles.install(body)),
      { body: portableProfile },
    )
    .get("/v1/threads/:id/profile", ({ params, query }) => profiles.export(params.id, query.mode), {
      params: z.object({ id }),
      query: profileExport,
    })
    .post(
      "/v1/threads/:id/clone-profile",
      ({ request, body, params }) =>
        command(request, { ...body, thread_id: params.id }, () => profiles.clone(params.id, body)),
      { params: z.object({ id }), body: cloneProfile },
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
      "/v1/threads/:id/new-dm",
      async ({ request, params, body }) =>
        await command(request, { ...body, thread_id: params.id }, async () =>
          lifecycle.openNewDm(params.id),
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
