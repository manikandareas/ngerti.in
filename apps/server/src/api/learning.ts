import type { Elysia } from "elysia";
import { z } from "zod";
import { ApplicationSkills } from "../learning/application-skills";
import {
  learningContext,
  memoryDelete,
  memoryWrite,
  skillAssign,
  skillCreate,
  skillRead,
  skillRevise,
} from "../learning/contracts";
import { Memories } from "../learning/memories";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerLearningRoutes(api: Elysia, lifecycle: Lifecycle, command: Command) {
  const memories = new Memories(lifecycle);
  const skills = new ApplicationSkills(lifecycle);
  return api
    .get(
      "/v1/learning/memories",
      async ({ query }) =>
        await memories.recall(
          { agent_id: query.agent_id, thread_id: query.thread_id },
          {
            query: query.query ?? "",
            include_deleted: query.include_deleted === "true",
            after: query.after ?? null,
            limit: query.limit ?? 50,
          },
        ),
      {
        query: learningContext.extend({
          query: z.string().max(1000).optional(),
          include_deleted: z.enum(["true", "false"]).optional(),
          after: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      },
    )
    .post(
      "/v1/learning/memories/write",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { context, ...input } = body;
          return await memories.write(context, input);
        }),
      { body: memoryWrite.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/memories/delete",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { context, ...input } = body;
          return await memories.remove(context, input);
        }),
      { body: memoryDelete.extend({ context: learningContext }) },
    )
    .get(
      "/v1/learning/skills",
      async ({ query }) =>
        await skills.inventory({ agent_id: query.agent_id, thread_id: query.thread_id }),
      { query: learningContext },
    )
    .post(
      "/v1/learning/skills/read",
      async ({ body }) =>
        await skills.read(body.context, { skill_id: body.skill_id, version: body.version }),
      { body: skillRead.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/create",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { context, ...input } = body;
          return await skills.create(context, input);
        }),
      { body: skillCreate.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/revise",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { context, ...input } = body;
          return await skills.revise(context, input);
        }),
      { body: skillRevise.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/assign",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { context, ...input } = body;
          return await skills.assign(context, input);
        }),
      { body: skillAssign.extend({ context: learningContext }) },
    );
}
