import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Goals } from "./service";

export function registerGoalTools(tools: ProductTools) {
  const goals = new Goals(tools.lifecycle);
  tools.register("ngertiin.list_goals", {
    schema: productToolSchemas["ngertiin.list_goals"],
    resources: () => [],
    execute: (_input, access) => {
      access.authorize();
      return goals.list(access.scope);
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
      execute: (raw, access) => {
        access.authorize();
        const { command_id, ...input } = raw as Record<string, unknown> & { command_id: string };
        return tools.lifecycle.store.command(
          command_id,
          {
            operation: name,
            thread_id: access.scope.thread_id,
            agent_id: access.scope.agent_id,
            run_id: access.scope.run_id,
            input,
          },
          () => {
            access.authorize();
            switch (name) {
              case "ngertiin.capture_goal":
                return goals.capture(access.scope.run_id, input);
              case "ngertiin.report_goal":
                return goals.report(access.scope.run_id, input);
              case "ngertiin.assign_goal":
                return goals.assign(access.scope, input);
              case "ngertiin.control_goal":
                return goals.control(access.scope, input);
              case "ngertiin.write_routine":
                return goals.writeRoutine(access.scope.run_id, input);
              case "ngertiin.control_routine":
                return goals.controlRoutine(access.scope, input);
              case "ngertiin.routine_no_update":
                return goals.noUpdate(access.scope.run_id);
            }
          },
        );
      },
    });
  }
}
