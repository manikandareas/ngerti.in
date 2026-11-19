import { DomainError, type Entity } from "../contracts";
import { Groups } from "../groups/service";
import type { Lifecycle } from "../lifecycle";
import { settleLoop } from "./loops";
import { checkedRoutineInstruction, checkRoutineSource, precheckCompletion } from "./precheck";
import { dueWindow, nextLoopWake, routineCanRun, routineIsTerminal } from "./schedule";

const terminal = new Set(["succeeded", "failed", "cancelled", "steered"]);
const finished = new Set(["completed", "failed", "cancelled", "skipped"]);

function occurrenceState(
  run: Entity<"run">,
  task?: Entity<"peer_task"> | null,
): Entity<"occurrence">["state"] {
  if (run.status === "succeeded")
    return task && !finished.has(task.state) ? "running" : "completed";
  if (run.status === "steered") return "cancelled";
  if (run.status === "dispatching" || run.status === "cancel_requested") return "running";
  return run.status;
}

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
  private async syncExecution(
    occurrence: Entity<"occurrence">,
    run: Entity<"run">,
    state: Entity<"occurrence">["state"],
  ) {
    if (state === occurrence.state) return;
    await this.store.transaction(async () => {
      const current = await this.store.get("occurrence", occurrence.id);
      if (current.run_id !== run.id || current.state === state || finished.has(current.state))
        return;
      if (current.trigger === "manual" || !finished.has(state)) {
        await this.update(current, { state });
        return;
      }
      const routine = await this.store.get("routine", current.routine_id);
      const loop =
        routine.state === "active" &&
        routine.generation === current.routine_generation &&
        routine.next_run_at === null
          ? await settleLoop(this.lifecycle, routine, run)
          : null;
      await this.update(current, { state, ...(loop ? { loop_condition: loop.condition } : {}) });
      if (loop) await this.update(routine, loop.fields);
    });
  }
  private async advanceExecution(occurrence: Entity<"occurrence">, group: boolean) {
    if (!occurrence.run_id) return;
    let run = await this.store.get("run", occurrence.run_id);
    const task = group && run.task_id ? await this.store.get("peer_task", run.task_id) : null;
    // A settled parent waiting for a peer is still the same occurrence.
    if (task && task.current_run_id !== run.id) {
      run = await this.store.get("run", task.current_run_id);
      occurrence = await this.update(occurrence, { run_id: run.id, state: "running" });
    }
    await this.syncExecution(occurrence, run, occurrenceState(run, task));
  }

  /** Keep a finished check in the checkpoint even if Pause arrives before the next scheduler pass. */
  async reconcileLoop(routine: Entity<"routine">) {
    if (routine.schedule.type !== "loop" || routine.state !== "active" || routine.next_run_at)
      return routine;
    const occurrence = (await this.store.list("occurrence")).find(
      (item) =>
        item.routine_id === routine.id &&
        item.routine_generation === routine.generation &&
        item.trigger === "schedule" &&
        item.run_id &&
        !finished.has(item.state),
    );
    if (!occurrence) return routine;
    await this.advanceExecution(occurrence, routine.scope === "group");
    return await this.store.get("routine", routine.id);
  }

  async advance() {
    for (const occurrence of await this.store.list("occurrence")) {
      if (finished.has(occurrence.state)) continue;
      const routine = await this.store.get("routine", occurrence.routine_id);
      if (routine.scope !== "group") {
        await this.advanceExecution(occurrence, false);
        continue;
      }
      if (
        !routineCanRun(routine.state, occurrence.trigger === "manual") ||
        routine.generation !== occurrence.routine_generation
      ) {
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
      } else if (occurrence.run_id) await this.advanceExecution(occurrence, true);
      else if (routine.state === "paused" && occurrence.trigger === "manual")
        await this.lifecycle.fireRoutine(routine.id, new Date());
    }
  }
  async fire(routine: Entity<"routine">, now: Date, manual = false) {
    if (routine.restore_pending || routineIsTerminal(routine.state)) return null;
    let occurrence = (await this.store.list("occurrence")).find(
      (o) =>
        o.routine_id === routine.id &&
        o.routine_generation === routine.generation &&
        !finished.has(o.state),
    );
    if (manual && occurrence) return null;
    if (!routineCanRun(routine.state, manual || occurrence?.trigger === "manual")) return null;
    const thread = await this.store.get("thread", routine.thread_id);
    if (!occurrence) {
      const due = manual ? now.toISOString() : routine.next_run_at;
      if (!due || Date.parse(due) > now.getTime()) return null;
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
      const trigger = manual ? ("manual" as const) : ("schedule" as const);
      const { scheduled_for, next } = manual
        ? { scheduled_for: due, next: routine.next_run_at }
        : dueWindow(routine.schedule, routine.timezone, due, now);
      occurrence = await this.store.command(
        manual
          ? `routine:${routine.id}:${routine.generation}:manual:${scheduled_for}`
          : `routine:${routine.id}:${routine.generation}:${scheduled_for}`,
        manual ? { scheduled_for, trigger } : { scheduled_for },
        async () => {
          const stamp = new Date().toISOString();
          const check = await checkRoutineSource(this.lifecycle, routine);
          const completedByCheck = precheckCompletion(check, manual);
          const saved = await this.store.put({
            kind: "occurrence",
            id: crypto.randomUUID(),
            owner_id: this.store.ownerId,
            revision: 1,
            created_at: stamp,
            updated_at: stamp,
            routine_id: routine.id,
            routine_generation: routine.generation,
            trigger,
            check,
            scheduled_for,
            run_id: null,
            route_id: null,
            selected_agent_id: null,
            state: completedByCheck ?? "pending",
          });
          if (!manual)
            await this.update(routine, {
              next_run_at:
                completedByCheck && routine.schedule.type === "loop"
                  ? nextLoopWake(routine.schedule, stamp, routine.loop_pacing)
                  : next,
            });
          return saved;
        },
      );
    }
    if (occurrence.run_id || occurrence.state === "blocked" || finished.has(occurrence.state))
      return occurrence;
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
        const manualRoutine = occurrence.trigger === "manual";
        if (
          !routineCanRun(current.state, manualRoutine) ||
          current.generation !== occurrence.routine_generation
        )
          throw new DomainError("CONFLICT");
        const receipt = await this.lifecycle.admit(
          {
            thread_id: thread.id,
            agent_id: actor,
            text: checkedRoutineInstruction(routine, occurrence.check),
            goal_id: routine.goal_id,
            routine_id: routine.id,
            artifact_ids: occurrence.check?.artifact_id ? [occurrence.check.artifact_id] : [],
          },
          "routine",
          { manualRoutine },
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
