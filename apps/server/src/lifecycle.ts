import {
  admissionInput,
  agentInput,
  agentSnapshot,
  agentUpdate,
  artifactInput,
  DomainError,
  type Entity,
  goalInput,
  routineInput,
  threadInput,
} from "./contracts";
import type { Store } from "./store";
import { Workspaces } from "./workspaces";

const active = new Set(["dispatching", "running", "cancel_requested"]);
const final = new Set(["succeeded", "failed", "cancelled", "steered"]);

/** Owns admission, identity, queue decisions, stop intent and recovery. Harnesses own execution. */
export class Lifecycle {
  readonly epoch = crypto.randomUUID();
  constructor(readonly store: Store) {
    this.store.transaction(() => {
      for (const run of this.store.list("run")) {
        if (active.has(run.status))
          this.update(run, { status: "unknown", outcome: "unknown", activity: "unknown" });
      }
      for (const control of this.store.list("control")) {
        if (control.state === "requested")
          this.update(control, { state: "unknown", error_code: "NATIVE_UNKNOWN" });
        if (control.state === "requested" && control.queued_run_id) {
          const queued = this.store.get("run", control.queued_run_id);
          if (queued.status === "queued") this.update(queued, { delivery: "unknown" });
        }
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
    if (
      thread.purpose === "routing" &&
      thread.group_thread_id &&
      !this.store.get("thread", thread.group_thread_id).member_agent_ids.includes(agentId)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return { thread, agent };
  }

  create(kind: "agent" | "thread" | "goal" | "routine" | "artifact", input: unknown): Entity {
    return this.store.transaction(() => {
      const base = this.base();
      switch (kind) {
        case "agent":
          return this.createAgent(input);
        case "thread": {
          const data = threadInput.parse(input);
          for (const agentId of data.member_agent_ids) this.store.get("agent", agentId);
          if (data.type === "dm") {
            const existing = this.store
              .list("thread")
              .find(
                (item) =>
                  item.type === "dm" && item.member_agent_ids[0] === data.member_agent_ids[0],
              );
            if (existing) return existing;
          }
          return this.store.put({
            ...base,
            ...data,
            kind,
            purpose: "conversation",
            group_thread_id: null,
          });
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
          return this.store.put({
            ...base,
            ...data,
            kind,
            workspace_id: null,
            name: "artifact",
            size_bytes: null,
            source_path: null,
            origin: "metadata",
            source_artifact_id: null,
            native_session_id: null,
            native_run_id: null,
          });
        }
      }
    });
  }

  createAgent(input: unknown): Entity<"agent"> {
    const data = agentInput.parse(input);
    if (data.workspace_id !== null) throw new DomainError("SCOPE_DENIED", 403);
    const connection = this.store.get("connection", data.connection_id);
    if (connection.state !== "active" || connection.harness !== data.harness)
      throw new DomainError("SCOPE_DENIED", 403);
    const base = this.base();
    const handle = data.handle ?? `agent_${base.id.replaceAll("-", "")}`;
    if (this.store.list("agent").some((item) => item.handle === handle))
      throw new DomainError("CONFLICT");
    return this.store.put({
      ...base,
      ...data,
      handle,
      kind: "agent",
      grant_revision: 1,
      system_role: null,
      configuration_access: "self",
    });
  }

  updateAgent(agentId: string, input: unknown): Entity<"agent"> {
    const data = agentUpdate.parse(input);
    return this.store.transaction(() => {
      const current = this.store.get("agent", agentId);
      if (current.revision !== data.expected_revision) throw new DomainError("CONFLICT");
      const merged = agentInput.parse({ ...agentInput.strip().parse(current), ...data.changes });
      if (merged.workspace_id !== null) {
        const workspace = new Workspaces(this).get(merged.workspace_id);
        if (workspace.agent_id !== agentId) throw new DomainError("SCOPE_DENIED", 403);
      }
      const connection = this.store.get("connection", merged.connection_id);
      if (connection.state !== "active" || connection.harness !== merged.harness)
        throw new DomainError("SCOPE_DENIED", 403);
      if (
        merged.handle === null ||
        this.store
          .list("agent")
          .some((item) => item.id !== agentId && item.handle === merged.handle)
      )
        throw new DomainError("CONFLICT");
      return this.update(current, merged);
    });
  }

  /** Active work keeps its dispatch snapshot; configuration edits affect the next claim. */
  executionAgent(threadId: string, agentId: string): Entity<"agent"> {
    const current = this.store.get("agent", agentId);
    const running = this.store
      .list("run")
      .find(
        (item) =>
          item.thread_id === threadId &&
          item.agent_id === agentId &&
          (active.has(item.status) || item.status === "unknown"),
      );
    if (!running?.agent_snapshot) return current;
    const { agent_id: _id, revision, ...profile } = running.agent_snapshot;
    return { ...current, ...profile, revision };
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
      this.scope(data.thread_id, data.agent_id);
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
      for (const artifactId of data.artifact_ids) {
        const item = this.store.get("artifact", artifactId);
        if (
          item.thread_id !== data.thread_id ||
          item.agent_id !== data.agent_id ||
          !item.workspace_id ||
          item.source_path === null
        )
          throw new DomainError("SCOPE_DENIED", 403);
        const workspace = new Workspaces(this).get(item.workspace_id);
        if (workspace.thread_id !== data.thread_id || workspace.agent_id !== data.agent_id)
          throw new DomainError("SCOPE_DENIED", 403);
      }
      const runId = crypto.randomUUID();
      const message = this.store.put({
        ...this.base(),
        kind: "message",
        purpose: "conversation",
        source_run_id: null,
        thread_id: data.thread_id,
        author,
        author_agent_id: null,
        routine_id: data.routine_id,
        run_id: runId,
        text: data.text,
        artifact_ids: data.artifact_ids,
        state: "complete",
      });
      const run = this.enqueue(message, data.agent_id, {
        id: runId,
        goal_id: data.goal_id,
        routine_id: data.routine_id,
      });
      return { message, run };
    });
  }

  /** Trusted application admission of an existing authored group message. */
  enqueue(
    message: Entity<"message">,
    agentId: string,
    options: {
      id?: string;
      task_id?: string;
      goal_id?: string | null;
      routine_id?: string | null;
    } = {},
  ): Entity<"run"> {
    const { agent, thread } = this.scope(message.thread_id, agentId);
    if (this.store.get("message", message.id).thread_id !== thread.id)
      throw new DomainError("SCOPE_DENIED", 403);
    return this.store.put({
      ...this.base(),
      id: options.id ?? crypto.randomUUID(),
      kind: "run",
      thread_id: thread.id,
      agent_id: agentId,
      input_message_id: message.id,
      task_id: options.task_id ?? null,
      thread_revision: thread.type === "group" ? thread.revision : null,
      goal_id: options.goal_id ?? null,
      routine_id: options.routine_id ?? null,
      status: "queued",
      cancellation: "none",
      outcome: "none",
      grant_revision: agent.grant_revision,
      dispatch_token: null,
      authority_epoch: null,
      binding_id: null,
      native_run_id: null,
      agent_snapshot: null,
      delivery: "pending",
      activity: "idle",
      diagnostic: null,
      native_dispatch_id: null,
      workspace_id: null,
      workspace_revision: null,
      native_tools: [],
      product_tools: [],
    });
  }

  bind(
    threadId: string,
    agentId: string,
    nativeSessionId: string,
    workspace: Entity<"workspace"> = new Workspaces(this).ensure(threadId, agentId),
  ) {
    return this.store.transaction(() => {
      this.scope(threadId, agentId);
      const agent = this.executionAgent(threadId, agentId);
      const existing = this.store
        .list("binding")
        .find((item) => item.active && item.thread_id === threadId && item.agent_id === agentId);
      if (existing) {
        if (
          existing.connection_id === agent.connection_id &&
          existing.harness === agent.harness &&
          existing.agent_revision === agent.revision &&
          existing.workspace_id === (workspace?.id ?? null)
        ) {
          if (existing.native_session_id !== nativeSessionId) throw new DomainError("CONFLICT");
          return existing;
        }
        this.update(existing, { active: false });
      }
      return this.store.put({
        ...this.base(),
        kind: "binding",
        thread_id: threadId,
        agent_id: agentId,
        harness: agent.harness,
        connection_id: agent.connection_id,
        native_session_id: nativeSessionId,
        generation: (existing?.generation ?? 0) + 1,
        active: true,
        agent_revision: agent.revision,
        workspace_id: workspace?.id ?? null,
        workspace_revision: workspace?.revision ?? null,
      });
    });
  }

  /** Adapter seam only; no executor is registered by this foundation. */
  claimNext(threadId: string, agentId: string): Entity<"run"> | null {
    return this.store.transaction(() => {
      const { agent, thread } = this.scope(threadId, agentId);
      const lane = this.store
        .list("run")
        .filter((run) => run.thread_id === threadId && run.agent_id === agentId);
      if (lane.some((run) => active.has(run.status) || run.status === "unknown")) return null;
      const next = lane.find((run) => run.status === "queued");
      if (next?.delivery !== "pending") return null;
      if (next.thread_revision !== null && next.thread_revision !== thread.revision)
        throw new DomainError("STALE_DISPATCH");
      this.responsibility(next);
      if (agent.grant_revision !== next.grant_revision) throw new DomainError("STALE_DISPATCH");
      const binding = this.store
        .list("binding")
        .find((item) => item.active && item.thread_id === threadId && item.agent_id === agentId);
      if (!binding) throw new DomainError("CONFLICT");
      if (
        binding.connection_id !== agent.connection_id ||
        binding.harness !== agent.harness ||
        binding.agent_revision !== agent.revision
      )
        throw new DomainError("STALE_DISPATCH");
      return this.update(next, {
        status: "dispatching",
        dispatch_token: crypto.randomUUID(),
        authority_epoch: this.epoch,
        binding_id: binding.id,
        workspace_id: binding.workspace_id,
        workspace_revision: binding.workspace_revision,
        agent_snapshot: agentSnapshot.parse({
          ...agentInput.strip().parse(agent),
          agent_id: agent.id,
          revision: agent.revision,
        }),
        delivery: "delivered",
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
          activity: run.cancellation === "requested" ? "stopping" : "generating",
        });
      return run;
    });
  }

  authorizeDispatch(runId: string, token: string) {
    return this.store.transaction(() => {
      const run = this.dispatch(runId, token);
      const { thread } = this.scope(run.thread_id, run.agent_id);
      if (run.thread_revision !== null && thread.revision !== run.thread_revision)
        throw new DomainError("STALE_DISPATCH");
      if (thread.purpose === "routing" && thread.group_thread_id) {
        const group = this.store.get("thread", thread.group_thread_id);
        if (!group.member_agent_ids.includes(run.agent_id))
          throw new DomainError("SCOPE_DENIED", 403);
      }
      const agent = this.executionAgent(run.thread_id, run.agent_id);
      if (run.cancellation !== "none" || agent.grant_revision !== run.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      this.responsibility(run);
      if (run.workspace_id) new Workspaces(this).authorizeRun(run);
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
      const answer = this.store.answer(runId);
      if (answer && answer.state !== (outcome === "succeeded" ? "complete" : "partial"))
        this.update(answer, { state: outcome === "succeeded" ? "complete" : "partial" });
      return this.update(run, {
        status: outcome,
        outcome,
        cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
        activity: outcome === "unknown" ? "unknown" : "idle",
      });
    });
  }
  /** Persist redacted native output in the owning thread before publishing its terminal run. */
  appendAnswer(runId: string, text: string, state: "complete" | "partial" = "complete") {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (!active.has(run.status) || !run.native_run_id || run.authority_epoch !== this.epoch)
        throw new DomainError("STALE_DISPATCH");
      return this.writeAnswer(run, text, state);
    });
  }

  private writeAnswer(run: Entity<"run">, text: string, state: "complete" | "partial") {
    const existing = this.store.answer(run.id);
    if (existing) {
      if (existing.text === text && existing.state === state) return existing;
      return this.update(existing, { text, state });
    }
    return this.store.put({
      ...this.base(),
      kind: "message",
      purpose: "conversation",
      source_run_id: null,
      thread_id: run.thread_id,
      author: "agent",
      author_agent_id: run.agent_id,
      routine_id: null,
      run_id: run.id,
      text,
      state,
      artifact_ids: [],
    });
  }

  observe(
    runId: string,
    token: string,
    fields: Pick<
      Partial<Entity<"run">>,
      "activity" | "native_dispatch_id" | "diagnostic" | "native_tools" | "product_tools"
    >,
  ) {
    return this.store.transaction(() => {
      const run = this.dispatch(runId, token);
      return this.update(run, fields);
    });
  }

  recordDiagnostic(runId: string, diagnostic: Entity<"run">["diagnostic"]) {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (JSON.stringify(run.diagnostic) === JSON.stringify(diagnostic)) return run;
      return this.update(run, { diagnostic });
    });
  }

  cancel(runId: string) {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (final.has(run.status) || run.cancellation === "requested") return run;
      return this.update(
        run,
        run.status === "queued"
          ? {
              status: "cancelled",
              outcome: "cancelled",
              cancellation: "confirmed",
              delivery: "removed",
            }
          : {
              status: run.status === "unknown" ? "unknown" : "cancel_requested",
              cancellation: "requested",
              activity: run.status === "unknown" ? "unknown" : "stopping",
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
    text?: string,
    nativeRunId?: string,
  ) {
    if (!receiptId.trim()) throw new DomainError("RECONCILIATION_REQUIRED");
    return this.store.command(
      receiptId,
      { runId, expectedRevision, outcome, text: text ?? null, nativeRunId: nativeRunId ?? null },
      () => {
        const run = this.store.get("run", runId);
        if (run.revision !== expectedRevision || run.status !== "unknown")
          throw new DomainError("CONFLICT");
        if (outcome === "cancelled" && run.cancellation !== "requested")
          throw new DomainError("CONFLICT");
        if (text !== undefined && (text || this.store.answer(run.id)))
          this.writeAnswer(run, text, outcome === "succeeded" ? "complete" : "partial");
        return this.update(run, {
          status: outcome,
          outcome,
          cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
          activity: "idle",
          native_run_id: nativeRunId ?? run.native_run_id,
        });
      },
    );
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
