import { DomainError, type Entity } from "../contracts";
import { ApplicationSkills } from "./application-skills";
import { type LearningContext, skillMaintenanceAction } from "./contracts";
import { LearningScope } from "./scope";

type Skill = Entity<"skill">;
type Maintenance = Entity<"skill_maintenance">;

/** Private library policy is stored separately from immutable package versions. */
export class SkillCurator extends LearningScope {
  readonly #nextPass = new Map<string, number>();

  async advance(now: Date) {
    const store = this.lifecycle.store;
    const actor = store.dataContext;
    if (!actor) return;
    const key = `${actor.organizationId}:${actor.userId}`;
    const current = now.valueOf();
    const next = current + this.lifecycle.reviewCadence.curator_interval_ms;
    if (current < (this.#nextPass.get(key) ?? 0)) return;
    const saved = (await store.list("skill_curator_state"))[0];
    const nextPass = saved ? Date.parse(saved.next_pass_at) : next;
    if (!saved) {
      await store.put({
        ...this.base(),
        kind: "skill_curator_state",
        next_pass_at: new Date(next).toISOString(),
      });
      this.#nextPass.set(key, nextPass);
      return;
    }
    this.#nextPass.set(key, nextPass);
    if (
      current < nextPass ||
      (
        await store.page("run", {
          statuses: ["queued", "dispatching", "running", "cancel_requested"],
          limit: 1,
        })
      ).items.length
    )
      return;
    await store.transaction(async () => {
      await this.review(now);
      await this.update(saved, { next_pass_at: new Date(next).toISOString() });
    });
    this.#nextPass.set(key, next);
  }

  async review(now: Date, context?: LearningContext) {
    const store = this.lifecycle.store;
    const actor = store.dataContext;
    if (!actor) throw new DomainError("SCOPE_DENIED", 403);
    return await store.transaction(async () => {
      await store.validateDataContext(true);
      const skills = context
        ? await new ApplicationSkills(this.lifecycle).list(context)
        : await store.list("skill");
      const accessibleAgents = new Set((await store.list("agent")).map((agent) => agent.id));
      const assignments = await store.list("skill_assignment", { agent_id: context?.agent_id });
      const protectedIds = new Set(
        assignments.filter((item) => item.enabled).map((item) => item.skill_id),
      );
      const maintenance = new Map(
        (
          await store.list("skill_maintenance", {
            agent_id: context?.agent_id,
          })
        ).map((item) => [item.id, item]),
      );
      const activity = await store.query<{
        skill_id: string;
        last_read: string;
        routine_uses_skill: boolean;
      }>(
        `SELECT used->>'skill_id' AS skill_id,
                max(COALESCE(r.body->'timings'->>'settled_at',r.body->>'created_at')) AS last_read,
                bool_or(q.id IS NOT NULL) AS routine_uses_skill
         FROM entities r
         CROSS JOIN LATERAL jsonb_array_elements(COALESCE(r.body->'skill_reads','[]')) AS used
         LEFT JOIN entities q ON q.kind='routine' AND q.id=(r.body->>'routine_id')::uuid
            AND q.body->>'state' IN ('active','paused')
         WHERE r.kind='run' AND r.organization_id=$1 AND r.actor_id=$2
           AND ($3::text IS NULL OR r.body->>'agent_id'=$3)
         GROUP BY used->>'skill_id'`,
        [actor.organizationId, actor.userId, context?.agent_id ?? null],
      );
      const useBySkill = new Map(activity.rows.map((row) => [row.skill_id, row]));
      const result = { active: 0, stale: 0, archived: 0 };
      for (const skill of skills) {
        if (skill.actor_id !== actor.userId || !accessibleAgents.has(skill.agent_id)) continue;
        const current = maintenance.get(skill.id);
        if (current?.state === "archived") {
          result.archived++;
          continue;
        }
        const used = useBySkill.get(skill.id);
        const lastUsed = used?.last_read ?? null;
        const age =
          now.valueOf() -
          Math.max(
            Date.parse(skill.created_at),
            used ? Date.parse(used.last_read) : 0,
            current?.restored_at ? Date.parse(current.restored_at) : 0,
          );
        const { stale_skill_ms, archive_skill_ms } = this.lifecycle.reviewCadence;
        const protectedSkill =
          current?.locked || used?.routine_uses_skill || protectedIds.has(skill.id);
        const state =
          current?.locked || age < stale_skill_ms
            ? "active"
            : age >= archive_skill_ms && !protectedSkill
              ? "archived"
              : "stale";
        result[state]++;
        if (state !== (current?.state ?? "active") || lastUsed !== (current?.last_used_at ?? null))
          await this.save(skill, current, { state, last_used_at: lastUsed });
      }
      return result;
    });
  }

  async control(input: unknown) {
    const { context, skill_id, action } = skillMaintenanceAction.parse(input);
    const store = this.lifecycle.store;
    return await store.transaction(async () => {
      const skill = await store.get("skill", skill_id);
      await this.require(context, skill);
      const actor = store.dataContext;
      if (!actor || skill.actor_id !== actor.userId || skill.agent_id !== context.agent_id)
        throw new DomainError("SCOPE_DENIED", 403);
      const current = (await store.list("skill_maintenance", { agent_id: skill.agent_id })).find(
        (item) => item.id === skill.id,
      );
      if (action === "restore") {
        if (current?.state !== "archived") throw new DomainError("CONFLICT");
        return await this.save(skill, current, {
          state: "active",
          restored_at: new Date().toISOString(),
        });
      }
      if (current?.state === "archived") throw new DomainError("CONFLICT");
      if (action === "lock")
        return await this.save(skill, current, { state: "active", locked: true });
      if (!current?.locked) throw new DomainError("CONFLICT");
      return await this.save(skill, current, { locked: false });
    });
  }

  private async save(
    skill: Skill,
    current: Maintenance | undefined,
    next: Partial<Pick<Maintenance, "state" | "locked" | "restored_at" | "last_used_at">>,
  ) {
    if (current) return await this.update(current, next);
    return await this.lifecycle.store.put({
      ...this.base(),
      kind: "skill_maintenance",
      id: skill.id,
      agent_id: skill.agent_id,
      thread_id: skill.thread_id,
      visibility: skill.visibility,
      state: "active",
      locked: false,
      restored_at: null,
      last_used_at: null,
      ...next,
    });
  }
}
