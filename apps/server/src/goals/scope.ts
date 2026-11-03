import { DomainError, type Entity } from "../contracts";
import type { Store } from "../store";

export type GoalScope = { thread_id: string; agent_id: string | null };
export type Responsibility = Entity<"goal"> | Entity<"routine">;

/** Resource ownership follows the conversation; execution remains explicitly assigned. */
export class ResponsibilityScope {
  constructor(readonly store: Store) {}
  conversation(context: GoalScope) {
    const thread = this.store.get("thread", context.thread_id);
    if (thread.purpose !== "conversation") throw new DomainError("SCOPE_DENIED", 403);
    if (context.agent_id !== null) {
      this.store.get("agent", context.agent_id);
      if (!thread.member_agent_ids.includes(context.agent_id))
        throw new DomainError("SCOPE_DENIED", 403);
    } else if (thread.type !== "group") throw new DomainError("SCOPE_DENIED", 403);
    return thread;
  }
  require<T extends Responsibility>(context: GoalScope, entity: T): T {
    const thread = this.conversation(context);
    if (
      entity.thread_id !== thread.id ||
      (thread.type !== "group" && entity.agent_id !== context.agent_id)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return entity;
  }
  ownership(context: GoalScope) {
    const thread = this.conversation(context);
    return {
      scope: thread.type === "group" ? ("group" as const) : ("agent" as const),
      agent_id: thread.type === "group" ? null : context.agent_id,
      created_by_agent_id: context.agent_id,
    };
  }
  coordinator(goal: Entity<"goal">) {
    return goal.scope === "group" ? goal.coordinator_agent_id : goal.agent_id;
  }
  reporting(run: Entity<"run">, goal: Entity<"goal">) {
    this.require(run, goal);
    if (goal.scope !== "group") return;
    const task = run.task_id ? this.store.get("peer_task", run.task_id) : null;
    const ownsTask = goal.root_task_id !== null && task?.id === goal.root_task_id;
    const ownsRun = goal.current_run_id === run.id && run.goal_id === goal.id;
    if (
      !ownsRun &&
      !(
        this.coordinator(goal) === run.agent_id &&
        (ownsTask || goal.source_run_ids.includes(run.id))
      )
    )
      throw new DomainError("SCOPE_DENIED", 403);
  }
  evidence(goal: Entity<"goal">, producer: Entity<"run">) {
    if (producer.thread_id !== goal.thread_id) return false;
    if (goal.source_run_ids.includes(producer.id)) return true;
    if (goal.scope !== "group" || !goal.root_task_id || !producer.task_id) return false;
    const task = this.store.get("peer_task", producer.task_id);
    return (
      task.root_task_id === goal.root_task_id &&
      task.goal_ids.includes(goal.id) &&
      task.goal_generations[goal.id] === goal.generation
    );
  }
}
