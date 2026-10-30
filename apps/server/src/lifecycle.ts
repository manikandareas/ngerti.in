import {
  admissionInput,
  agentInput,
  artifactInput,
  DomainError,
  type Entity,
  goalInput,
  routineInput,
  threadInput,
} from "./contracts";
import type { Store } from "./store";

const active = new Set(["dispatching", "running", "cancel_requested"]);
const final = new Set(["succeeded", "failed", "cancelled"]);

/** Owns admission, identity, queue decisions, stop intent and recovery. Harnesses own execution. */
export class Lifecycle {
  readonly epoch = crypto.randomUUID();
  constructor(readonly store: Store) {
    this.store.transaction(() => {
      for (const run of this.store.list("run")) {
        if (active.has(run.status)) this.update(run, { status: "unknown", outcome: "unknown" });
      }
    });
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

  private scope(threadId: string, agentId: string) {
    const thread = this.store.get("thread", threadId);
    const agent = this.store.get("agent", agentId);
    if (!thread.member_agent_ids.includes(agent.id)) throw new DomainError("SCOPE_DENIED", 403);
    return { thread, agent };
  }

  create(kind: "agent" | "thread" | "goal" | "routine" | "artifact", input: unknown): Entity {
    return this.store.transaction(() => {
      const base = this.base();
      switch (kind) {
        case "agent":
          return this.store.put({ ...base, ...agentInput.parse(input), kind, grant_revision: 1 });
        case "thread": {
          const data = threadInput.parse(input);
          for (const agentId of data.member_agent_ids) this.store.get("agent", agentId);
          return this.store.put({ ...base, ...data, kind });
        }
        case "goal": {
          const data = goalInput.parse(input);
          this.scope(data.thread_id, data.agent_id);
          return this.store.put({
            ...base,
            ...data,
            kind,
            state: "active",
            generation: 1,
            evidence_artifact_ids: [],
          });
        }
        case "routine": {
          const data = routineInput.parse(input);
          this.scope(data.thread_id, data.agent_id);
          if (data.goal_id) this.checkGoal(data.goal_id, data.thread_id, data.agent_id);
          return this.store.put({
            ...base,
            ...data,
            kind,
            state: "active",
            generation: 1,
            next_run_at: data.schedule.type === "once" ? data.schedule.at : data.schedule.anchor_at,
          });
        }
        case "artifact": {
          const data = artifactInput.parse(input);
          this.scope(data.thread_id, data.agent_id);
          if (data.run_id) {
            const run = this.store.get("run", data.run_id);
            if (run.thread_id !== data.thread_id || run.agent_id !== data.agent_id)
              throw new DomainError("SCOPE_DENIED", 403);
          }
          return this.store.put({ ...base, ...data, kind });
        }
      }
    });
  }

  private checkGoal(goalId: string, threadId: string, agentId: string) {
    const goal = this.store.get("goal", goalId);
    if (goal.thread_id !== threadId || goal.agent_id !== agentId)
      throw new DomainError("SCOPE_DENIED", 403);
    if (goal.state !== "active") throw new DomainError("CONFLICT");
    return goal;
  }

  private responsibility(run: Entity<"run">) {
    if (run.goal_id) this.checkGoal(run.goal_id, run.thread_id, run.agent_id);
    if (run.routine_id) {
      const routine = this.store.get("routine", run.routine_id);
      if (routine.state !== "active") throw new DomainError("CONFLICT");
      if (routine.goal_id) this.checkGoal(routine.goal_id, run.thread_id, run.agent_id);
    }
  }

  admit(input: unknown, author: "user" | "routine" = "user") {
    const data = admissionInput.parse(input);
    return this.store.transaction(() => {
      const { agent } = this.scope(data.thread_id, data.agent_id);
      if (data.goal_id) this.checkGoal(data.goal_id, data.thread_id, data.agent_id);
      if (data.routine_id) {
        const routine = this.store.get("routine", data.routine_id);
        if (
          routine.thread_id !== data.thread_id ||
          routine.agent_id !== data.agent_id ||
          routine.goal_id !== data.goal_id
        )
          throw new DomainError("SCOPE_DENIED", 403);
        if (routine.state !== "active") throw new DomainError("CONFLICT");
      }
      const runId = crypto.randomUUID();
      const message = this.store.put({
        ...this.base(),
        kind: "message",
        thread_id: data.thread_id,
        author,
        author_agent_id: null,
        routine_id: data.routine_id,
        run_id: runId,
        text: data.text,
        state: "complete",
      });
      const run = this.store.put({
        ...this.base(),
        id: runId,
        kind: "run",
        thread_id: data.thread_id,
        agent_id: data.agent_id,
        input_message_id: message.id,
        goal_id: data.goal_id,
        routine_id: data.routine_id,
        status: "queued",
        cancellation: "none",
        outcome: "none",
        grant_revision: agent.grant_revision,
        dispatch_token: null,
        authority_epoch: null,
        binding_id: null,
        native_run_id: null,
      });
      return { message, run };
    });
  }

  bind(threadId: string, agentId: string, nativeSessionId: string) {
    return this.store.transaction(() => {
      const { agent } = this.scope(threadId, agentId);
      const existing = this.store
        .list("binding")
        .find((item) => item.thread_id === threadId && item.agent_id === agentId);
      if (existing) {
        if (
          existing.native_session_id !== nativeSessionId ||
          existing.connection_id !== agent.connection_id ||
          existing.harness !== agent.harness
        )
          throw new DomainError("CONFLICT");
        return existing;
      }
      return this.store.put({
        ...this.base(),
        kind: "binding",
        thread_id: threadId,
        agent_id: agentId,
        harness: agent.harness,
        connection_id: agent.connection_id,
        native_session_id: nativeSessionId,
        generation: 1,
      });
    });
  }

  /** Adapter seam only; no executor is registered by this foundation. */
  claimNext(threadId: string, agentId: string): Entity<"run"> | null {
    return this.store.transaction(() => {
      const { agent } = this.scope(threadId, agentId);
      const lane = this.store
        .list("run")
        .filter((run) => run.thread_id === threadId && run.agent_id === agentId);
      if (lane.some((run) => active.has(run.status) || run.status === "unknown")) return null;
      const next = lane.find((run) => run.status === "queued");
      if (!next) return null;
      this.responsibility(next);
      if (agent.grant_revision !== next.grant_revision) throw new DomainError("STALE_DISPATCH");
      const binding = this.store
        .list("binding")
        .find((item) => item.thread_id === threadId && item.agent_id === agentId);
      if (!binding) throw new DomainError("CONFLICT");
      return this.update(next, {
        status: "dispatching",
        dispatch_token: crypto.randomUUID(),
        authority_epoch: this.epoch,
        binding_id: binding.id,
      });
    });
  }

  private dispatch(runId: string, token: string) {
    const run = this.store.get("run", runId);
    if (
      !active.has(run.status) ||
      run.dispatch_token !== token ||
      run.authority_epoch !== this.epoch
    )
      throw new DomainError("STALE_DISPATCH");
    return run;
  }

  started(runId: string, token: string, nativeRunId?: string) {
    return this.store.transaction(() => {
      const run = this.dispatch(runId, token);
      if (
        run.native_run_id !== null &&
        nativeRunId !== undefined &&
        run.native_run_id !== nativeRunId
      )
        throw new DomainError("STALE_DISPATCH");
      if (run.status === "dispatching" || (nativeRunId !== undefined && run.native_run_id === null))
        return this.update(run, {
          status: run.status === "dispatching" ? "running" : run.status,
          native_run_id: nativeRunId ?? run.native_run_id,
        });
      return run;
    });
  }

  authorizeDispatch(runId: string, token: string) {
    return this.store.transaction(() => {
      const run = this.dispatch(runId, token);
      const { agent } = this.scope(run.thread_id, run.agent_id);
      if (run.cancellation !== "none" || agent.grant_revision !== run.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      this.responsibility(run);
      if (!run.binding_id) throw new DomainError("STALE_DISPATCH");
      const binding = this.store.get("binding", run.binding_id);
      if (
        binding.connection_id !== agent.connection_id ||
        binding.harness !== agent.harness ||
        binding.agent_id !== agent.id ||
        binding.thread_id !== run.thread_id
      )
        throw new DomainError("STALE_DISPATCH");
      return run;
    });
  }

  /** Basic durable scheduling seam. Conversational creation, cron/DST and quiet behavior belong to NMA-057. */
  fireRoutine(routineId: string, now: Date) {
    return this.store.transaction(() => {
      const routine = this.store.get("routine", routineId);
      if (
        routine.state !== "active" ||
        !routine.next_run_at ||
        Date.parse(routine.next_run_at) > now.getTime()
      )
        return null;
      if (routine.goal_id) this.checkGoal(routine.goal_id, routine.thread_id, routine.agent_id);
      if (
        this.store.list("run").some((run) => run.routine_id === routineId && !final.has(run.status))
      )
        return null;
      let scheduledFor = routine.next_run_at;
      let next: string | null = null;
      if (routine.schedule.type === "interval") {
        const start = Date.parse(routine.next_run_at);
        const period = routine.schedule.every_ms;
        const latest = start + Math.floor((now.getTime() - start) / period) * period;
        scheduledFor = new Date(latest).toISOString();
        next = new Date(latest + period).toISOString();
      }
      return this.store.command(
        `routine:${routine.id}:${routine.generation}:${scheduledFor}`,
        { scheduledFor },
        () => {
          const receipt = this.admit(
            {
              thread_id: routine.thread_id,
              agent_id: routine.agent_id,
              text: routine.instruction,
              goal_id: routine.goal_id,
              routine_id: routine.id,
            },
            "routine",
          );
          const occurrence = this.store.put({
            ...this.base(),
            kind: "occurrence",
            routine_id: routine.id,
            routine_generation: routine.generation,
            scheduled_for: scheduledFor,
            run_id: receipt.run.id,
          });
          this.update(routine, { next_run_at: next });
          return occurrence;
        },
      );
    });
  }

  settle(runId: string, token: string, outcome: "succeeded" | "failed" | "cancelled" | "unknown") {
    return this.store.transaction(() => {
      const run = this.dispatch(runId, token);
      if (outcome === "cancelled" && run.cancellation !== "requested")
        throw new DomainError("CONFLICT");
      return this.update(run, {
        status: outcome,
        outcome,
        cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
      });
    });
  }

  cancel(runId: string) {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (final.has(run.status) || run.cancellation === "requested") return run;
      return this.update(
        run,
        run.status === "queued"
          ? { status: "cancelled", outcome: "cancelled", cancellation: "confirmed" }
          : {
              status: run.status === "unknown" ? "unknown" : "cancel_requested",
              cancellation: "requested",
            },
      );
    });
  }

