import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import {
  admissionInput,
  agentInput,
  agentSnapshot,
  agentUpdate,
  artifactInput,
  DomainError,
  type Entity,
  goalInput,
  goal as goalSchema,
  routineInput,
  routine as routineSchema,
  threadInput,
} from "./contracts";
import { GroupSchedules } from "./goals/group-schedules";
import { dueWindow, firstDue } from "./goals/schedule";
import { ResponsibilityScope } from "./goals/scope";
import type { GroupRouter } from "./groups/router";
import { InteractionJournal } from "./runs/interaction-journal";
import { canRetryResponse } from "./runs/retry-policy";
import type { Store } from "./store";
import { Workspaces } from "./workspaces/service";

const active = new Set(["dispatching", "running", "cancel_requested"]);
const final = new Set(["succeeded", "failed", "cancelled", "steered"]);

/** Owns admission, identity, queue decisions, stop intent and recovery. Harnesses own execution. */
export class Lifecycle {
  readonly epoch = crypto.randomUUID();
  constructor(
    readonly store: Store,
    readonly groupRouter?: GroupRouter,
  ) {
    this.store.transaction(() => {
      const scopes = new ResponsibilityScope(store);
      for (const item of [...store.list("goal"), ...store.list("routine")]) {
        const thread = store.get("thread", item.thread_id);
        if (thread.type !== "group" || thread.purpose !== "conversation" || item.scope === "group")
          continue;
        const actor = item.agent_id;
        const valid = actor !== null && thread.member_agent_ids.includes(actor);
        this.update(item, {
          ...scopes.ownership({ thread_id: thread.id, agent_id: valid ? actor : null }),
          created_by_agent_id: actor,
          ...(item.kind === "goal"
            ? {
                coordinator_agent_id: valid ? actor : null,
                work_state: valid ? item.work_state : "waiting_assignment",
              }
            : { execution_target: actor ? { type: "agent", agent_id: actor } : { type: "auto" } }),
        } as Partial<typeof item>);
      }
      for (const task of store.list("peer_task")) {
        const missing = task.goal_ids.filter((id) => task.goal_generations[id] === undefined);
        if (missing.length)
          this.update(task, {
            goal_generations: {
              ...task.goal_generations,
              ...Object.fromEntries(missing.map((id) => [id, store.get("goal", id).generation])),
            },
          });
      }
      for (const goal of store.list("goal")) {
        if (!goal.root_task_id) {
          const run = [
            ...new Set(
              [goal.current_run_id, ...goal.source_run_ids].filter(
                (id): id is string => id !== null,
              ),
            ),
          ]
            .map((id) => store.get("run", id))
            .find((run) => run.thread_id === goal.thread_id && run.task_id !== null);
          if (run?.task_id)
            this.update(goal, { root_task_id: store.get("peer_task", run.task_id).root_task_id });
        }
      }
      for (const run of this.store.list("run")) {
        if (active.has(run.status))
          this.update(run, { status: "unknown", outcome: "unknown", activity: "unknown" });
      }
      new InteractionJournal(this.store).recover();
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
            name: null,
            shared_instructions: "",
            creation_operation_id: null,
          });
        }
        case "goal": {
          const data = goalInput.parse(input);
          const actor =
            data.agent_id ??
            (this.store.get("thread", data.thread_id).member_agent_ids[0] as string);
          this.scope(data.thread_id, actor);
          return this.store.put(
            goalSchema.parse({
              ...base,
              ...data,
              kind,
              ...new ResponsibilityScope(this.store).ownership({
                thread_id: data.thread_id,
                agent_id: actor,
              }),
              coordinator_agent_id: actor,
              state: "active",
              generation: 1,
              evidence_artifact_ids: [],
            }),
          );
        }
        case "routine": {
          const data = routineInput.parse(input);
          const actor =
            data.agent_id ??
            (this.store.get("thread", data.thread_id).member_agent_ids[0] as string);
          this.scope(data.thread_id, actor);
          if (data.goal_id) this.checkGoal(data.goal_id, data.thread_id, actor);
          const shared = this.store.get("thread", data.thread_id).type === "group";
          const target =
            data.execution_target ??
            (shared ? { type: "auto" as const } : { type: "agent" as const, agent_id: actor });
          if (target.type === "agent") this.scope(data.thread_id, target.agent_id);
          else if (!shared) throw new DomainError("SCOPE_DENIED", 403);
          return this.store.put(
            routineSchema.parse({
              ...base,
              ...data,
              kind,
              ...new ResponsibilityScope(this.store).ownership({
                thread_id: data.thread_id,
                agent_id: actor,
              }),
              execution_target: target,
              state: "active",
              generation: 1,
              next_run_at: firstDue(data.schedule, data.timezone),
            }),
          );
        }
        case "artifact": {
          const data = artifactInput.parse(input);
          if (!data.agent_id) throw new DomainError("SCOPE_DENIED", 403);
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
            materialization: "ready",
            source_artifact_id: null,
            native_session_id: null,
            native_run_id: null,
            created_by_agent_id: data.agent_id,
            goal_generations: {},
          });
        }
      }
    });
  }

  createAgent(input: unknown): Entity<"agent"> {
    const data = agentInput.parse(input);
    if (data.workspace_id !== null) throw new DomainError("SCOPE_DENIED", 403);
    const connection = data.connection_id ? this.store.get("connection", data.connection_id) : null;
    if (
      connection &&
      (connection.state !== "active" ||
        connection.harness !== data.harness ||
        (data.billing_source !== null &&
          connection.authentication.billing_source !== data.billing_source))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    const base = this.base();
    const handle = data.handle ?? `agent_${base.id.replaceAll("-", "")}`;
    if (this.store.list("agent").some((item) => item.handle === handle))
      throw new DomainError("CONFLICT");
    return this.store.put({
      ...base,
      ...data,
      handle,
      avatar_config: data.avatar_config ?? defaultAgentAvatar(base.id),
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
      const connection = merged.connection_id
        ? this.store.get("connection", merged.connection_id)
        : null;
      if (
        connection &&
        (connection.state !== "active" ||
          connection.harness !== merged.harness ||
          (merged.billing_source !== null &&
            connection.authentication.billing_source !== merged.billing_source))
      )
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
    new ResponsibilityScope(this.store).require({ thread_id: threadId, agent_id: agentId }, goal);
    if (goal.state !== "active") throw new DomainError("CONFLICT");
    return goal;
  }

  private responsibility(run: Entity<"run">) {
    if (run.task_id) {
      const task = this.store.get("peer_task", run.task_id);
      if (
        task.state === "cancelled" ||
        task.goal_ids.some((id) => {
          const goal = this.store.get("goal", id);
          return goal.state !== "active" || task.goal_generations[id] !== goal.generation;
        })
      )
        throw new DomainError("STALE_DISPATCH");
    }
    if (run.goal_id) {
      const goal = this.checkGoal(run.goal_id, run.thread_id, run.agent_id);
      if (
        run.goal_assignment_revision !== null &&
        run.goal_assignment_revision !== goal.assignment_revision
      )
        throw new DomainError("STALE_DISPATCH");
      if (run.goal_generation !== null && run.goal_generation !== goal.generation)
        throw new DomainError("STALE_DISPATCH");
    }
    if (run.routine_id) {
      const routine = this.store.get("routine", run.routine_id);
      if (routine.state !== "active") throw new DomainError("CONFLICT");
      if (run.routine_generation !== null && run.routine_generation !== routine.generation)
        throw new DomainError("STALE_DISPATCH");
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
          (routine.scope !== "group" && routine.agent_id !== data.agent_id) ||
          routine.goal_id !== data.goal_id
        )
          throw new DomainError("SCOPE_DENIED", 403);
        if (routine.state !== "active") throw new DomainError("CONFLICT");
      }
      new Workspaces(this).authorizeArtifacts(data.thread_id, data.agent_id, data.artifact_ids);
      const runId = crypto.randomUUID();
      const message = this.store.put({
        ...this.base(),
        kind: "message",
        creation_operation_id: null,
        purpose: author === "routine" ? "continuation" : "conversation",
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
      computer_activity: null,
      retry_allowed: false,
      retry_of_run_id: null,
      retried_by_run_id: null,
      task_id: options.task_id ?? null,
      thread_revision: thread.type === "group" ? thread.revision : null,
      goal_id: options.goal_id ?? null,
      routine_id: options.routine_id ?? null,
      goal_assignment_revision: options.goal_id
        ? this.store.get("goal", options.goal_id).assignment_revision
        : null,
      goal_generation: options.goal_id ? this.store.get("goal", options.goal_id).generation : null,
      routine_generation: options.routine_id
        ? this.store.get("routine", options.routine_id).generation
        : null,
      publication:
        options.routine_id || message.purpose === "continuation" ? "deferred" : "immediate",
      pending_answer: null,
      response_mode: "answer",
      tool_errors: [],
      status: "queued",
      cancellation: "none",
      outcome: "none",
      grant_revision: agent.grant_revision,
      dispatch_token: null,
      authority_epoch: null,
      binding_id: null,
      native_run_id: null,
      native_interactions: [],
      agent_snapshot: null,
      delivery: "pending",
      activity: "idle",
      active_tools: [],
      diagnostic: null,
      native_dispatch_id: null,
      workspace_id: null,
      workspace_revision: null,
      native_tools: [],
      product_tools: [],
      attachment_observations: [],
      sources: [],
      visual_inputs: [],
    });
  }

  bind(
    threadId: string,
    agentId: string,
    nativeSessionId: string,
    workspace: Entity<"workspace"> = new Workspaces(this).ensure(threadId, agentId),
    replaceUnused?: Pick<Entity<"binding">, "id" | "revision">,
  ) {
    return this.store.transaction(() => {
      this.scope(threadId, agentId);
      const agent = this.executionAgent(threadId, agentId);
      if (!agent.connection_id) throw new DomainError("SCOPE_DENIED", 403);
      const existing = this.store
        .list("binding")
        .find((item) => item.active && item.thread_id === threadId && item.agent_id === agentId);
      if (existing) {
        if (
          existing.connection_id === agent.connection_id &&
          existing.harness === agent.harness &&
          existing.agent_revision === agent.revision &&
          existing.workspace_id === (workspace?.id ?? null) &&
          existing.workspace_revision === (workspace?.revision ?? null)
        ) {
          if (existing.native_session_id === nativeSessionId) return existing;
          if (
            existing.harness !== "codex" ||
            replaceUnused?.id !== existing.id ||
            replaceUnused.revision !== existing.revision ||
            this.store.list("run").some((run) => run.binding_id === existing.id)
          )
            throw new DomainError("CONFLICT");
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
      // Every current group adapter can mutate files. The durable run is the exclusive lease;
      // unknown work keeps it until native reconciliation, including after an application restart.
      if (
        thread.type === "group" &&
        thread.purpose === "conversation" &&
        this.store
          .list("run")
          .some(
            (run) =>
              run.thread_id === threadId && (active.has(run.status) || run.status === "unknown"),
          )
      )
        return null;
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
        timings: { ...next.timings, dispatched_at: new Date().toISOString() },
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
          timings: {
            ...run.timings,
            accepted_at: run.timings?.accepted_at ?? new Date().toISOString(),
          },
          native_run_id: nativeRunId ?? run.native_run_id,
          diagnostic: run.diagnostic?.outcome === "not_dispatched" ? null : run.diagnostic,
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

  /** The application's single scheduler admits an occurrence and advances its cursor atomically. */
  fireRoutine(routineId: string, now: Date) {
    return this.store.transaction(() => {
      const routine = this.store.get("routine", routineId);
      if (routine.scope === "group") return new GroupSchedules(this).fire(routine, now);
      if (
        routine.state !== "active" ||
        !routine.next_run_at ||
        Date.parse(routine.next_run_at) > now.getTime()
      )
        return null;
      if (!routine.agent_id) throw new DomainError("SCOPE_DENIED", 403);
      this.scope(routine.thread_id, routine.agent_id);
      if (routine.goal_id) {
        const goal = this.checkGoal(routine.goal_id, routine.thread_id, routine.agent_id);
        if (goal.work_state !== "ready") return null;
        if (goal.current_run_id) {
          const current = this.store.get("run", goal.current_run_id);
          if (!final.has(current.status)) return null;
          if (
            current.task_id &&
            !["completed", "failed", "cancelled"].includes(
              this.store.get("peer_task", current.task_id).state,
            )
          )
            return null;
        }
        if (this.store.list("run").some((r) => r.goal_id === goal.id && !final.has(r.status)))
          return null;
      }
      if (this.store.list("run").some((r) => r.routine_id === routineId && !final.has(r.status)))
        return null;
      const { scheduled_for, next } = dueWindow(
        routine.schedule,
        routine.timezone,
        routine.next_run_at,
        now,
      );
      return this.store.command(
        `routine:${routine.id}:${routine.generation}:${scheduled_for}`,
        { scheduled_for },
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
            scheduled_for,
            run_id: receipt.run.id,
            route_id: null,
            selected_agent_id: routine.agent_id,
            state: "queued",
          });
          this.update(routine, { next_run_at: next });
          if (routine.goal_id) {
            const goal = this.store.get("goal", routine.goal_id);
            this.update(goal, {
              current_run_id: receipt.run.id,
              source_run_ids: [...new Set([...goal.source_run_ids, receipt.run.id])].slice(-200),
            });
          }
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
      this.publishDeferred(run, outcome);
      const answer = this.store.answer(runId);
      if (answer && answer.state !== (outcome === "succeeded" ? "complete" : "partial"))
        this.update(answer, { state: outcome === "succeeded" ? "complete" : "partial" });
      return this.update(run, {
        status: outcome,
        outcome,
        retry_allowed: canRetryResponse(this.store, { ...run, status: outcome, outcome }),
        timings: { ...run.timings, settled_at: new Date().toISOString() },
        cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
        activity: outcome === "unknown" ? "unknown" : "idle",
        active_tools: [],
      });
    });
  }
  /** Persist redacted native output in the owning thread before publishing its terminal run. */
  appendAnswer(runId: string, text: string, state: "complete" | "partial" = "complete") {
    return this.store.transaction(() => {
      let run = this.store.get("run", runId);
      if (!active.has(run.status) || !run.native_run_id || run.authority_epoch !== this.epoch)
        throw new DomainError("STALE_DISPATCH");
      if (run.cancellation !== "none") throw new DomainError("STALE_DISPATCH");
      this.authorizeDispatch(run.id, run.dispatch_token as string);
      if (text && !run.timings?.first_output_at)
        run = this.update(run, {
          timings: { ...run.timings, first_output_at: new Date().toISOString() },
        });
      if (
        this.store
          .list("goal")
          .some((g) => g.current_run_id === run.id && g.deferred_by_run_id === run.id)
      )
        return run;
      if (run.publication !== "immediate" || run.response_mode === "finalize") {
        return this.update(run, { pending_answer: text });
      }
      return this.writeAnswer(run, text, state);
    });
  }

  private publishDeferred(run: Entity<"run">, outcome: string, text = run.pending_answer) {
    if (!text && run.goal_id) {
      const goal = this.store.get("goal", run.goal_id);
      if (goal.report_run_id === run.id && goal.work_state !== "ready") text = goal.progress;
    }
    if (
      run.publication !== "deferred" ||
      outcome !== "succeeded" ||
      !text ||
      run.response_mode === "finalize" ||
      run.cancellation !== "none"
    )
      return;
    try {
      this.scope(run.thread_id, run.agent_id);
      this.responsibility(run);
    } catch {
      return;
    }
    this.writeAnswer(run, text, "complete");
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
      creation_operation_id: null,
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
      | "activity"
      | "active_tools"
      | "native_dispatch_id"
      | "diagnostic"
      | "native_tools"
      | "product_tools"
      | "tool_errors"
      | "sources"
      | "computer_activity"
      | "visual_inputs"
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

  preparationConfiguration(run: Entity<"run">) {
    const agent = this.store.get("agent", run.agent_id);
    const connection = agent.connection_id
      ? this.store.get("connection", agent.connection_id)
      : null;
    return `${agent.revision}:${connection?.revision ?? 0}:${this.store.get("thread", run.thread_id).revision}`;
  }

  preparing(runId: string, runtimeRevision?: string) {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (run.status !== "queued" || run.delivery !== "pending") throw new DomainError("CONFLICT");
      return this.update(run, {
        timings: {
          ...run.timings,
          preparing_at: run.timings?.preparing_at ?? new Date().toISOString(),
        },
        preparation: {
          state: "preparing",
          attempts: (run.preparation?.attempts ?? 0) + 1,
          next_attempt_at: null,
          configuration_revision: this.preparationConfiguration(run),
          runtime_revision: runtimeRevision,
        },
      });
    });
  }

  prepared(runId: string) {
    const run = this.store.get("run", runId);
    if (run.status !== "queued" || !run.preparation) return run;
    return this.update(run, {
      timings: { ...run.timings, ready_at: new Date().toISOString() },
      preparation: { ...run.preparation, state: "ready", next_attempt_at: null },
    });
  }

  preparationFailed(
    runId: string,
    failure: NonNullable<Entity<"run">["diagnostic"]>,
    runtimeRevision?: string,
  ) {
    const run = this.store.get("run", runId);
    if (run.status !== "queued" || !run.preparation) return run;
    const retry = failure.category === "temporary" && run.preparation.attempts < 3;
    return this.update(run, {
      diagnostic: failure,
      preparation: {
        ...run.preparation,
        runtime_revision: runtimeRevision ?? run.preparation.runtime_revision,
        state: retry ? "retrying" : "blocked",
        next_attempt_at: retry
          ? new Date(Date.now() + 1000 * 2 ** (run.preparation.attempts - 1)).toISOString()
          : null,
      },
    });
  }

  retryPreparation(runId: string, expectedRevision: number) {
    return this.store.transaction(() => {
      const run = this.store.get("run", runId);
      if (
        run.revision !== expectedRevision ||
        run.status !== "queued" ||
        run.preparation?.state !== "blocked"
      )
        throw new DomainError("CONFLICT");
      return this.update(run, { preparation: undefined, diagnostic: null });
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
        if (run.publication !== "immediate")
          this.publishDeferred(run, outcome, text ?? run.pending_answer);
        else if (
          text !== undefined &&
          run.cancellation === "none" &&
          (text || this.store.answer(run.id))
        ) {
          try {
            this.scope(run.thread_id, run.agent_id);
            this.responsibility(run);
            this.writeAnswer(run, text, outcome === "succeeded" ? "complete" : "partial");
          } catch {
            /* Retain the receipt without publishing into revoked responsibility scope. */
          }
        }
        return this.update(run, {
          status: outcome,
          outcome,
          cancellation: outcome === "cancelled" ? "confirmed" : run.cancellation,
          activity: "idle",
          native_run_id: nativeRunId ?? run.native_run_id,
          retry_allowed: canRetryResponse(this.store, { ...run, status: outcome, outcome }),
        });
      },
    );
  }

  controlGoal(goalId: string, state: "paused" | "stopped" | "active" | "completed") {
    return this.store.transaction(() => {
      const goal = this.store.get("goal", goalId);
      if (goal.state === "completed") throw new DomainError("CONFLICT");
      if (goal.state === state) return goal;
      if (state === "completed") {
        if (
          goal.state !== "active" ||
          goal.work_state !== "completion_pending" ||
          !goal.current_run_id ||
          goal.report_run_id !== goal.current_run_id ||
          !goal.evidence_artifact_ids.length
        )
          throw new DomainError("CONFLICT");
        const run = this.store.get("run", goal.current_run_id);
        if (run.status !== "succeeded" || run.cancellation !== "none")
          throw new DomainError("CONFLICT");
      }
      const result = this.update(goal, {
        state,
        generation: goal.generation + 1,
        continuation_at: state === "active" ? new Date().toISOString() : null,
        work_state: state === "active" || state === "completed" ? "ready" : goal.work_state,
        current_run_id:
          state === "active" &&
          goal.current_run_id &&
          final.has(this.store.get("run", goal.current_run_id).status)
            ? null
            : goal.current_run_id,
      });
      if (state !== "active") {
        if (goal.assignment_route_id) {
          const route = this.store.get("group_route", goal.assignment_route_id);
          if (route.router_run_id) this.cancel(route.router_run_id);
        }
        for (const task of this.store.list("peer_task")) {
          if (
            !task.goal_ids.includes(goalId) ||
            ["completed", "failed", "cancelled"].includes(task.state)
          )
            continue;
          this.cancel(task.current_run_id);
          this.update(task, { state: "cancelled" });
          for (const request of this.store.list("human_request"))
            if (request.task_id === task.id && request.state === "pending")
              this.update(request, { state: "cancelled" });
        }
        for (const routine of this.store.list("routine")) {
          if (routine.goal_id === goalId && routine.state !== "stopped")
            this.update(routine, {
              state: state === "completed" ? "stopped" : state,
              paused_by_goal: state === "paused" && routine.state === "active",
              generation: routine.generation + 1,
            });
        }
        for (const run of this.store.list("run"))
          if ((run.goal_id === goalId || run.id === goal.current_run_id) && !final.has(run.status))
            this.cancel(run.id);
      }
      if (state === "active")
        for (const routine of this.store.list("routine"))
          if (routine.goal_id === goalId && routine.paused_by_goal && routine.state === "paused")
            this.update(routine, {
              state: "active",
              paused_by_goal: false,
              generation: routine.generation + 1,
            });
      return result;
    });
  }
}
