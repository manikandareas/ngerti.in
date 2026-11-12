import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Goals } from "./service";

export function registerGoalTools(tools: ProductTools) {
  const goals = new Goals(tools.lifecycle);
  tools.register("ngertiin.list_goals", {
    schema: productToolSchemas["ngertiin.list_goals"],
    resources: () => [],
    execute: async (_input, access) => {
      await access.authorize();
      return await goals.list(access.scope);
    },
  });
  for (const name of [
    "ngertiin.capture_goal",
    "ngertiin.report_goal",
    "ngertiin.control_goal",
    "ngertiin.assign_goal",
    "ngertiin.write_routine",
    "ngertiin.control_routine",
    "ngertiin.routine_no_update",
  ] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: async (raw, access) => {
        await access.authorize();
        const { command_id, ...input } = raw as Record<string, unknown> & { command_id: string };
        return await tools.lifecycle.store.command(
          command_id,
          {
            operation: name,
            thread_id: access.scope.thread_id,
            agent_id: access.scope.agent_id,
            run_id: access.scope.run_id,
            input,
          },
          async () => {
            await access.authorize();
            switch (name) {
              case "ngertiin.capture_goal":
                return await goals.capture(access.scope.run_id, input);
              case "ngertiin.report_goal":
                return await goals.report(access.scope.run_id, input);
              case "ngertiin.assign_goal":
                return await goals.assign(access.scope, input);
              case "ngertiin.control_goal":
                return await goals.control(access.scope, input);
              case "ngertiin.write_routine":
                return await goals.writeRoutine(access.scope.run_id, input);
              case "ngertiin.control_routine":
                return await goals.controlRoutine(access.scope, input);
              case "ngertiin.routine_no_update":
                return await goals.noUpdate(access.scope.run_id);
            }
          },
        );
      },
    });
  }
}
