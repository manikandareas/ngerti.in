import { DomainError } from "../contracts";
import { Redactor } from "../harness/context";
import { ApplicationSkills } from "../learning/application-skills";
import { Memories } from "../learning/memories";
import type { Lifecycle } from "../lifecycle";
import {
  cloneProfile,
  portableProfile,
  type profileExport,
  profilePersona,
  profileRoutine,
} from "./profile-contracts";

export class AgentProfiles {
  private readonly skills: ApplicationSkills;
  private readonly memories: Memories;

  constructor(private readonly lifecycle: Lifecycle) {
    this.skills = new ApplicationSkills(lifecycle);
    this.memories = new Memories(lifecycle);
  }

  private async snapshot(threadId: string) {
    const store = this.lifecycle.store;
    await store.validateDataContext(true);
    const thread = await store.get("thread", threadId);
    const actor = store.dataContext?.userId;
    if (
      !actor ||
      thread.actor_id !== actor ||
      thread.type !== "dm" ||
      thread.purpose !== "conversation"
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const context = { thread_id: thread.id, agent_id: thread.member_agent_ids[0] as string };
    const agent = await store.get("agent", context.agent_id);
    if (agent.actor_id !== actor || agent.system_role) throw new DomainError("SCOPE_DENIED", 403);

    const skills = [];
    for (const assignment of await this.skills.assignments(context)) {
      if (!assignment.enabled || assignment.actor_id !== actor) continue;
      const { skill, revision } = await this.skills.read(context, {
        skill_id: assignment.skill_id,
        version: assignment.version,
      });
      if (skill.actor_id !== actor || skill.distribution || skill.visibility === "group") continue;
      skills.push({ name: skill.name, visibility: skill.visibility, package: revision.package });
    }
    const profile = portableProfile.parse({
      format: "ngertiin-agent-profile",
      version: 1,
      persona: profilePersona.strip().parse(agent),
      skills,
    });
    return { actor, context, profile };
  }

  async clone(threadId: string, input: unknown) {
    const { name } = cloneProfile.parse(input);
    const { profile } = await this.snapshot(threadId);
    return await this.install({ ...profile, persona: { ...profile.persona, name } });
  }

  async export(threadId: string, mode: ReturnType<typeof profileExport.parse>["mode"]) {
    const { actor, context, profile } = await this.snapshot(threadId);
    const redact = new Redactor();
    const packageData = {
      ...profile,
      persona: {
        ...profile.persona,
        soul: redact.text(profile.persona.soul),
        instructions: redact.text(profile.persona.instructions),
      },
      skills: profile.skills.map((skill) => ({
        ...skill,
        package: {
          description: redact.text(skill.package.description),
          instructions: redact.text(skill.package.instructions),
          assets: skill.package.assets.map((asset) =>
            "text" in asset ? { ...asset, text: redact.text(asset.text) } : asset,
          ),
        },
      })),
    };
    if (mode === "export") return portableProfile.parse(packageData);
    const memories = (await this.memories.list(context)).flatMap((memory) =>
      memory.actor_id === actor && memory.visibility !== "group"
        ? [{ visibility: memory.visibility, text: redact.text(memory.text) }]
        : [],
    );
    const routines = (await this.lifecycle.store.list("routine", context))
      .filter(
        (routine) =>
          routine.actor_id === actor &&
          routine.agent_id === context.agent_id &&
          routine.thread_id === context.thread_id &&
          ["active", "paused"].includes(routine.state) &&
          !routine.goal_id &&
          !routine.precheck &&
          !routine.delivery_target &&
          !routine.monitor,
      )
      .map((routine) =>
        profileRoutine.strip().parse({ ...routine, instruction: redact.text(routine.instruction) }),
      );
    return portableProfile.parse({ ...packageData, backup: { memories, routines } });
  }

  async install(input: unknown) {
    const profile = portableProfile.parse(input);
    const store = this.lifecycle.store;
    await store.validateDataContext(true);
    if (!store.dataContext) throw new DomainError("SCOPE_DENIED", 403);
    return await store.transaction(async () => {
      const agent = await this.lifecycle.create("agent", {
        ...profile.persona,
        connection_id: null,
      });
      const thread = await this.lifecycle.create("thread", {
        type: "dm",
        member_agent_ids: [agent.id],
      });
      const context = { thread_id: thread.id, agent_id: agent.id };
      for (const definition of profile.skills) {
        const { skill, revision } = await this.skills.create(context, definition);
        await this.skills.assign(context, {
          skill_id: skill.id,
          version: revision.version,
          expected_revision: 0,
          enabled: true,
        });
      }
      for (const memory of profile.backup?.memories ?? [])
        await this.memories.write(context, {
          ...memory,
          memory_id: crypto.randomUUID(),
          expected_revision: 0,
        });
      for (const routine of profile.backup?.routines ?? [])
        await this.lifecycle.createRoutine({ ...routine, ...context }, true);
      return { agent, thread };
    });
  }
}
