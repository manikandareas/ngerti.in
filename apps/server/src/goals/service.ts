import { Artifacts } from "../artifacts";
import { DomainError, type Entity, goal as goalSchema } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { captureGoal, goalControl, reportGoal, routineControl, routineWrite } from "./contracts";
import { firstDue } from "./schedule";

export type GoalScope = { thread_id: string; agent_id: string };
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
  private scope(context: GoalScope) {
    const thread = this.store.get("thread", context.thread_id);
    this.store.get("agent", context.agent_id);
    if (thread.purpose !== "conversation" || !thread.member_agent_ids.includes(context.agent_id))
      throw new DomainError("SCOPE_DENIED", 403);
  }
  private require<T extends Entity<"goal"> | Entity<"routine">>(context: GoalScope, entity: T): T {
    this.scope(context);
    if (entity.thread_id !== context.thread_id || entity.agent_id !== context.agent_id)
      throw new DomainError("SCOPE_DENIED", 403);
    return entity;
  }
  list(context: GoalScope) {
    this.scope(context);
    return {
      goals: this.store
        .list("goal")
        .filter((g) => g.thread_id === context.thread_id && g.agent_id === context.agent_id),
      routines: this.store
        .list("routine")
        .filter((r) => r.thread_id === context.thread_id && r.agent_id === context.agent_id),
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
        if (!task.goal_ids.includes(data.goal_id))
          this.update(task, { goal_ids: [...task.goal_ids, data.goal_id] });
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
            agent_id: run.agent_id,
            source_message_ids: [source.id],
            source_run_ids: [run.id],
            state: "active",
            generation: 1,
            evidence_artifact_ids: [],
          }),
        );
      }
      const current = this.require(run, this.store.get("goal", data.goal_id));
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
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      const current = this.require(run, this.store.get("goal", data.goal_id));
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
      for (const id of evidence) {
        const artifact = this.store.get("artifact", id);
        if (
          artifact.thread_id !== run.thread_id ||
          artifact.agent_id !== run.agent_id ||
          artifact.origin !== "native_output" ||
          !artifact.workspace_id ||
          !artifact.run_id ||
          !artifact.size_bytes
        )
          throw new DomainError("SCOPE_DENIED", 403);
        const producer = this.store.get("run", artifact.run_id);
        if (
          producer.id !== run.id &&
          (producer.status !== "succeeded" || !current.source_run_ids.includes(producer.id))
        )
          throw new DomainError("SCOPE_DENIED", 403);
        new Artifacts(this.lifecycle).download(artifact.id, artifact.workspace_id);
      }
      if (data.disposition === "completed" && !evidence.length) throw new DomainError("CONFLICT");
      const saved = this.update(current, {
        progress: data.progress,
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
        (run.goal_id === goalId || ids.has(run.id)) &&
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
      const { routine_id, expected_revision, ...fields } = data;
      const next = firstDue(data.schedule, data.timezone);
      if (expected_revision === 0) {
        if (this.store.list("routine").some((r) => r.id === routine_id))
          throw new DomainError("CONFLICT");
        return this.store.put({
          ...this.base(),
          ...fields,
          kind: "routine",
          id: routine_id,
          thread_id: run.thread_id,
          agent_id: run.agent_id,
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
      if (run.goal_id === current.id) this.update(run, { goal_generation: current.generation + 1 });
      if (run.routine_id === current.id)
        this.update(run, { routine_generation: current.generation + 1 });
      return this.update(current, {
        ...fields,
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
    const goal = this.store.get("goal", id);
    if (goal.state !== "active") return;
    this.scope(goal);
    const run = goal.current_run_id ? this.store.get("run", goal.current_run_id) : null;
    if (run && !terminal.has(run.status)) return;
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
    if (run && (run.status !== "succeeded" || run.cancellation !== "none")) {
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
        for (const id of goal.evidence_artifact_ids) {
          const evidence = this.store.get("artifact", id);
          new Artifacts(this.lifecycle).download(id, evidence.workspace_id as string);
        }
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
          author_agent_id: goal.agent_id,
          routine_id: null,
          run_id: null,
          source_run_id: run?.id ?? null,
          purpose: "continuation",
          state: "complete",
          artifact_ids: [],
          text: `Continue this responsibility using its current authoritative state. Update progress using ngertiin.report_goal; wait or report a blocker when appropriate.\n${JSON.stringify({ goal_id: goal.id, objective: goal.objective || goal.title, instruction: goal.continuation_instruction })}`,
        });
        const next = this.lifecycle.enqueue(message, goal.agent_id, { goal_id: goal.id });
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
    return `Current authoritative responsibility state. Recognize genuine responsibilities from ordinary user conversation and call ngertiin.capture_goal; do not require a form, command or activation. Hypotheticals, quotations and questions about possible work are not commitments. Corrections must update the existing goal_id and revision, never create a duplicate. Capture distinct responsibilities separately. Preserve the user's content. Use ngertiin.list_goals for all identities, including stopped/paused/completed goals, and do not resurrect them from native history. Report progress and a continue/wait/blocked/completed decision through ngertiin.report_goal. Completed requires a useful published artifact from actual work; a completion claim alone is insufficient. A completed decision becomes final only after successful native settlement. Continue supplies an explicit wake time and instruction. For a goal with an active linked Routine, use scheduled instead of continue; the Routine owns wakeups, so do not add a second wake time or mark the goal waiting just because its next tick is in the future. On a no-change tick use routine_no_update and keep scheduled work ready. Waiting/blocked does not poll. Use ngertiin.write_routine for one-shot, interval, local calendar or heartbeat scheduling and ngertiin.control_routine for pause/stop; use ngertiin.control_goal for responsibility controls. Backend scheduling continues without a browser tab. For an automatic tick with nothing relevant to report, call ngertiin.routine_no_update and finish without a chat update. Important progress, blockers, questions and results belong in this thread. Do not suppress them. After recording a future Routine or reporting continue/scheduled, this source run has yielded the responsibility: do not create/publish future result files or mark it completed. The server returns RESPONSIBILITY_DEFERRED for those attempts. End the turn after recording the remaining independent responsibilities. After reporting wait or blocked, finish work on that responsibility for this turn. Never execute a future scheduled stage early in the current turn. After group handoff/user-input tools, end the turn; the existing task owner resumes the work. Do not create another continuation owner. Dates now: ${new Date().toISOString()}.\n${JSON.stringify({ goal_id: run.goal_id, routine_id: run.routine_id, goals, routines: state.routines.slice(-20).map((r) => ({ ...r, instruction: r.instruction.slice(0, 500) })), truncated: state.goals.length > goals.length || state.routines.length > 20 })}`;
  }
}
