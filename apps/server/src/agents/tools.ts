import { z } from "zod";
import { type agentInput, type agentUpdate, DomainError } from "../contracts";
import { productToolSchemas } from "../harness/product-tool-contracts";
import type { ProductTools } from "../harness/tools";

export function registerAgentTools(tools: ProductTools) {
  const { lifecycle } = tools;
  tools.register("ngertiin.list_agents", {
    schema: z.strictObject({}),
    resources: () => [],
    execute: (_input, { scope, authorize }) => {
      authorize();
      const caller = lifecycle.store.get("agent", scope.agent_id);
      const agents =
        caller.configuration_access === "owner" ? lifecycle.store.list("agent") : [caller];
      return {
        agents,
        connections: lifecycle.store
          .list("connection")
          .filter(
            (connection) =>
              connection.state === "active" &&
              (caller.configuration_access === "owner" || connection.id === caller.connection_id),
          )
          .map((connection) => ({
            id: connection.id,
            harness: connection.harness,
            authentication: {
              method: connection.authentication.method,
              billing_source: connection.authentication.billing_source,
            },
            models: connection.models,
          })),
      };
    },
  });
  tools.register("ngertiin.create_agent", {
    schema: productToolSchemas["ngertiin.create_agent"],
    resources: () => [],
    execute: (input, { scope, authorize }) => {
      const data = input as { command_id: string; profile: z.infer<typeof agentInput> };
      authorize();
      if (lifecycle.store.get("agent", scope.agent_id).configuration_access !== "owner")
        throw new DomainError("SCOPE_DENIED", 403);
      return lifecycle.store.command(
        data.command_id,
        {
          operation: "create_agent",
          owner_id: scope.owner_id,
          actor_id: scope.agent_id,
          profile: data.profile,
        },
        () => {
          const connection = lifecycle.store.get("connection", data.profile.connection_id);
          if (connection.state !== "active" || connection.harness !== data.profile.harness)
            throw new DomainError("SCOPE_DENIED", 403);
          const agent = lifecycle.createAgent(data.profile);
          const thread = lifecycle.create("thread", { type: "dm", member_agent_ids: [agent.id] });
          return { agent, thread };
        },
      );
    },
  });
  tools.register("ngertiin.update_agent", {
    schema: productToolSchemas["ngertiin.update_agent"],
    resources: () => [],
    execute: (input, { scope, authorize }) => {
      const data = input as z.infer<typeof agentUpdate> & {
        command_id: string;
        agent_id: string;
      };
      authorize();
      const caller = lifecycle.store.get("agent", scope.agent_id);
      if (lifecycle.store.get("thread", scope.thread_id).type === "group")
        throw new DomainError("SCOPE_DENIED", 403);
      if (caller.id !== data.agent_id && caller.configuration_access !== "owner")
        throw new DomainError("SCOPE_DENIED", 403);
      return lifecycle.store.command(
        data.command_id,
        {
          operation: "update_agent",
          owner_id: scope.owner_id,
          actor_id: caller.id,
          target: data.agent_id,
          expected_revision: data.expected_revision,
          changes: data.changes,
        },
        () =>
          lifecycle.updateAgent(data.agent_id, {
            expected_revision: data.expected_revision,
            changes: data.changes,
          }),
      );
    },
  });
}
