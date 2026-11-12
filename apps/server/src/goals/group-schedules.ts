import { DomainError, type Entity } from "../contracts";
import { Groups } from "../groups/service";
import type { Lifecycle } from "../lifecycle";
import { dueWindow } from "./schedule";

const terminal = new Set(["succeeded", "failed", "cancelled", "steered"]);
const finished = new Set(["completed", "failed", "cancelled"]);

/** Durable selection is part of an occurrence, before admitting its one execution. */
export class GroupSchedules {
  constructor(readonly lifecycle: Lifecycle) {}
  private get store() {
    return this.lifecycle.store;
  }
  private async update<T extends Entity>(entity: T, fields: Partial<T>): Promise<T> {
    return await this.store.put(
      { ...entity, ...fields, revision: entity.revision + 1, updated_at: new Date().toISOString() },
      entity.revision,
    );
  }
  async advance() {
    for (const occurrence of await this.store.list("occurrence")) {
      const routine = await this.store.get("routine", occurrence.routine_id);
      if (routine.scope !== "group" || finished.has(occurrence.state)) continue;
      if (routine.state !== "active" || routine.generation !== occurrence.routine_generation) {
        if (occurrence.run_id) await this.lifecycle.cancel(occurrence.run_id);
        let unresolved = occurrence.run_id
          ? !terminal.has((await this.store.get("run", occurrence.run_id)).status)
          : false;
        if (occurrence.route_id) {
          const route = await this.store.get("group_route", occurrence.route_id);
          if (route.router_run_id) {
            await this.lifecycle.cancel(route.router_run_id);
            unresolved ||= !terminal.has((await this.store.get("run", route.router_run_id)).status);
          }
        }
        const state = unresolved ? "unknown" : "cancelled";
        if (occurrence.state !== state) await this.update(occurrence, { state });
      } else if (occurrence.run_id) {
        const run = await this.store.get("run", occurrence.run_id);
        const task = run.task_id ? await this.store.get("peer_task", run.task_id) : null;
        // A settled parent waiting for a peer is still the same occurrence.
        if (task && task.current_run_id !== run.id)
          await this.update(occurrence, { run_id: task.current_run_id, state: "running" });
        else {
          const state =
            run.status === "succeeded"
              ? task && !finished.has(task.state)
                ? "running"
                : "completed"
              : run.status === "steered"
                ? "cancelled"
                : run.status === "dispatching" || run.status === "cancel_requested"
                  ? "running"
                  : run.status;
          if (state !== occurrence.state) await this.update(occurrence, { state });
        }
      }
    }
  }
  async fire(routine: Entity<"routine">, now: Date) {
    if (routine.state !== "active") return null;
    const thread = await this.store.get("thread", routine.thread_id);
    let occurrence = (await this.store.list("occurrence")).find(
      (o) =>
        o.routine_id === routine.id &&
        o.routine_generation === routine.generation &&
        !finished.has(o.state),
    );
    if (!occurrence) {
      if (!routine.next_run_at || Date.parse(routine.next_run_at) > now.getTime()) return null;
      if (routine.goal_id) {
        const goal = await this.store.get("goal", routine.goal_id);
        if (goal.state !== "active" || goal.work_state !== "ready") return null;
        if (goal.current_run_id) {
          const run = await this.store.get("run", goal.current_run_id);
          if (
            !terminal.has(run.status) ||
            (run.task_id && !finished.has((await this.store.get("peer_task", run.task_id)).state))
          )
            return null;
        }
      }
      const { scheduled_for, next } = dueWindow(
        routine.schedule,
        routine.timezone,
        routine.next_run_at,
        now,
      );
      occurrence = await this.store.command(
        `routine:${routine.id}:${routine.generation}:${scheduled_for}`,
        { scheduled_for },
        async () => {
          const stamp = new Date().toISOString();
          const saved = await this.store.put({
            kind: "occurrence",
            id: crypto.randomUUID(),
            owner_id: this.store.ownerId,
            revision: 1,
            created_at: stamp,
            updated_at: stamp,
            routine_id: routine.id,
            routine_generation: routine.generation,
            scheduled_for,
            run_id: null,
            route_id: null,
            selected_agent_id: null,
            state: "pending",
          });
          await this.update(routine, { next_run_at: next });
          return saved;
        },
      );
    }
    if (occurrence.run_id || occurrence.state === "blocked") return occurrence;
    let selected =
      routine.execution_target?.type === "agent" ? routine.execution_target.agent_id : null;
    if (!selected) {
      if (!occurrence.route_id) {
        const route = await new Groups(this.lifecycle).selectMember(
          thread.id,
          `Choose the executor for this scheduled group responsibility.\n${routine.instruction}`,
        );
        return await this.update(occurrence, { route_id: route.id, state: "routing" });
      }
      const route = await this.store.get("group_route", occurrence.route_id);
      if (route.state === "unknown")
        return occurrence.state === "unknown"
          ? occurrence
          : await this.update(occurrence, { state: "unknown" });
      if (route.state === "rejected") {
        await this.update(await this.store.get("routine", routine.id), {
          assignment_state: "blocked",
          error_code: route.error_code,
        });
        return await this.update(occurrence, { state: "blocked" });
      }
      if (route.state !== "selected") return occurrence;
      try {
        selected = await new Groups(this.lifecycle).selectedMember(route.id);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        await this.update(await this.store.get("routine", routine.id), {
          assignment_state: "blocked",
          error_code: error.code,
        });
        return await this.update(occurrence, { state: "blocked" });
      }
    }
    if (!selected || !thread.member_agent_ids.includes(selected)) {
      const current = await this.store.get("routine", routine.id);
      if (current.assignment_state !== "waiting_assignment")
        await this.update(current, {
          assignment_state: "waiting_assignment",
          error_code: "ASSIGNEE_UNAVAILABLE",
        });
      return occurrence.state === "waiting_assignment"
        ? occurrence
        : await this.update(occurrence, { state: "waiting_assignment" });
    }
    const actor = selected;
    return await this.store.command(
      `occurrence:${occurrence.id}:execution`,
      { occurrence_id: occurrence.id, agent_id: actor },
      async () => {
        const current = await this.store.get("routine", routine.id);
        if (current.state !== "active" || current.generation !== occurrence.routine_generation)
          throw new DomainError("CONFLICT");
        const receipt = await this.lifecycle.admit(
          {
            thread_id: thread.id,
            agent_id: actor,
            text: routine.instruction,
            goal_id: routine.goal_id,
            routine_id: routine.id,
          },
          "routine",
        );
        const task = await new Groups(this.lifecycle).attachScheduled(receipt.run);
        if (routine.goal_id) {
          const goal = await this.store.get("goal", routine.goal_id);
          await this.update(goal, {
            current_run_id: receipt.run.id,
            root_task_id: task.id,
            source_run_ids: [...new Set([...goal.source_run_ids, receipt.run.id])].slice(-200),
          });
        }
        if (current.assignment_state !== "ready" || current.error_code)
          await this.update(current, { assignment_state: "ready", error_code: null });
        return await this.update(occurrence, {
          run_id: receipt.run.id,
          selected_agent_id: actor,
          state: "queued",
        });
      },
    );
  }
}
