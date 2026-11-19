import { DomainError, type Entity, goal as goalSchema } from "../contracts";
import { Groups } from "../groups/service";
import { Connections } from "../harness/connections";
import { HarnessError } from "../harness/contracts";
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
import { type VerifiedGoalFiles, verifyGoalEvidence } from "./evidence";
import { GroupSchedules } from "./group-schedules";
import { responsibilityInstructions } from "./instructions";
import { loopControlFields } from "./loops";
import { routineReading } from "./monitor-contracts";
import { initialPrecheckBaseline, requirePrecheckDefinition } from "./precheck";
import { firstDue, routineHasFuture, routineIsTerminal } from "./schedule";
import { type GoalScope, ResponsibilityScope } from "./scope";
import { evaluateGoalVerification } from "./verification";

export type { GoalScope } from "./scope";

const terminal = new Set(["succeeded", "failed", "cancelled", "steered"]);
const normalizeProgress = (text: string) => text.trim().replace(/\s+/g, " ");

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
  private async update<T extends Entity>(entity: T, fields: Partial<T>): Promise<T> {
    return await this.store.put(
      { ...entity, ...fields, revision: entity.revision + 1, updated_at: new Date().toISOString() },
      entity.revision,
    );
  }
  private get scopes() {
    return new ResponsibilityScope(this.store);
  }
  private async scope(context: GoalScope) {
    return await this.scopes.conversation(context);
  }
  private async require<T extends Entity<"goal"> | Entity<"routine">>(
    context: GoalScope,
    entity: T,
  ): Promise<T> {
    return await this.scopes.require(context, entity);
  }
  async list(context: GoalScope) {
    const thread = await this.scope(context);
    return {
      goals: (await this.store.list("goal", { thread_id: thread.id })).filter(
        (g) =>
          g.thread_id === thread.id && (thread.type === "group" || g.agent_id === context.agent_id),
      ),
      routines: (await this.store.list("routine", { thread_id: thread.id })).filter(
        (r) =>
          r.thread_id === thread.id && (thread.type === "group" || r.agent_id === context.agent_id),
      ),
    };
  }
  async capture(runId: string, input: unknown) {
    const data = captureGoal.parse(input);
    return await this.store.transaction(async () => {
      const run = await this.store.get("run", runId);
      await this.scope(run);
      const source = await this.store.get("message", data.source_message_id);
      if (
        source.id !== run.input_message_id ||
        source.thread_id !== run.thread_id ||
        source.state === "deleted" ||
        (source.author !== "user" && !["handoff", "review"].includes(source.purpose))
      )
        throw new DomainError("SCOPE_DENIED", 403);
      if (run.task_id) {
        const task = await this.store.get("peer_task", run.task_id);
        if (data.expected_revision === 0 && task.parent_task_id && task.goal_ids.length)
          throw new DomainError("CONFLICT");
        await this.update(task, {
          goal_ids: [...new Set([...task.goal_ids, data.goal_id])],
          goal_generations: {
            ...task.goal_generations,
            [data.goal_id]:
              data.expected_revision === 0
                ? 1
                : (await this.store.get("goal", data.goal_id)).generation + 1,
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
      const freshVerification = data.verification
        ? { ...data.verification, attempts_used: 0, last_check: null }
        : null;
      if (data.expected_revision === 0) {
        if ((await this.store.list("goal")).some((g) => g.id === data.goal_id))
          throw new DomainError("CONFLICT");
        return await this.store.put(
          goalSchema.parse({
            ...this.base(),
            ...fields,
            verification: freshVerification,
            id: data.goal_id,
            kind: "goal",
            thread_id: run.thread_id,
            ...(await this.scopes.ownership(run)),
            coordinator_agent_id: run.agent_id,
            root_task_id: run.task_id
              ? (await this.store.get("peer_task", run.task_id)).root_task_id
              : null,
            provider_selection: run.provider_selection,
            source_message_ids: [source.id],
            source_run_ids: [run.id],
            state: "active",
            generation: 1,
            evidence_artifact_ids: [],
          }),
        );
      }
      const current = await this.require(run, await this.store.get("goal", data.goal_id));
      await this.scopes.reporting(run, current);
      if (current.revision !== data.expected_revision || current.state !== "active")
        throw new DomainError("CONFLICT");
      if (current.deferred_by_run_id === run.id) throw new DomainError("RESPONSIBILITY_DEFERRED");
      await this.cancelRuns(current.id, run.id);
      // Correcting the objective invalidates pending completion and all old continuation tokens.
      if (run.goal_id === current.id)
        await this.update(run, { goal_generation: current.generation + 1 });
      return await this.update(current, {
        ...fields,
        verification:
          data.verification === undefined && current.verification
            ? { ...current.verification, attempts_used: 0, last_check: null }
            : freshVerification,
        generation: current.generation + 1,
        continuation_sequence: current.continuation_sequence + 1,
        evidence_artifact_ids: [],
        checkpoint_evidence: null,
        source_message_ids: [...new Set([...current.source_message_ids, source.id])].slice(-200),
        source_run_ids: [...new Set([...current.source_run_ids, run.id])].slice(-200),
      });
    });
  }
  async report(runId: string, input: unknown) {
    const data = reportGoal.parse(input);
    const caller = await this.store.get("run", runId);
    await this.scopes.reporting(caller, await this.store.get("goal", data.goal_id));
    try {
      return await this.store.transaction(async () => {
        const run = await this.store.get("run", runId);
        const current = await this.require(run, await this.store.get("goal", data.goal_id));
        await this.scopes.reporting(run, current);
        const source = await this.store.get("message", run.input_message_id);
        if (
          current.state !== "active" ||
          current.revision !== data.expected_revision ||
          (run.goal_id !== current.id &&
            !current.source_run_ids.includes(run.id) &&
            source.author !== "user")
        )
          throw new DomainError("CONFLICT");
        if (
          current.deferred_by_run_id === run.id &&
          (data.disposition === "completed" || current.work_state === "blocked")
        )
          throw new DomainError("RESPONSIBILITY_DEFERRED");
        const hasSchedule = (await this.store.list("routine", { state: "active" })).some(
          (r) => r.goal_id === current.id && routineHasFuture(r),
        );
        if (
          (data.disposition === "scheduled" && !hasSchedule) ||
          (data.disposition === "continue" && hasSchedule)
        )
          throw new DomainError("CONFLICT");
        const evidence = [
          ...new Set([...current.evidence_artifact_ids, ...data.evidence_artifact_ids]),
        ];
        const verified =
          evidence.length || (data.disposition === "completed" && !current.verification)
            ? await verifyGoalEvidence(this.lifecycle, current, evidence, run)
            : null;
        const known = new Set(
          current.evidence_artifact_ids.map((id) => verified?.fingerprints.get(id)),
        );
        const repeated =
          source.purpose === "continuation" &&
          current.report_run_id !== null &&
          current.report_run_id !== run.id &&
          data.continuation !== null &&
          normalizeProgress(data.progress) === normalizeProgress(current.progress) &&
          normalizeProgress(data.continuation.instruction) ===
            normalizeProgress(current.continuation_instruction) &&
          data.evidence_artifact_ids.every((id) => known.has(verified?.fingerprints.get(id)));
        const disposition = repeated ? "blocked" : data.disposition;
        if (run.publication === "quiet" && ["wait", "blocked", "completed"].includes(disposition))
          await this.update(run, { publication: "deferred" });
        const saved = await this.update(current, {
          progress: repeated
            ? "The last continuation repeated the same progress, evidence, and next step. The Goal is blocked until new evidence or direction is available."
            : data.progress,
          last_report_error: null,
          work_state: ["continue", "scheduled"].includes(disposition)
            ? "ready"
            : disposition === "completed"
              ? "completion_pending"
              : disposition === "wait"
                ? "waiting"
                : "blocked",
          evidence_artifact_ids: repeated ? current.evidence_artifact_ids : evidence,
          source_message_ids:
            source.author === "user"
              ? [...new Set([...current.source_message_ids, source.id])].slice(-200)
              : current.source_message_ids,
          report_run_id: run.id,
          deferred_by_run_id:
            repeated || ["continue", "scheduled"].includes(disposition)
              ? run.id
              : current.deferred_by_run_id,
          current_run_id: run.id,
          continuation_at: repeated ? null : (data.continuation?.at ?? null),
          continuation_instruction: repeated ? "" : (data.continuation?.instruction ?? ""),
          continuation_sequence: current.continuation_sequence + 1,
          source_run_ids: [...new Set([...current.source_run_ids, run.id])].slice(-200),
        });
        if (["continue", "scheduled"].includes(disposition)) {
          const currentRun = await this.store.get("run", run.id);
          const progress = (await this.store.list("goal"))
            .filter((g) => g.current_run_id === run.id && g.report_run_id === run.id)
            .map((g) => `${g.title}: ${g.progress}`)
            .join("\n")
            .slice(0, 100_000);
          await this.update(currentRun, { publication: "deferred", pending_answer: progress });
        }
        return {
          ...saved,
          execution_guidance:
            disposition === "completed"
              ? "Finish this turn. Report what you submitted. The application settles the run and verifies the Goal before completion."
              : "Stop work on this responsibility for this turn. The application owns its next wakeup or wait; do not execute a future scheduled stage now.",
        };
      });
    } catch (error) {
      if (error instanceof DomainError && ["SCOPE_DENIED", "CONFLICT"].includes(error.code)) {
        const current = await this.store.get("goal", data.goal_id);
        if (
          current.scope === "group" &&
          current.revision === data.expected_revision &&
          current.state === "active"
        )
          await this.update(current, {
            last_report_error: { run_id: runId, code: error.code },
            work_state: "blocked",
            continuation_at: null,
          });
      }
      throw error;
    }
  }
  async recordReportFailure(
    runId: string,
    input: { goal_id: string; expected_revision: number },
    code: string,
  ) {
    if (!["SCOPE_DENIED", "CONFLICT"].includes(code)) return;
    const run = await this.store.get("run", runId);
    const goal = await this.store.get("goal", input.goal_id);
    try {
      await this.scopes.reporting(run, goal);
    } catch {
      return;
    }
    if (
      goal.scope === "group" &&
      goal.revision === input.expected_revision &&
      goal.state === "active"
    )
      await this.update(goal, {
        last_report_error: { run_id: runId, code },
        work_state: "blocked",
        continuation_at: null,
      });
  }
  async assign(context: GoalScope, input: unknown) {
    const data = goalAssignment.parse(input);
    return await this.store.transaction(async () => {
      const goal = await this.require(context, await this.store.get("goal", data.goal_id));
      await this.scope({ thread_id: goal.thread_id, agent_id: data.agent_id });
      if (
        goal.scope !== "group" ||
        goal.revision !== data.expected_revision ||
        !["active", "paused"].includes(goal.state)
      )
        throw new DomainError("CONFLICT");
      if (goal.coordinator_agent_id === data.agent_id) return goal;
      await this.cancelRuns(goal.id, "");
      if (goal.assignment_route_id) {
        const route = await this.store.get("group_route", goal.assignment_route_id);
        if (route.router_run_id) await this.lifecycle.cancel(route.router_run_id);
      }
      return await this.update(goal, {
        coordinator_agent_id: data.agent_id,
        generation: goal.generation + 1,
        assignment_revision: goal.assignment_revision + 1,
        checkpoint_evidence: null,
        evidence_artifact_ids: [],
        assignment_route_id: null,
        last_report_error: null,
        report_run_id: null,
        deferred_by_run_id: null,
        work_state: "ready",
        continuation_at: new Date().toISOString(),
      });
    });
  }
  async recoverCompletion(goalId: string, input: unknown) {
    const data = completionRecovery.parse(input);
    return await this.store.transaction(async () => {
      const goal = await this.store.get("goal", goalId);
      if (
        goal.revision !== data.expected_revision ||
        goal.state !== "active" ||
        !goal.current_run_id
      )
        throw new DomainError("CONFLICT");
      const run = await this.store.get("run", goal.current_run_id);
      if (run.status !== "succeeded" || run.cancellation !== "none")
        throw new DomainError("RECONCILIATION_REQUIRED");
      const { files } = await verifyGoalEvidence(this.lifecycle, goal, data.evidence_artifact_ids);
      const checks =
        goal.verification && evaluateGoalVerification(goal.verification, run.id, files);
      if (checks?.remaining.length) throw new DomainError("CONFLICT");
      await this.update(goal, {
        evidence_artifact_ids: checks ? checks.accepted : data.evidence_artifact_ids,
        verification: checks ? checks.saved : goal.verification,
        progress: data.progress,
        work_state: "completion_pending",
        last_report_error: null,
        report_run_id: run.id,
        continuation_at: null,
      });
      return await this.lifecycle.controlGoal(goal.id, "completed");
    });
  }
  async control(context: GoalScope, input: unknown) {
    const data = goalControl.parse(input);
    const current = await this.require(context, await this.store.get("goal", data.goal_id));
    if (current.revision !== data.expected_revision) throw new DomainError("CONFLICT");
    const saved = await this.lifecycle.controlGoal(current.id, data.state);
    if (data.state !== "active") await this.cancelRuns(current.id);
    return saved;
  }
  private async cancelRuns(goalId: string, exceptId?: string) {
    const goal = await this.store.get("goal", goalId);
    const ids = new Set([goal.current_run_id]);
    for (const run of await this.store.list("run"))
      if (
        (run.goal_id === goalId ||
          ids.has(run.id) ||
          (run.task_id &&
            (await this.store.get("peer_task", run.task_id)).goal_ids.includes(goalId))) &&
        run.id !== exceptId &&
        !terminal.has(run.status)
      )
        await this.lifecycle.cancel(run.id);
  }
  async writeRoutine(runId: string, input: unknown) {
    const data = routineWrite.parse(input);
    return await this.store.transaction(async () => {
      const run = await this.store.get("run", runId);
      await this.scope(run);
      if (data.precheck)
        await requirePrecheckDefinition(this.lifecycle, data.routine_id, data.precheck, run);
      if (data.goal_id) {
        const goal = await this.require(run, await this.store.get("goal", data.goal_id));
        await this.scopes.reporting(run, goal);
        if (goal.state !== "active") throw new DomainError("CONFLICT");
      }
      if (data.goal_id) {
        const goal = await this.store.get("goal", data.goal_id);
        // This standing schedule owns future wakeups; capture's default must not race it.
        const source = await this.store.get("message", run.input_message_id);
        await this.update(goal, {
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
        await this.scope({ thread_id: run.thread_id, agent_id: data.execution_target.agent_id });
      if (data.execution_target?.type === "auto" && (await this.scope(run)).type !== "group")
        throw new DomainError("SCOPE_DENIED", 403);
      const { routine_id, expected_revision, monitor, precheck, ...fields } = data;
      const next = firstDue(data.schedule, data.timezone);
      if (expected_revision === 0) {
        if ((await this.store.list("routine")).some((r) => r.id === routine_id))
          throw new DomainError("CONFLICT");
        return await this.store.put({
          ...this.base(),
          ...fields,
          name: data.name ?? null,
          kind: "routine",
          id: routine_id,
          thread_id: run.thread_id,
          ...(await this.scopes.ownership(run)),
          execution_target:
            data.execution_target ??
            ((await this.scope(run)).type === "group"
              ? { type: "auto" }
              : { type: "agent", agent_id: run.agent_id }),
          assignment_state: "ready",
          error_code: null,
          source_message_id: run.input_message_id,
          source_run_id: run.id,
          provider_selection: run.provider_selection,
          paused_by_goal: false,
          monitor: monitor ?? null,
          monitor_alert_active: false,
          delivery_target: null,
          precheck: precheck ?? null,
          precheck_revision: 1,
          precheck_baseline_sha256: await initialPrecheckBaseline(this.lifecycle, precheck),
          loop_pacing: null,
          loop_progress: null,
          state: "active",
          generation: 1,
          next_run_at: next,
        });
      }
      const current = await this.require(run, await this.store.get("routine", routine_id));
      if (current.revision !== expected_revision || routineIsTerminal(current.state))
        throw new DomainError("CONFLICT");
      for (const pending of await this.store.list("run"))
        if (
          pending.routine_id === current.id &&
          pending.id !== run.id &&
          !terminal.has(pending.status)
        )
          await this.lifecycle.cancel(pending.id);
      if (run.routine_id === current.id)
        await this.update(run, { routine_generation: current.generation + 1 });
      const monitorChanged =
        monitor !== undefined &&
        (monitor?.metric !== current.monitor?.metric || monitor?.above !== current.monitor?.above);
      const precheckChanged =
        precheck !== undefined && JSON.stringify(precheck) !== JSON.stringify(current.precheck);
      return await this.update(current, {
        ...fields,
        ...(precheckChanged
          ? {
              precheck,
              precheck_revision: current.precheck_revision + 1,
              precheck_baseline_sha256: await initialPrecheckBaseline(this.lifecycle, precheck),
            }
          : {}),
        ...(monitorChanged ? { monitor, monitor_alert_active: false } : {}),
        loop_pacing: null,
        loop_progress: null,
        execution_target: data.execution_target ?? current.execution_target,
        assignment_state: "ready",
        error_code: null,
        generation: current.generation + 1,
        next_run_at: next,
        ...(current.state === "paused"
          ? loopControlFields(
              { ...current, schedule: data.schedule, next_run_at: next, loop_progress: null },
              "paused",
            )
          : {}),
        source_message_id: run.input_message_id,
        source_run_id: run.id,
      });
    });
  }
  async controlRoutine(context: GoalScope, input: unknown) {
    const data = routineControl.parse(input);
    return await this.store.transaction(async () => {
      let current = await this.require(context, await this.store.get("routine", data.routine_id));
      if (current.revision !== data.expected_revision || routineIsTerminal(current.state))
        throw new DomainError("CONFLICT");
      if (data.state === "active" && current.goal_id) {
        const goal = await this.store.get("goal", current.goal_id);
        if (goal.state !== "active") throw new DomainError("CONFLICT");
      }
      if (current.schedule.type === "loop") {
        current = await new GroupSchedules(this.lifecycle).reconcileLoop(current);
        if (current.state === data.state || routineIsTerminal(current.state)) return current;
      }
      let restoredSelection = current.provider_selection;
      if (current.restore_pending && data.state === "active") {
        if (!current.agent_id) throw new DomainError("SCOPE_DENIED", 403);
        const connections = new Connections(this.lifecycle);
        restoredSelection = await connections.resolveSelection(
          await this.store.get("agent", current.agent_id),
          current.thread_id,
        );
        if (!restoredSelection) throw new HarnessError("LOGIN_REQUIRED");
        const connection = await connections.get(restoredSelection.connection_id);
        if (connection.login !== "authenticated") throw new HarnessError("LOGIN_REQUIRED");
        if (connection.effective_billing_source !== restoredSelection.billing_source)
          throw new HarnessError("BILLING_MISMATCH");
      }
      const saved = await this.update(current, {
        state: data.state,
        generation: current.generation + 1,
        paused_by_goal: false,
        next_run_at: data.state === "active" ? firstDue(current.schedule, current.timezone) : null,
        ...(current.restore_pending && data.state === "active"
          ? { restore_pending: false, provider_selection: restoredSelection }
          : {}),
        ...loopControlFields(current, data.state),
      });
      for (const run of await this.store.list("run"))
        if (run.routine_id === current.id && !terminal.has(run.status))
          await this.lifecycle.cancel(run.id);
      return saved;
    });
  }
  async observeRoutine(runId: string, input: unknown) {
    const reading = routineReading.parse(input);
    const run = await this.store.get("run", runId);
    const message = await this.store.get("message", run.input_message_id);
    if (!run.routine_id || message.purpose !== "continuation" || message.author !== "routine")
      throw new DomainError("SCOPE_DENIED", 403);
    const routine = await this.require(run, await this.store.get("routine", run.routine_id));
    if (!routine.monitor || routine.generation !== run.routine_generation)
      throw new DomainError("CONFLICT");
    if (run.routine_observation) {
      if (run.routine_observation.value !== reading.value) throw new DomainError("CONFLICT");
      return run.routine_observation;
    }
    const decision =
      reading.value <= routine.monitor.above
        ? "below_threshold"
        : routine.monitor_alert_active
          ? "already_alerted"
          : "alert";
    const observation = { ...reading, decision } as const;
    await this.update(run, { routine_observation: observation });
    return observation;
  }
  async noUpdate(runId: string) {
    const run = await this.store.get("run", runId);
    const message = await this.store.get("message", run.input_message_id);
    if (
      (!run.goal_id && !run.routine_id) ||
      run.routine_observation?.decision === "alert" ||
      run.publication === "immediate" ||
      message.purpose !== "continuation" ||
      (await this.store.list("artifact", { run_id: runId })).some((a) => a.run_id === runId) ||
      (await this.store.list("human_request")).some((r) => r.source_run_id === runId) ||
      (await this.store.list("goal")).some(
        (g) => g.report_run_id === runId && g.work_state !== "ready",
      )
    )
      throw new DomainError("CONFLICT");
    return await this.update(run, { publication: "quiet" });
  }
  /** Called only by Background. Unknown native work and peer/HITL work keep their existing owner. */
  async advance(now = new Date()) {
    for (const item of await this.store.list("goal", { state: "active" })) {
      try {
        await this.store.transaction(async () => await this.advanceGoal(item.id, now));
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
      }
    }
  }
  private async advanceGoal(id: string, now: Date) {
    let goal = await this.store.get("goal", id);
    if (goal.state !== "active") return;
    await this.scope(goal);
    const run = goal.current_run_id ? await this.store.get("run", goal.current_run_id) : null;
    if (run && !terminal.has(run.status)) return;
    if (
      run &&
      (await this.store.list("human_request", { state: "pending" })).some(
        (request) => request.source_run_id === run.id && request.state === "pending",
      )
    )
      return;
    let coordinator = this.scopes.coordinator(goal);
    if (goal.scope === "group" && !coordinator) {
      if (!goal.assignment_route_id) {
        const route = await new Groups(this.lifecycle).selectMember(
          goal.thread_id,
          `Choose a coordinator for this existing group goal. Do not recreate it.\n${goal.objective || goal.title}`,
        );
        await this.update(goal, {
          assignment_route_id: route.id,
          work_state: "waiting_assignment",
        });
        return;
      }
      const route = await this.store.get("group_route", goal.assignment_route_id);
      if (route.state === "rejected") {
        if (goal.work_state !== "blocked")
          await this.update(goal, {
            work_state: "blocked",
            progress:
              "A coordinator could not be assigned. Inspect the selection before continuing.",
            continuation_at: null,
          });
        return;
      }
      if (route.state !== "selected" || !route.selected_agent_id) return;
      try {
        coordinator = await new Groups(this.lifecycle).selectedMember(route.id);
      } catch (error) {
        if (!(error instanceof DomainError)) throw error;
        if (goal.work_state !== "blocked")
          await this.update(goal, {
            work_state: "blocked",
            continuation_at: null,
            progress: "Coordinator selection is stale. Assign a current member before continuing.",
          });
        return;
      }
      goal = await this.update(goal, {
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
      goal = await this.update(goal, {
        current_run_id: null,
        work_state: "ready",
        continuation_at: new Date().toISOString(),
      });
    }
    if (run?.task_id) {
      const task = await this.store.get("peer_task", run.task_id);
      if (!["completed", "failed", "cancelled"].includes(task.state)) {
        if (task.current_run_id !== run.id)
          await this.update(goal, {
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
        (await this.store.list("routine", { state: "active" })).some(
          (r) => r.goal_id === goal.id && r.state === "active",
        )
      ) {
        await this.update(goal, {
          work_state: "ready",
          current_run_id: null,
          continuation_at: null,
          progress: "The run was stopped. Future Routine occurrences remain scheduled.",
        });
        return;
      }
      if (goal.work_state !== "blocked" || goal.continuation_at)
        await this.update(goal, {
          work_state: "blocked",
          continuation_at: null,
          progress: "The last run did not succeed. Inspect its outcome before continuing.",
        });
      return;
    }
    if (goal.work_state === "completion_pending") {
      if (!run || goal.report_run_id !== run.id) return;
      await this.finishCompletion(goal, run, now);
      return;
    }
    if (
      goal.scope === "group" &&
      goal.current_run_id === run?.id &&
      run.task_id &&
      (await this.store.get("peer_task", run.task_id)).state === "completed" &&
      goal.report_run_id !== run.id &&
      goal.work_state === "ready"
    ) {
      await this.update(goal, {
        work_state: "blocked",
        continuation_at: null,
        progress: "The task finished without a structured responsibility report.",
      });
      return;
    }
    if (
      run?.routine_id &&
      goal.work_state === "ready" &&
      !(await this.store.list("routine", { state: "active" })).some(
        (r) => r.goal_id === goal.id && routineHasFuture(r),
      )
    ) {
      await this.update(goal, {
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
      await this.update(goal, {
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
    if (
      (await this.store.list("routine", { thread_id: goal.thread_id, state: "active" })).some(
        (routine) => routine.goal_id === goal.id && routineHasFuture(routine),
      )
    )
      return;
    if (
      (await this.store.list("run")).some((r) => r.goal_id === goal.id && !terminal.has(r.status))
    )
      return;
    await this.store.command(
      `goal:${goal.id}:${goal.generation}:${goal.continuation_sequence}`,
      { goal_id: goal.id, generation: goal.generation, sequence: goal.continuation_sequence },
      async () => {
        const message = await this.store.put({
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
        const next = await this.lifecycle.enqueue(message, coordinator, { goal_id: goal.id });
        await this.update(goal, {
          current_run_id: next.id,
          continuation_at: null,
          source_run_ids: [...new Set([...goal.source_run_ids, next.id])].slice(-200),
        });
        return { run_id: next.id };
      },
    );
  }
  private async finishCompletion(goal: Entity<"goal">, run: Entity<"run">, now: Date) {
    let files: VerifiedGoalFiles;
    try {
      files =
        goal.verification && !goal.evidence_artifact_ids.length
          ? new Map()
          : (await verifyGoalEvidence(this.lifecycle, goal, goal.evidence_artifact_ids)).files;
    } catch {
      await this.update(goal, {
        work_state: "blocked",
        continuation_at: null,
        progress:
          "Completion evidence could not be verified. Inspect the retained artifact before continuing.",
      });
      return;
    }
    if (goal.verification) {
      const { saved, remaining, accepted } = evaluateGoalVerification(
        goal.verification,
        run.id,
        files,
      );
      if (remaining.length) {
        const exhausted = saved.attempts_used >= saved.attempt_limit;
        const scheduled = (await this.store.list("routine", { state: "active" })).some(
          (routine) => routine.goal_id === goal.id && routineHasFuture(routine),
        );
        const instruction = `Verification needs these results: ${remaining.join(" ")} Repair only the remaining requirements and submit fresh evidence. Keep already verified evidence. Follow the user's objective and constraints.`;
        const progress = `Verification attempt ${saved.attempts_used} of ${saved.attempt_limit} failed. ${remaining.join(" ")} ${exhausted ? "Paused because the verification attempt limit was reached." : "The Goal is still active. The remaining requirements will be tried again."}`;
        await this.update(goal, {
          verification: saved,
          evidence_artifact_ids: accepted,
          progress,
          work_state: exhausted ? "blocked" : "ready",
          continuation_at: exhausted || scheduled ? null : now.toISOString(),
          continuation_instruction: instruction,
          continuation_sequence: goal.continuation_sequence + 1,
        });
        if (exhausted) await this.lifecycle.controlGoal(goal.id, "paused");
        return;
      }
      await this.update(goal, { verification: saved, evidence_artifact_ids: accepted });
    }
    await this.lifecycle.controlGoal(goal.id, "completed");
  }
  async context(run: Entity<"run">) {
    return [...(await this.contextSections(run)), `Dates now: ${new Date().toISOString()}.`].join(
      "\n\n",
    );
  }
  async contextSections(run: Entity<"run">) {
    const state = await this.list(run);
    // Bound automatic injection; the scoped list tool supplies the complete authoritative inventory.
    const goals = state.goals
      .filter((g) => g.id === run.goal_id || g.state === "active")
      .slice(-20)
      .map((g) => ({
        ...g,
        objective: g.objective.slice(0, 600),
        verification: g.verification && {
          ...g.verification,
          checks: g.verification.checks.map(({ exact_text, ...check }) => ({
            ...check,
            exact_text: exact_text && exact_text.length <= 500 ? exact_text : undefined,
            exact_text_requires_lookup: !!exact_text && exact_text.length > 500,
          })),
        },
        progress: g.progress.slice(0, 400),
        continuation_instruction: g.continuation_instruction.slice(0, 400),
        source_message_ids: g.source_message_ids.slice(-5),
        source_run_ids: g.source_run_ids.slice(-5),
        checkpoint_evidence: undefined,
      }));
    return [
      responsibilityInstructions,
      `Current authoritative responsibility state.\n${JSON.stringify({ goal_id: run.goal_id, routine_id: run.routine_id, goals, routines: state.routines.slice(-20).map((r) => ({ ...r, instruction: r.instruction.slice(0, 500) })), truncated: state.goals.length > goals.length || state.routines.length > 20 })}`,
      state.routines.find((routine) => routine.id === run.routine_id)?.monitor
        ? "For this threshold check, first obtain the current numeric reading from the configured source. Call ngertiin.observe_routine once with that value before replying or publishing a file. If the decision is alert, include the measured value, threshold and any requested deliverable. For below_threshold or already_alerted, finish quietly without artifacts. Verify the number from the source each time. Never invent a reading when the source is unavailable."
        : "",
    ];
  }
}
