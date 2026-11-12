import type { Elysia } from "elysia";
import { z } from "zod";
import type { Background } from "../background";
import { goalInput, id, routineInput } from "../contracts";
import {
  captureGoal,
  completionRecovery,
  goalAssignment,
  reportGoal,
  routineControl,
  routineWrite,
} from "../goals/contracts";
import { Goals } from "../goals/service";
import type { Lifecycle } from "../lifecycle";
import type { Command } from "./services";

export function registerGoalRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  command: Command,
) {
  const goals = new Goals(lifecycle);
  return api
    .get(
      "/v1/threads/:id/goals",
      async ({ params, query }) =>
        await goals.list({ thread_id: params.id, agent_id: query.agent_id ?? null }),
      { params: z.object({ id }), query: z.strictObject({ agent_id: id.optional() }) },
    )
    .post(
      "/v1/goals/:id/assignment",
      async ({ request, params, body }) =>
        await command(request, body, async () => {
          const goal = await lifecycle.store.get("goal", params.id);
          return await goals.assign(
            { thread_id: goal.thread_id, agent_id: null },
            { ...body, goal_id: params.id },
          );
        }),
      { params: z.object({ id }), body: goalAssignment.omit({ goal_id: true }) },
    )
    .post(
      "/v1/goals/:id/recover-completion",
      async ({ request, params, body }) =>
        await command(request, body, async () => await goals.recoverCompletion(params.id, body)),
      { params: z.object({ id }), body: completionRecovery },
    )
    .post(
      "/v1/goals/capture",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { run_id, ...input } = body;
          return await goals.capture(run_id, input);
        }),
      { body: captureGoal.extend({ run_id: id }) },
    )
    .post(
      "/v1/goals/:id/progress",
      async ({ request, params, body }) =>
        await command(request, body, async () => {
          const { run_id, ...input } = body;
          return await goals.report(run_id, { ...input, goal_id: params.id });
        }),
      {
        params: z.object({ id }),
        body: z.strictObject({ ...reportGoal.shape, run_id: id }).omit({ goal_id: true }),
      },
    )
    .post(
      "/v1/routines/write",
      async ({ request, body }) =>
        await command(request, body, async () => {
          const { run_id, ...input } = body;
          return await goals.writeRoutine(run_id, input);
        }),
      { body: routineWrite.extend({ run_id: id }) },
    )
    .post(
      "/v1/routines/:id/control",
      async ({ request, params, body }) => {
        const result = await command(request, body, async () => {
          const routine = await lifecycle.store.get("routine", params.id);
          return await goals.controlRoutine(routine, { ...body, routine_id: params.id });
        });
        await background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: routineControl.omit({ routine_id: true }) },
    )
    .post(
      "/v1/goals",
      async ({ request, body }) =>
        await command(request, body, async () => await lifecycle.create("goal", body)),
      { body: goalInput },
    )
    .post(
      "/v1/routines",
      async ({ request, body }) =>
        await command(request, body, async () => await lifecycle.create("routine", body)),
      { body: routineInput },
    )
    .post(
      "/v1/goals/:id/control",
      async ({ request, params, body }) => {
        const result = await command(
          request,
          body,
          async () => await lifecycle.controlGoal(params.id, body.state),
        );
        await background.notifyControls();
        return result;
      },
      {
        params: z.object({ id }),
        body: z.strictObject({ state: z.enum(["active", "paused", "stopped"]) }),
      },
    );
}
