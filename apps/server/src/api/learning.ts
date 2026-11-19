import type { Elysia } from "elysia";
import { z } from "zod";
import type { Background } from "../background";
import type { Applications } from "../integrations/service";
import { ApplicationSkills } from "../learning/application-skills";
import {
  learningContext,
  memoryDelete,
  memoryWrite,
  optionalSkillInstall,
  skillAssign,
  skillConsolidationRequest,
  skillCreate,
  skillMaintenanceAction,
  skillRead,
  skillRevise,
  teamSkillPublication,
} from "../learning/contracts";
import { SkillCurator } from "../learning/curator";
import { ExternalMemory } from "../learning/external-memory";
import { externalMemoryChange } from "../learning/external-memory-contracts";
import { Memories } from "../learning/memories";
import { optionalSkills } from "../learning/optional-skills";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerLearningRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  applications: Applications,
  command: Command,
) {
  const memories = new Memories(lifecycle);
  const skills = new ApplicationSkills(lifecycle);
  const curator = new SkillCurator(lifecycle);
  const externalMemory = new ExternalMemory(lifecycle);
  return api
    .get("/v1/learning/external-memory", async () => await externalMemory.status())
    .post(
      "/v1/learning/external-memory",
      async ({ request, body }) => await command(request, body, () => externalMemory.change(body)),
      { body: externalMemoryChange },
    )
    .post(
      "/v1/learning/reviews/:id/stop",
      async ({ request, params, body }) => {
        const cancelled = await command(request, body, () =>
          background.cancelLearningReview(params.id),
        );
        // Interrupt the native request only after the cancellation receipt has committed.
        background.interruptCancelledLearningReview(params.id);
        return cancelled;
      },
      { params: z.object({ id: z.uuid() }), body: z.strictObject({}) },
    )
    .post(
      "/v1/data/team-agents/:id/skills/publish",
      async ({ request, params, body }) =>
        command(request, body, () => skills.publishTeam(params.id, body)),
      { params: z.object({ id: z.uuid() }), body: teamSkillPublication },
    )
    .post(
      "/v1/data/team-agents/:id/skills/assign",
      async ({ request, params, body }) =>
        command(request, body, () => skills.assignTeam(params.id, body)),
      { params: z.object({ id: z.uuid() }), body: skillAssign },
    )
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
      async ({ query }) => {
        const inventory = await skills.inventory(query, true);
        const { thread } = await skills.context(query);
        if (thread.purpose !== "conversation") return { ...inventory, optional: [] };
        const actions = await applications.hasEnabledTools(query);
        return {
          ...inventory,
          optional: optionalSkills.map((entry) => {
            const installed = inventory.application.find(
              (skill) => skill.distribution === "optional" && skill.name === entry.name,
            );
            return {
              name: entry.name,
              description: entry.package.description,
              setup: entry.setup,
              app_actions_available: actions,
              installed_skill_id: installed?.id ?? null,
              enabled: Boolean(installed?.assignment?.enabled),
            };
          }),
        };
      },
      { query: learningContext },
    )
    .post(
      "/v1/learning/skills/install",
      async ({ request, body }) =>
        await command(request, body, () => skills.installOptional(body.context, body.name)),
      { body: optionalSkillInstall },
    )
    .post(
      "/v1/learning/skills/review-library",
      async ({ request, body }) =>
        await command(request, body, () => curator.review(new Date(), body)),
      { body: learningContext },
    )
    .post(
      "/v1/learning/skills/maintenance",
      async ({ request, body }) => await command(request, body, () => curator.control(body)),
      { body: skillMaintenanceAction },
    )
    .post(
      "/v1/learning/skills/consolidate",
      async ({ request, body }) => {
        const { context, ...pair } = body;
        const result = await command(request, body, async () => {
          const { target, source } = await skills.consolidationPair(context, pair);
          return await lifecycle.admit(
            {
              ...context,
              text: `Consolidate my personal skills “${target.skill.name}” (version ${pair.target.version}) and “${source.skill.name}” (version ${pair.source.version}). Read both exact versions first. Keep the proven steps from both and remove duplicate instructions. Preserve distinct input requirements and output formats as separate cases. Keep the source categories, thresholds, and processing rules. Leave undefined cases open for clarification. Save the result as one new revision of “${target.skill.name}”. Keep the other skill, active versions, and Routines as they are. Briefly describe the changes after the new revision is saved.`,
            },
            "user",
            { skillConsolidation: pair },
          );
        });
        background.notifyAdmission(result.run.thread_id, result.run.agent_id);
        await background.notifyControls();
        return { ...result, control: null };
      },
      { body: skillConsolidationRequest },
    )
    .post(
      "/v1/learning/skills/read",
      async ({ body }) =>
        await skills.read(body.context, { skill_id: body.skill_id, version: body.version }, true),
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
