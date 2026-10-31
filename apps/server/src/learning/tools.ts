import { z } from "zod";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools, ToolAccess } from "../harness/tools";
import { ApplicationSkills } from "./application-skills";
import type { LearningContext } from "./contracts";
import { Memories } from "./memories";

export function registerLearningTools(tools: ProductTools) {
  const memories = new Memories(tools.lifecycle);
  const skills = new ApplicationSkills(tools.lifecycle);
  const context = ({ scope, authorize }: ToolAccess): LearningContext => {
    authorize();
    return { agent_id: scope.agent_id, thread_id: scope.thread_id };
  };
  for (const name of [
    "ngertiin.list_memories",
    "ngertiin.write_memory",
    "ngertiin.delete_memory",
    "ngertiin.list_skills",
    "ngertiin.read_skill",
    "ngertiin.read_harness_skill",
    "ngertiin.create_skill",
    "ngertiin.revise_skill",
    "ngertiin.assign_skill",
  ] as const) {
    tools.register(name, {
      schema: productToolSchemas[name],
      resources: () => [],
      execute: (raw, access) => {
        const lane = context(access);
        const data = raw as Record<string, unknown>;
        if (name === "ngertiin.list_memories") return memories.recall(lane, data);
        if (name === "ngertiin.list_skills") return skills.inventory(lane);
        if (name === "ngertiin.read_skill") return skills.read(lane, data);
        if (name === "ngertiin.read_harness_skill")
          return skills.readHarness(lane, data.key as string);
        const { command_id: commandId, ...input } = data;
        // Scope is part of the fingerprint. A global receipt cannot be replayed in another thread.
        return tools.lifecycle.store.command(
          z.uuid().parse(commandId),
          { operation: name, ...lane, input },
          () => {
            access.authorize();
            if (name === "ngertiin.write_memory")
              return memories.write(lane, input, access.scope.run_id);
            if (name === "ngertiin.delete_memory")
              return memories.remove(lane, input, access.scope.run_id);
            if (name === "ngertiin.create_skill")
              return skills.create(lane, input, access.scope.run_id);
            if (name === "ngertiin.revise_skill")
              return skills.revise(lane, input, access.scope.run_id);
            return skills.assign(lane, input);
          },
        );
      },
    });
  }
}
