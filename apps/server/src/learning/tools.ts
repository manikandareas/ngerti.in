import { z } from "zod";
import { ConversationSearch } from "../conversations/search";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools, ToolAccess } from "../harness/tools";
import { ApplicationSkills } from "./application-skills";
import type { LearningContext } from "./contracts";
import { ExternalMemory } from "./external-memory";
import { Memories } from "./memories";

export function registerLearningTools(tools: ProductTools) {
  const memories = new Memories(tools.lifecycle);
  const skills = new ApplicationSkills(tools.lifecycle);
  const history = new ConversationSearch(tools.lifecycle);
  const externalMemory = new ExternalMemory(tools.lifecycle);
  tools.register("ngertiin.recall_external_memory", {
    schema: productToolSchemas["ngertiin.recall_external_memory"],
    resources: () => [],
    execute: (input, access) => externalMemory.recall(input, access),
  });
  const context = async ({ scope, authorize }: ToolAccess): Promise<LearningContext> => {
    await authorize();
    return { agent_id: scope.agent_id, thread_id: scope.thread_id };
  };
  for (const name of [
    "ngertiin.list_memories",
    "ngertiin.search_history",
    "ngertiin.read_history",
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
      execute: async (raw, access) => {
        const lane = await context(access);
        const data = raw as Record<string, unknown>;
        if (name === "ngertiin.search_history") {
          const run = await tools.lifecycle.store.get("run", access.scope.run_id);
          return await history.search(lane, data, run.input_message_id);
        }
        if (name === "ngertiin.read_history") return await history.source(lane, data);
        if (name === "ngertiin.list_memories") return await memories.recall(lane, data);
        if (name === "ngertiin.list_skills") return await skills.inventory(lane);
        if (name === "ngertiin.read_skill") return await skills.readForTool(lane, data);
        if (name === "ngertiin.read_harness_skill")
          return await skills.readHarness(lane, data.key as string);
        const { command_id: commandId, ...input } = data;
        // Scope is part of the fingerprint. A global receipt cannot be replayed in another thread.
        return await tools.lifecycle.store.command(
          z.uuid().parse(commandId),
          { operation: name, ...lane, input },
          async () => {
            await access.authorize();
            if (name === "ngertiin.write_memory")
              return await memories.write(lane, input, access.scope.run_id);
            if (name === "ngertiin.delete_memory")
              return await memories.remove(lane, input, access.scope.run_id);
            if (name === "ngertiin.create_skill")
              return await skills.create(lane, input, access.scope.run_id);
            if (name === "ngertiin.revise_skill") {
              const run = await tools.lifecycle.store.get("run", access.scope.run_id);
              return run.skill_consolidation
                ? await skills.consolidate(lane, input, run)
                : await skills.revise(lane, input, run.id);
            }
            return await skills.assign(lane, input);
          },
        );
      },
    });
  }
}