  /** Unknown work cannot be queued again. Only a native receipt can resolve it, in a later adapter. */
  reconcile(
    runId: string,
    expectedRevision: number,
    outcome: "succeeded" | "failed" | "cancelled",
    receiptId: string,
  ) {
    if (!receiptId.trim()) throw new DomainError("RECONCILIATION_REQUIRED");
    return this.store.command(receiptId, { runId, expectedRevision, outcome }, () => {
      const run = this.store.get("run", runId);
      if (run.revision !== expectedRevision || run.status !== "unknown")
        throw new DomainError("CONFLICT");
      if (outcome === "cancelled" && run.cancellation !== "requested")
        throw new DomainError("CONFLICT");
      return this.update(run, {
        status: outcome,
        outcome,
        cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
      });
    });
  }

  controlGoal(goalId: string, state: "paused" | "stopped" | "active") {
    return this.store.transaction(() => {
      const goal = this.store.get("goal", goalId);
      if (goal.state === "completed") throw new DomainError("CONFLICT");
      if (goal.state === state) return goal;
      const result = this.update(goal, { state, generation: goal.generation + 1 });
      if (state !== "active") {
        for (const routine of this.store.list("routine")) {
          if (routine.goal_id === goalId && routine.state === "active")
            this.update(routine, { state, generation: routine.generation + 1 });
        }
        for (const run of this.store.list("run"))
          if (run.goal_id === goalId && !final.has(run.status)) this.cancel(run.id);
      }
      return result;
    });
  }
}
