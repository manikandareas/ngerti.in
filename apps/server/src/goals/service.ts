import { DomainError, type Entity, goal as goalSchema } from "../contracts";
import { Groups } from "../groups/service";
import type { Lifecycle } from "../lifecycle";
import {
  captureGoal,
  completionRecovery,
  goalAssignment,
  goalControl,
  reportGoal,
  routineControl,
  routineWrite,
} from "./contracts";
import { verifyGoalEvidence } from "./evidence";
import { responsibilityInstructions } from "./instructions";
import { firstDue } from "./schedule";
import { type GoalScope, ResponsibilityScope } from "./scope";

export type { GoalScope } from "./scope";

const terminal = new Set(["succeeded", "failed", "cancelled", "steered"]);

/** Domain decisions use the existing lifecycle, queue, authority lock and transactional receipts. */
export class Goals {
  constructor(readonly lifecycle: Lifecycle) {}
  private get store() {
    return this.lifecycle.store;
  }
  private base() {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      owner_id: this.store.ownerId,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
  }
  private update<T extends Entity>(entity: T, fields: Partial<T>): T {
    return this.store.put(
      { ...entity, ...fields, revision: entity.revision + 1, updated_at: new Date().toISOString() },
      entity.revision,
    );
  }
  private get scopes() {
    return new ResponsibilityScope(this.store);
  }
  private scope(context: GoalScope) {
    return this.scopes.conversation(context);
  }
  private require<T extends Entity<"goal"> | Entity<"routine">>(context: GoalScope, entity: T): T {
    return this.scopes.require(context, entity);
  }
  list(context: GoalScope) {
    const thread = this.scope(context);
    return {
      goals: this.store
        .list("goal")
        .filter(
          (g) =>
            g.thread_id === thread.id &&
            (thread.type === "group" || g.agent_id === context.agent_id),
        ),
      routines: this.store
        .list("routine")
        .filter(
          (r) =>
            r.thread_id === thread.id &&
            (thread.type === "group" || r.agent_id === context.agent_id),
        ),
    };
  }
  capture(runId: string, input: unknown) {
    const data = captureGoal.parse(input);
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      this.scope(run);
      const source = this.store.get("message", data.source_message_id);
      if (
        source.id !== run.input_message_id ||
        source.thread_id !== run.thread_id ||
        source.state === "deleted" ||
        (source.author !== "user" && !["handoff", "review"].includes(source.purpose))
      )
        throw new DomainError("SCOPE_DENIED", 403);
      if (run.task_id) {
        const task = this.store.get("peer_task", run.task_id);
        if (data.expected_revision === 0 && task.parent_task_id && task.goal_ids.length)
          throw new DomainError("CONFLICT");
        this.update(task, {
          goal_ids: [...new Set([...task.goal_ids, data.goal_id])],
          goal_generations: {
            ...task.goal_generations,
            [data.goal_id]:
              data.expected_revision === 0
                ? 1
                : this.store.get("goal", data.goal_id).generation + 1,
          },
        });
      }
      const fields = {
        title: data.title,
        objective: data.objective,
        current_run_id: run.id,
        continuation_at: new Date().toISOString(),
        continuation_instruction: data.objective,
        work_state: "ready" as const,
        report_run_id: null,
        deferred_by_run_id: null,
      };
      if (data.expected_revision === 0) {
        if (this.store.list("goal").some((g) => g.id === data.goal_id))
          throw new DomainError("CONFLICT");
        return this.store.put(
          goalSchema.parse({
            ...this.base(),
            ...fields,
            id: data.goal_id,
            kind: "goal",
            thread_id: run.thread_id,
            ...this.scopes.ownership(run),
            coordinator_agent_id: run.agent_id,
            root_task_id: run.task_id
              ? this.store.get("peer_task", run.task_id).root_task_id
              : null,
            source_message_ids: [source.id],
            source_run_ids: [run.id],
            state: "active",
            generation: 1,
            evidence_artifact_ids: [],
          }),
        );
      }
      const current = this.require(run, this.store.get("goal", data.goal_id));
      this.scopes.reporting(run, current);
      if (current.revision !== data.expected_revision || current.state !== "active")
        throw new DomainError("CONFLICT");
      if (current.deferred_by_run_id === run.id) throw new DomainError("RESPONSIBILITY_DEFERRED");
      this.cancelRuns(current.id, run.id);
      // Correcting the objective invalidates pending completion and all old continuation tokens.
      if (run.goal_id === current.id) this.update(run, { goal_generation: current.generation + 1 });
      return this.update(current, {
        ...fields,
        generation: current.generation + 1,
        continuation_sequence: current.continuation_sequence + 1,
        evidence_artifact_ids: [],
        source_message_ids: [...new Set([...current.source_message_ids, source.id])].slice(-200),
        source_run_ids: [...new Set([...current.source_run_ids, run.id])].slice(-200),
      });
    });
  }
  report(runId: string, input: unknown) {
    const data = reportGoal.parse(input);
    const caller = this.store.get("run", runId);
    this.scopes.reporting(caller, this.store.get("goal", data.goal_id));
    try {
      return this.store.transaction(() => {
        const run = this.store.get("run", runId);
        const current = this.require(run, this.store.get("goal", data.goal_id));
        this.scopes.reporting(run, current);
        const source = this.store.get("message", run.input_message_id);
        if (
          current.state !== "active" ||
          current.revision !== data.expected_revision ||
          (run.goal_id !== current.id &&
            !current.source_run_ids.includes(run.id) &&
            source.author !== "user")
        )
          throw new DomainError("CONFLICT");
        if (current.deferred_by_run_id === run.id && data.disposition === "completed")
          throw new DomainError("RESPONSIBILITY_DEFERRED");
        const hasSchedule = this.store
          .list("routine")
          .some((r) => r.goal_id === current.id && r.state === "active" && r.next_run_at !== null);
        if (
          (data.disposition === "scheduled" && !hasSchedule) ||
          (data.disposition === "continue" && hasSchedule)
        )
          throw new DomainError("CONFLICT");
        if (
          run.publication === "quiet" &&
          ["wait", "blocked", "completed"].includes(data.disposition)
        )
          this.update(run, { publication: "deferred" });
        const evidence = [
          ...new Set([...current.evidence_artifact_ids, ...data.evidence_artifact_ids]),
        ];
        if (evidence.length || data.disposition === "completed")
          verifyGoalEvidence(this.lifecycle, current, evidence, run);
        const saved = this.update(current, {
          progress: data.progress,
          last_report_error: null,
          work_state: ["continue", "scheduled"].includes(data.disposition)
            ? "ready"
            : data.disposition === "completed"
              ? "completion_pending"
              : data.disposition === "wait"
                ? "waiting"
                : "blocked",
          evidence_artifact_ids: evidence,
          source_message_ids:
            source.author === "user"
              ? [...new Set([...current.source_message_ids, source.id])].slice(-200)
              : current.source_message_ids,
          report_run_id: run.id,
          deferred_by_run_id: ["continue", "scheduled"].includes(data.disposition)
            ? run.id
            : current.deferred_by_run_id,
          current_run_id: run.id,
          continuation_at: data.continuation?.at ?? null,
          continuation_instruction: data.continuation?.instruction ?? "",
          continuation_sequence: current.continuation_sequence + 1,
          source_run_ids: [...new Set([...current.source_run_ids, run.id])].slice(-200),
        });
        if (["continue", "scheduled"].includes(data.disposition)) {
          const currentRun = this.store.get("run", run.id);
          const progress = this.store
            .list("goal")
            .filter((g) => g.current_run_id === run.id && g.report_run_id === run.id)
            .map((g) => `${g.title}: ${g.progress}`)
            .join("\n")
            .slice(0, 100_000);
          this.update(currentRun, { publication: "deferred", pending_answer: progress });
        }
        return {
          ...saved,
          execution_guidance:
            data.disposition === "completed"
              ? "Finish this turn. Completion is pending successful native settlement."
              : "Stop work on this responsibility for this turn. The application owns its next wakeup or wait; do not execute a future scheduled stage now.",
        };
      });
    } catch (error) {
      if (error instanceof DomainError && ["SCOPE_DENIED", "CONFLICT"].includes(error.code)) {
        const current = this.store.get("goal", data.goal_id);
        if (
          current.scope === "group" &&
          current.revision === data.expected_revision &&
          current.state === "active"
        )
          this.update(current, {
            last_report_error: { run_id: runId, code: error.code },
            work_state: "blocked",
            continuation_at: null,
          });
      }
      throw error;
    }
  }
  recordReportFailure(
    runId: string,
    input: { goal_id: string; expected_revision: number },
    code: string,
  ) {
    if (!["SCOPE_DENIED", "CONFLICT"].includes(code)) return;
    const run = this.store.get("run", runId);
    const goal = this.store.get("goal", input.goal_id);
    try {
      this.scopes.reporting(run, goal);
    } catch {
      return;
    }
    if (
      goal.scope === "group" &&
      goal.revision === input.expected_revision &&
      goal.state === "active"
    )
      this.update(goal, {
        last_report_error: { run_id: runId, code },
        work_state: "blocked",
        continuation_at: null,
      });
  }
  assign(context: GoalScope, input: unknown) {
    const data = goalAssignment.parse(input);
    return this.store.transaction(() => {
      const goal = this.require(context, this.store.get("goal", data.goal_id));
      this.scope({ thread_id: goal.thread_id, agent_id: data.agent_id });
      if (
        goal.scope !== "group" ||
        goal.revision !== data.expected_revision ||
        !["active", "paused"].includes(goal.state)
      )
        throw new DomainError("CONFLICT");
      if (goal.coordinator_agent_id === data.agent_id) return goal;
      this.cancelRuns(goal.id, "");
      if (goal.assignment_route_id) {
        const route = this.store.get("group_route", goal.assignment_route_id);
        if (route.router_run_id) this.lifecycle.cancel(route.router_run_id);
      }
      return this.update(goal, {
        coordinator_agent_id: data.agent_id,
        assignment_revision: goal.assignment_revision + 1,
        assignment_route_id: null,
        work_state: "ready",
        continuation_at: new Date().toISOString(),
      });
    });
  }
  recoverCompletion(goalId: string, input: unknown) {
    const data = completionRecovery.parse(input);
    return this.store.transaction(() => {
      const goal = this.store.get("goal", goalId);
      if (
        goal.revision !== data.expected_revision ||
        goal.state !== "active" ||
        !goal.current_run_id
      )
        throw new DomainError("CONFLICT");
      const run = this.store.get("run", goal.current_run_id);
      if (run.status !== "succeeded" || run.cancellation !== "none")
        throw new DomainError("RECONCILIATION_REQUIRED");
      verifyGoalEvidence(this.lifecycle, goal, data.evidence_artifact_ids);
      this.update(goal, {
        evidence_artifact_ids: data.evidence_artifact_ids,
        progress: data.progress,
        work_state: "completion_pending",
        last_report_error: null,
        report_run_id: run.id,
        continuation_at: null,
      });
      return this.lifecycle.controlGoal(goal.id, "completed");
    });
  }
  control(context: GoalScope, input: unknown) {
    const data = goalControl.parse(input);
    const current = this.require(context, this.store.get("goal", data.goal_id));
    if (current.revision !== data.expected_revision) throw new DomainError("CONFLICT");
    const saved = this.lifecycle.controlGoal(current.id, data.state);
    if (data.state !== "active") this.cancelRuns(current.id);
    return saved;
  }
  private cancelRuns(goalId: string, exceptId?: string) {
    const goal = this.store.get("goal", goalId);
    const ids = new Set([goal.current_run_id]);
    for (const run of this.store.list("run"))
      if (
        (run.goal_id === goalId ||
          ids.has(run.id) ||
          (run.task_id && this.store.get("peer_task", run.task_id).goal_ids.includes(goalId))) &&
        run.id !== exceptId &&
        !terminal.has(run.status)
      )
        this.lifecycle.cancel(run.id);
  }
  writeRoutine(runId: string, input: unknown) {
    const data = routineWrite.parse(input);
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      this.scope(run);
      if (data.goal_id) {
        const goal = this.require(run, this.store.get("goal", data.goal_id));
        this.scopes.reporting(run, goal);
        if (goal.state !== "active") throw new DomainError("CONFLICT");
      }
      if (data.goal_id) {
        const goal = this.store.get("goal", data.goal_id);
        // This standing schedule owns future wakeups; capture's default must not race it.
        const source = this.store.get("message", run.input_message_id);
        this.update(goal, {
          continuation_at: null,
          continuation_instruction: "",
          deferred_by_run_id: run.id,
          current_run_id: run.id,
          source_run_ids: [...new Set([...goal.source_run_ids, run.id])].slice(-200),
          source_message_ids:
            source.author === "user"
              ? [...new Set([...goal.source_message_ids, source.id])].slice(-200)
              : goal.source_message_ids,
        });
      }
      if (data.execution_target?.type === "agent")
        this.scope({ thread_id: run.thread_id, agent_id: data.execution_target.agent_id });
      if (data.execution_target?.type === "auto" && this.scope(run).type !== "group")
        throw new DomainError("SCOPE_DENIED", 403);
      const { routine_id, expected_revision, ...fields } = data;
      const next = firstDue(data.schedule, data.timezone);
      if (expected_revision === 0) {
        if (this.store.list("routine").some((r) => r.id === routine_id))
          throw new DomainError("CONFLICT");
        return this.store.put({
          ...this.base(),
          ...fields,
          name: data.name ?? null,
          kind: "routine",
          id: routine_id,
          thread_id: run.thread_id,
          ...this.scopes.ownership(run),
          execution_target:
            data.execution_target ??
            (this.scope(run).type === "group"
              ? { type: "auto" }
              : { type: "agent", agent_id: run.agent_id }),
          assignment_state: "ready",
          error_code: null,
          source_message_id: run.input_message_id,
          source_run_id: run.id,
          paused_by_goal: false,
          state: "active",
          generation: 1,
          next_run_at: next,
        });
      }
      const current = this.require(run, this.store.get("routine", routine_id));
      if (current.revision !== expected_revision || current.state === "stopped")
        throw new DomainError("CONFLICT");
      for (const pending of this.store.list("run"))
        if (
          pending.routine_id === current.id &&
          pending.id !== run.id &&
          !terminal.has(pending.status)
        )
          this.lifecycle.cancel(pending.id);
      if (run.routine_id === current.id)
        this.update(run, { routine_generation: current.generation + 1 });
      return this.update(current, {
        ...fields,
        execution_target: data.execution_target ?? current.execution_target,
        assignment_state: "ready",
        error_code: null,
        generation: current.generation + 1,
        next_run_at: next,
        source_message_id: run.input_message_id,
        source_run_id: run.id,
      });
    });
  }
  controlRoutine(context: GoalScope, input: unknown) {
    const data = routineControl.parse(input);
    return this.store.transaction(() => {
      const current = this.require(context, this.store.get("routine", data.routine_id));
      if (current.revision !== data.expected_revision || current.state === "stopped")
        throw new DomainError("CONFLICT");
      if (data.state === "active" && current.goal_id) {
        const goal = this.store.get("goal", current.goal_id);
        if (goal.state !== "active") throw new DomainError("CONFLICT");
      }
      const saved = this.update(current, {
        state: data.state,
        generation: current.generation + 1,
        paused_by_goal: false,
        next_run_at: data.state === "active" ? firstDue(current.schedule, current.timezone) : null,
      });
      for (const run of this.store.list("run"))
        if (run.routine_id === current.id && !terminal.has(run.status))
          this.lifecycle.cancel(run.id);
      return saved;
    });
  }
  noUpdate(runId: string) {
    const run = this.store.get("run", runId);
    const message = this.store.get("message", run.input_message_id);
    if (
      (!run.goal_id && !run.routine_id) ||
      run.publication === "immediate" ||
      message.purpose !== "continuation" ||
      this.store.list("artifact").some((a) => a.run_id === runId) ||
      this.store.list("human_request").some((r) => r.source_run_id === runId) ||
      this.store.list("goal").some((g) => g.report_run_id === runId && g.work_state !== "ready")
    )
      throw new DomainError("CONFLICT");
    return this.update(run, { publication: "quiet" });
  }
  /** Called only by Background. Unknown native work and peer/HITL work keep their existing owner. */
  advance(now = new Date()) {
    for (const item of this.store.list("goal")) {
      try {
        this.store.transaction(() => this.advanceGoal(item.id, now));
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
    }
  }
  private advanceGoal(id: string, now: Date) {
    let goal = this.store.get("goal", id);
    if (goal.state !== "active") return;
    this.scope(goal);
    const run = goal.current_run_id ? this.store.get("run", goal.current_run_id) : null;
    if (run && !terminal.has(run.status)) return;
    let coordinator = this.scopes.coordinator(goal);
    if (goal.scope === "group" && !coordinator) {
      if (!goal.assignment_route_id) {
        const route = new Groups(this.lifecycle).selectMember(
          goal.thread_id,
          `Choose a coordinator for this existing group goal. Do not recreate it.\n${goal.objective || goal.title}`,
        );
        this.update(goal, { assignment_route_id: route.id, work_state: "waiting_assignment" });
        return;
      }
      const route = this.store.get("group_route", goal.assignment_route_id);
      if (route.state === "rejected") {
        if (goal.work_state !== "blocked")
          this.update(goal, {
            work_state: "blocked",
            progress:
              "A coordinator could not be assigned. Inspect the selection before continuing.",
            continuation_at: null,
          });
        return;
      }
      if (route.state !== "selected" || !route.selected_agent_id) return;
      try {
        coordinator = new Groups(this.lifecycle).selectedMember(route.id);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        if (goal.work_state !== "blocked")
          this.update(goal, {
            work_state: "blocked",
            continuation_at: null,
            progress: "Coordinator selection is stale. Assign a current member before continuing.",
          });
        return;
      }
      goal = this.update(goal, {
        coordinator_agent_id: coordinator,
        assignment_route_id: null,
        work_state: "ready",
        current_run_id: null,
        continuation_at: new Date().toISOString(),
      });
    }
    if (!coordinator) return;
    if (
      goal.scope === "group" &&
      run &&
      goal.current_run_id === run.id &&
      (run.agent_id !== coordinator ||
        (run.goal_assignment_revision !== null &&
          run.goal_assignment_revision !== goal.assignment_revision))
    ) {
      goal = this.update(goal, {
        current_run_id: null,
        work_state: "ready",
        continuation_at: new Date().toISOString(),
      });
    }
    if (run?.task_id) {
      const task = this.store.get("peer_task", run.task_id);
      if (!["completed", "failed", "cancelled"].includes(task.state)) {
        if (task.current_run_id !== run.id)
          this.update(goal, {
            current_run_id: task.current_run_id,
            source_run_ids: [...new Set([...goal.source_run_ids, task.current_run_id])].slice(-200),
          });
        return;
      }
    }
    if (
      run &&
      goal.current_run_id === run.id &&
      (run.status !== "succeeded" || run.cancellation !== "none")
    ) {
      if (
        run.status === "cancelled" &&
        this.store.list("routine").some((r) => r.goal_id === goal.id && r.state === "active")
      ) {
        this.update(goal, {
          work_state: "ready",
          current_run_id: null,
          continuation_at: null,
          progress: "The run was stopped. Future Routine occurrences remain scheduled.",
        });
        return;
      }
      if (goal.work_state !== "blocked" || goal.continuation_at)
        this.update(goal, {
          work_state: "blocked",
          continuation_at: null,
          progress: "The last run did not succeed. Inspect its outcome before continuing.",
        });
      return;
    }
    if (goal.work_state === "completion_pending") {
      if (!run || goal.report_run_id !== run.id) return;
      try {
        verifyGoalEvidence(this.lifecycle, goal, goal.evidence_artifact_ids);
      } catch {
        this.update(goal, {
          work_state: "blocked",
          continuation_at: null,
          progress:
            "Completion evidence could not be verified. Inspect the retained artifact before continuing.",
        });
        return;
      }
      this.lifecycle.controlGoal(goal.id, "completed");
      return;
    }
    if (
      goal.scope === "group" &&
      goal.current_run_id === run?.id &&
      run.task_id &&
      this.store.get("peer_task", run.task_id).state === "completed" &&
      goal.report_run_id !== run.id &&
      goal.work_state === "ready"
    ) {
      this.update(goal, {
        work_state: "blocked",
        continuation_at: null,
        progress: "The task finished without a structured responsibility report.",
      });
      return;
    }
    if (
      run?.routine_id &&
      goal.work_state === "ready" &&
      !this.store
        .list("routine")
        .some((r) => r.goal_id === goal.id && r.state === "active" && r.next_run_at !== null)
    ) {
      this.update(goal, {
        work_state: "waiting",
        continuation_at: null,
        progress:
          "The scheduled check ended. No future occurrence is scheduled; inspect its result or provide a new instruction.",
      });
      return;
    }
    if (
      run?.goal_id === goal.id &&
      !run.routine_id &&
      goal.work_state === "ready" &&
      !goal.continuation_at &&
      goal.report_run_id !== run.id
    ) {
      this.update(goal, {
        work_state: "blocked",
        progress: "The last run ended without a structured progress decision.",
      });
      return;
    }
    if (
      goal.work_state !== "ready" ||
      !goal.continuation_at ||
      Date.parse(goal.continuation_at) > now.getTime()
    )
      return;
    if (this.store.list("run").some((r) => r.goal_id === goal.id && !terminal.has(r.status)))
      return;
    this.store.command(
      `goal:${goal.id}:${goal.generation}:${goal.continuation_sequence}`,
      { goal_id: goal.id, generation: goal.generation, sequence: goal.continuation_sequence },
      () => {
        const message = this.store.put({
          ...this.base(),
          kind: "message",
          creation_operation_id: null,
          thread_id: goal.thread_id,
          author: "agent",
          author_agent_id: coordinator,
          routine_id: null,
          run_id: null,
          source_run_id: run?.id ?? null,
          purpose: "continuation",
          state: "complete",
          artifact_ids: [],
          text: `Continue this responsibility using its current authoritative state. Update progress using ngertiin.report_goal; wait or report a blocker when appropriate.\n${JSON.stringify({ goal_id: goal.id, objective: goal.objective || goal.title, instruction: goal.continuation_instruction })}`,
        });
        const next = this.lifecycle.enqueue(message, coordinator, { goal_id: goal.id });
        this.update(goal, {
          current_run_id: next.id,
          continuation_at: null,
          source_run_ids: [...new Set([...goal.source_run_ids, next.id])].slice(-200),
        });
        return { run_id: next.id };
      },
    );
  }
  context(run: Entity<"run">) {
    const state = this.list(run);
    // Bound automatic injection; the scoped list tool supplies the complete authoritative inventory.
    const goals = state.goals
      .filter((g) => g.id === run.goal_id || g.state === "active")
      .slice(-20)
      .map((g) => ({
        ...g,
        objective: g.objective.slice(0, 600),
        progress: g.progress.slice(0, 400),
        continuation_instruction: g.continuation_instruction.slice(0, 400),
        source_message_ids: g.source_message_ids.slice(-5),
        source_run_ids: g.source_run_ids.slice(-5),
      }));
    return `${responsibilityInstructions}\n\nCurrent authoritative responsibility state. Dates now: ${new Date().toISOString()}.\n${JSON.stringify({ goal_id: run.goal_id, routine_id: run.routine_id, goals, routines: state.routines.slice(-20).map((r) => ({ ...r, instruction: r.instruction.slice(0, 500) })), truncated: state.goals.length > goals.length || state.routines.length > 20 })}`;
  }
}
