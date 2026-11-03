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
      ({ params, query }) => goals.list({ thread_id: params.id, agent_id: query.agent_id ?? null }),
      { params: z.object({ id }), query: z.strictObject({ agent_id: id.optional() }) },
    )
    .post(
      "/v1/goals/:id/assignment",
      ({ request, params, body }) =>
        command(request, body, () => {
          const goal = lifecycle.store.get("goal", params.id);
          return goals.assign(
            { thread_id: goal.thread_id, agent_id: null },
            { ...body, goal_id: params.id },
          );
        }),
      { params: z.object({ id }), body: goalAssignment.omit({ goal_id: true }) },
    )
    .post(
      "/v1/goals/:id/recover-completion",
      ({ request, params, body }) =>
        command(request, body, () => goals.recoverCompletion(params.id, body)),
      { params: z.object({ id }), body: completionRecovery },
    )
    .post(
      "/v1/goals/capture",
      ({ request, body }) =>
        command(request, body, () => {
          const { run_id, ...input } = body;
          return goals.capture(run_id, input);
        }),
      { body: captureGoal.extend({ run_id: id }) },
    )
    .post(
      "/v1/goals/:id/progress",
      ({ request, params, body }) =>
        command(request, body, () => {
          const { run_id, ...input } = body;
          return goals.report(run_id, { ...input, goal_id: params.id });
        }),
      {
        params: z.object({ id }),
        body: z.strictObject({ ...reportGoal.shape, run_id: id }).omit({ goal_id: true }),
      },
    )
    .post(
      "/v1/routines/write",
      ({ request, body }) =>
        command(request, body, () => {
          const { run_id, ...input } = body;
          return goals.writeRoutine(run_id, input);
        }),
      { body: routineWrite.extend({ run_id: id }) },
    )
    .post(
      "/v1/routines/:id/control",
      ({ request, params, body }) => {
        const result = command(request, body, () => {
          const routine = lifecycle.store.get("routine", params.id);
          return goals.controlRoutine(routine, { ...body, routine_id: params.id });
        });
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: routineControl.omit({ routine_id: true }) },
    )
    .post(
      "/v1/goals",
      ({ request, body }) => command(request, body, () => lifecycle.create("goal", body)),
      { body: goalInput },
    )
    .post(
      "/v1/routines",
      ({ request, body }) => command(request, body, () => lifecycle.create("routine", body)),
      { body: routineInput },
    )
    .post(
      "/v1/goals/:id/control",
      ({ request, params, body }) => {
        const result = command(request, body, () => lifecycle.controlGoal(params.id, body.state));
        background.notifyControls();
        return result;
      },
      {
        params: z.object({ id }),
        body: z.strictObject({ state: z.enum(["active", "paused", "stopped"]) }),
      },
    );
}
