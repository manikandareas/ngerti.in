import { z } from "zod";
import { Creation, type groupConfiguration } from "../conversations/creation";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";
import { Groups } from "./service";

export function registerGroupTools(tools: ProductTools) {
  const groups = new Groups(tools.lifecycle);
  tools.register("ngertiin.update_group", {
    schema: productToolSchemas["ngertiin.update_group"],
    resources: () => [],
    execute: async (raw, access) => {
      await access.authorize();
      const { command_id, ...input } = raw as z.infer<typeof groupConfiguration> & {
        command_id: string;
      };
      return await tools.lifecycle.store.command(
        command_id,
        {
          operation: "update_group",
          thread_id: access.scope.thread_id,
          actor_id: access.scope.agent_id,
          input,
        },
        async () => {
          await access.authorize();
          return await new Creation(tools.lifecycle).configureGroup(access.scope.thread_id, input);
        },
      );
    },
  });
  tools.register("ngertiin.group_read_task", {
    schema: productToolSchemas["ngertiin.group_read_task"],
    resources: () => [],
    execute: async (raw, access) => {
      await access.authorize();
      const data = raw as { task_id: string; offset: number };
      return await groups.readTask(access.scope.run_id, data.task_id, data.offset);
    },
  });
  for (const name of ["ngertiin.group_handoff", "ngertiin.group_ask_user"] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: async (raw, access) => {
        await access.authorize();
        const { command_id, ...input } = raw as Record<string, unknown>;
        const run = await tools.lifecycle.store.get("run", access.scope.run_id);
        return await tools.lifecycle.store.command(
          z.uuid().parse(command_id),
          {
            operation: name,
            thread_id: run.thread_id,
            agent_id: run.agent_id,
            task_id: run.task_id,
            input,
          },
          async () => {
            await access.authorize();
            return name === "ngertiin.group_handoff"
              ? await groups.handoff(run.id, input)
              : await groups.askUser(run.id, input);
          },
        );
      },
    });
  }
}
