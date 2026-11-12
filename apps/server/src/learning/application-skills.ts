import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import { asyncFilter, asyncFind } from "../persistence/async-collections";
import { canonical } from "../store";
import {
  type LearningContext,
  skillAssign,
  skillCreate,
  skillRead,
  skillRevise,
} from "./contracts";
import { LearningScope } from "./scope";

export const packageHash = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");

/** Packages live in PostgreSQL, outside every native workspace and credential directory. */
export class ApplicationSkills extends LearningScope {
  async list(context: LearningContext) {
    await this.context(context);
    return await asyncFilter(
      await this.lifecycle.store.list("skill"),
      async (item) => await this.visible(context, item),
    );
  }
  async read(context: LearningContext, input: unknown) {
    const data = skillRead.parse(input);
    const skill = await this.lifecycle.store.get("skill", data.skill_id);
    await this.require(context, skill);
    const revision = (await this.lifecycle.store.list("skill_revision")).find(
      (item) => item.skill_id === skill.id && item.version === data.version,
    );
    if (!revision) throw new DomainError("NOT_FOUND", 404);
    if (packageHash(revision.package) !== revision.sha256) throw new DomainError("CONFLICT");
    return { skill, revision };
  }
  private async publish(
    skill: Entity<"skill">,
    value: Entity<"skill_revision">["package"],
    sourceRunId: string | null,
  ) {
    return await this.lifecycle.store.put({
      ...this.base(),
      kind: "skill_revision",
      skill_id: skill.id,
      version: skill.revision,
      package: value,
      sha256: packageHash(value),
      source_run_id: sourceRunId,
    });
  }
  async create(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = skillCreate.parse(input);
    await this.validate(context, data.visibility);
    return await this.lifecycle.store.transaction(async () => {
      if ((await this.list(context)).some((item) => item.name === data.name))
        throw new DomainError("CONFLICT");
      const skill = await this.lifecycle.store.put({
        ...this.base(),
        kind: "skill",
        ...context,
        visibility: data.visibility,
        name: data.name,
        source: "application",
      });
      return { skill, revision: await this.publish(skill, data.package, sourceRunId) };
    });
  }
  async revise(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = skillRevise.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const current = await this.lifecycle.store.get("skill", data.skill_id);
      await this.require(context, current);
      if (current.agent_id !== context.agent_id) throw new DomainError("SCOPE_DENIED", 403);
      if (current.revision !== data.expected_revision) throw new DomainError("CONFLICT");
      const skill = await this.update(current, {});
      return { skill, revision: await this.publish(skill, data.package, sourceRunId) };
    });
  }
  async assignments(context: LearningContext) {
    await this.context(context);
    return await asyncFilter(
      await this.lifecycle.store.list("skill_assignment"),
      async (item) => item.agent_id === context.agent_id && (await this.visible(context, item)),
    );
  }
  async assign(context: LearningContext, input: unknown) {
    const data = skillAssign.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const { skill } = await this.read(context, {
        skill_id: data.skill_id,
        version: data.version,
      });
      const existing = (await this.assignments(context)).find((item) => item.skill_id === skill.id);
      if ((existing?.revision ?? 0) !== data.expected_revision) throw new DomainError("CONFLICT");
      if (data.enabled) {
        const candidates =
          skill.visibility === "shared"
            ? (
                await this.lifecycle.store.list("skill_assignment", { agent_id: context.agent_id })
              ).filter((item) => item.agent_id === context.agent_id)
            : await this.assignments(context);
        const collision = await asyncFind(
          candidates,
          async (item) =>
            item.enabled &&
            item.skill_id !== skill.id &&
            (await this.lifecycle.store.get("skill", item.skill_id)).name === skill.name,
        );
        if (collision) throw new DomainError("CONFLICT");
      }
      if (existing)
        return await this.update(existing, { version: data.version, enabled: data.enabled });
      return await this.lifecycle.store.put({
        ...this.base(),
        kind: "skill_assignment",
        agent_id: context.agent_id,
        thread_id: skill.thread_id,
        visibility: skill.visibility,
        skill_id: skill.id,
        version: data.version,
        enabled: data.enabled,
      });
    });
  }
  async inventory(context: LearningContext) {
    const assignments = await this.assignments(context);
    const application = (await this.list(context)).map((skill) => ({
      ...skill,
      key: `application:${skill.id}`,
      assignment: assignments.find((item) => item.skill_id === skill.id) ?? null,
    }));
    const agent = await this.lifecycle.store.get("agent", context.agent_id);
    const binding = (
      await this.lifecycle.store.list("binding", {
        agent_id: context.agent_id,
        thread_id: context.thread_id,
        connection_id: agent.connection_id,
      })
    ).find(
      (item) =>
        item.active &&
        item.agent_id === context.agent_id &&
        item.thread_id === context.thread_id &&
        item.connection_id === agent.connection_id,
    );
    const native = (
      await this.lifecycle.store.list("harness_inventory", { binding_id: binding?.id })
    ).find((item) => item.binding_id === binding?.id);
    const disabledNativeNames = new Set(
      native?.native_catalog.filter((item) => !item.enabled).map((item) => item.name) ?? [],
    );
    const harness =
      native?.skills
        .filter((item) => !disabledNativeNames.has(item.name))
        .map((item) => ({
          key: item.key,
          name: item.name,
          location: item.location,
          description: item.package.description,
          sha256: item.sha256,
          source: "harness" as const,
          writable: false,
        })) ?? [];
    const counts = new Map<string, number>();
    for (const item of application) counts.set(item.name, (counts.get(item.name) ?? 0) + 1);
    const inheritedNames = new Set([
      ...harness.map((item) => item.name),
      ...(native?.native_catalog.filter((item) => item.enabled).map((item) => item.name) ?? []),
    ]);
    for (const name of inheritedNames) counts.set(name, (counts.get(name) ?? 0) + 1);
    return {
      application,
      harness,
      harness_state: native?.state ?? "unknown",
      native_state: native?.native_state ?? "unknown",
      native_catalog: native?.native_catalog ?? [],
      rejected_packages: native?.rejected_packages ?? 0,
      configured_references: agent.skills.map((reference) => ({
        ...reference,
        state: "reference_only",
      })),
      conflict_policy:
        "qualified_identity_required; no_cross_source_overwrite; pinned_application_versions",
      collisions: [...counts].filter(([, count]) => count > 1).map(([name]) => name),
    };
  }
  async readHarness(context: LearningContext, key: string) {
    const inventory = await this.inventory(context);
    if (!inventory.harness.some((item) => item.key === key))
      throw new DomainError("SCOPE_DENIED", 403);
    const agent = (await this.context(context)).agent;
    const binding = (
      await this.lifecycle.store.list("binding", {
        agent_id: agent.id,
        thread_id: context.thread_id,
        connection_id: agent.connection_id,
      })
    ).find(
      (item) =>
        item.active &&
        item.agent_id === agent.id &&
        item.thread_id === context.thread_id &&
        item.connection_id === agent.connection_id,
    );
    const item = (await this.lifecycle.store.list("harness_inventory", { binding_id: binding?.id }))
      .find((item) => item.binding_id === binding?.id)
      ?.skills.find((item) => item.key === key);
    if (!item || packageHash(item.package) !== item.sha256) throw new DomainError("CONFLICT");
    return { ...item, source: "harness", writable: false };
  }
}
