import { z } from "zod";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Groups } from "./service";

export function registerGroupTools(tools: ProductTools) {
  const groups = new Groups(tools.lifecycle);
  tools.register("ngertiin.group_read_task", {
    schema: productToolSchemas["ngertiin.group_read_task"],
    resources: () => [],
    execute: (raw, access) => {
      access.authorize();
      const data = raw as { task_id: string; offset: number };
      return groups.readTask(access.scope.run_id, data.task_id, data.offset);
    },
  });
  for (const name of ["ngertiin.group_handoff", "ngertiin.group_ask_user"] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: (raw, access) => {
        access.authorize();
        const { command_id, ...input } = raw as Record<string, unknown>;
        const run = tools.lifecycle.store.get("run", access.scope.run_id);
        return tools.lifecycle.store.command(
          z.uuid().parse(command_id),
          {
            operation: name,
            thread_id: run.thread_id,
            agent_id: run.agent_id,
            task_id: run.task_id,
            input,
          },
          () => {
            access.authorize();
            return name === "ngertiin.group_handoff"
              ? groups.handoff(run.id, input)
              : groups.askUser(run.id, input);
          },
        );
      },
    });
  }
}
