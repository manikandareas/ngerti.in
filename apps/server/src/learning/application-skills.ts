import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
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

/** Packages live in SQLite, outside every native workspace and credential directory. */
export class ApplicationSkills extends LearningScope {
  list(context: LearningContext) {
    this.context(context);
    return this.lifecycle.store.list("skill").filter((item) => this.visible(context, item));
  }
  read(context: LearningContext, input: unknown) {
    const data = skillRead.parse(input);
    const skill = this.lifecycle.store.get("skill", data.skill_id);
    this.require(context, skill);
    const revision = this.lifecycle.store
      .list("skill_revision")
      .find((item) => item.skill_id === skill.id && item.version === data.version);
    if (!revision) throw new DomainError("NOT_FOUND", 404);
    if (packageHash(revision.package) !== revision.sha256) throw new DomainError("CONFLICT");
    return { skill, revision };
  }
  private publish(
    skill: Entity<"skill">,
    value: Entity<"skill_revision">["package"],
    sourceRunId: string | null,
  ) {
    return this.lifecycle.store.put({
      ...this.base(),
      kind: "skill_revision",
      skill_id: skill.id,
      version: skill.revision,
      package: value,
      sha256: packageHash(value),
      source_run_id: sourceRunId,
    });
  }
  create(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = skillCreate.parse(input);
    this.validate(context, data.visibility);
    return this.lifecycle.store.transaction(() => {
      if (this.list(context).some((item) => item.name === data.name))
        throw new DomainError("CONFLICT");
      const skill = this.lifecycle.store.put({
        ...this.base(),
        kind: "skill",
        ...context,
        visibility: data.visibility,
        name: data.name,
        source: "application",
      });
      return { skill, revision: this.publish(skill, data.package, sourceRunId) };
    });
  }
  revise(context: LearningContext, input: unknown, sourceRunId: string | null = null) {
    const data = skillRevise.parse(input);
    return this.lifecycle.store.transaction(() => {
      const current = this.lifecycle.store.get("skill", data.skill_id);
      this.require(context, current);
      if (current.agent_id !== context.agent_id) throw new DomainError("SCOPE_DENIED", 403);
      if (current.revision !== data.expected_revision) throw new DomainError("CONFLICT");
      const skill = this.update(current, {});
      return { skill, revision: this.publish(skill, data.package, sourceRunId) };
    });
  }
  assignments(context: LearningContext) {
    this.context(context);
    return this.lifecycle.store
      .list("skill_assignment")
      .filter((item) => item.agent_id === context.agent_id && this.visible(context, item));
  }
  assign(context: LearningContext, input: unknown) {
    const data = skillAssign.parse(input);
    return this.lifecycle.store.transaction(() => {
      const { skill } = this.read(context, { skill_id: data.skill_id, version: data.version });
      const existing = this.assignments(context).find((item) => item.skill_id === skill.id);
      if ((existing?.revision ?? 0) !== data.expected_revision) throw new DomainError("CONFLICT");
      if (data.enabled) {
        const candidates =
          skill.visibility === "shared"
            ? this.lifecycle.store
                .list("skill_assignment")
                .filter((item) => item.agent_id === context.agent_id)
            : this.assignments(context);
        const collision = candidates.find(
          (item) =>
            item.enabled &&
            item.skill_id !== skill.id &&
            this.lifecycle.store.get("skill", item.skill_id).name === skill.name,
        );
        if (collision) throw new DomainError("CONFLICT");
      }
      if (existing) return this.update(existing, { version: data.version, enabled: data.enabled });
      return this.lifecycle.store.put({
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
  inventory(context: LearningContext) {
    const assignments = this.assignments(context);
    const application = this.list(context).map((skill) => ({
      ...skill,
      key: `application:${skill.id}`,
      assignment: assignments.find((item) => item.skill_id === skill.id) ?? null,
    }));
    const agent = this.lifecycle.store.get("agent", context.agent_id);
    const binding = this.lifecycle.store
      .list("binding")
      .find(
        (item) =>
          item.active &&
          item.agent_id === context.agent_id &&
          item.thread_id === context.thread_id &&
          item.connection_id === agent.connection_id,
      );
    const native = this.lifecycle.store
      .list("harness_inventory")
      .find((item) => item.binding_id === binding?.id);
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
  readHarness(context: LearningContext, key: string) {
    const inventory = this.inventory(context);
    if (!inventory.harness.some((item) => item.key === key))
      throw new DomainError("SCOPE_DENIED", 403);
    const agent = this.context(context).agent;
    const binding = this.lifecycle.store
      .list("binding")
      .find(
        (item) =>
          item.active &&
          item.agent_id === agent.id &&
          item.thread_id === context.thread_id &&
          item.connection_id === agent.connection_id,
      );
    const item = this.lifecycle.store
      .list("harness_inventory")
      .find((item) => item.binding_id === binding?.id)
      ?.skills.find((item) => item.key === key);
    if (!item || packageHash(item.package) !== item.sha256) throw new DomainError("CONFLICT");
    return { ...item, source: "harness", writable: false };
  }
}
