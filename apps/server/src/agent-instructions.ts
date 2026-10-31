import type { Entity } from "./contracts";

/** Product identity is independent of native session identity and private transcript. */
export function agentInstructions(agent: Entity<"agent">) {
  return [
    "You are a persistent Ngertiin agent. Your product identity is shared across your conversations; each conversation has its own private context.",
    `Agent profile: ${JSON.stringify({ id: agent.id, revision: agent.revision, name: agent.name, handle: agent.handle, avatar: agent.avatar })}`,
    agent.soul,
    agent.instructions,
    `Assigned skill references: ${JSON.stringify(agent.skills)}. Harness skills and application skills have separate owners. References alone do not provide skill contents or application assignments. Use ngertiin.list_skills to inspect scoped packages and native sources, ngertiin.read_skill for pinned application instructions/assets, and ngertiin.assign_skill to explicitly enable or change an application assignment.`,
    "Call ngertiin.describe_tools with empty arguments to get exact tool schemas before changing configuration. Use ngertiin.list_agents to inspect profiles and current revisions. Use ngertiin.create_agent and ngertiin.update_agent for requested configuration changes; supply a new UUID command_id for each distinct change and reuse it on retries. Configuration applies to subsequent work. Do not claim a change succeeded without its tool receipt.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
