import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { type LearningContext, learningContext } from "./contracts";

/** A shared record belongs to one persistent agent; group records belong to one conversation. */
export class LearningScope {
  constructor(readonly lifecycle: Lifecycle) {}
  async context(input: LearningContext) {
    const context = learningContext.parse(input);
    await this.lifecycle.store.assertInvocation(context.agent_id);
    const agent = await this.lifecycle.store.get("agent", context.agent_id);
    const thread = await this.lifecycle.store.get("thread", context.thread_id);
    if (!thread.member_agent_ids.includes(agent.id)) throw new DomainError("SCOPE_DENIED", 403);
    return { agent, thread };
  }
  async validate(context: LearningContext, visibility: "dm_private" | "group" | "shared") {
    const { thread } = await this.context(context);
    if (
      (visibility === "dm_private" && thread.type !== "dm") ||
      (visibility === "group" && thread.type !== "group")
    )
      throw new DomainError("SCOPE_DENIED", 403);
  }
  async visible(
    context: LearningContext,
    item: { agent_id: string; thread_id: string; visibility: string },
  ) {
    await this.context(context);
    return item.visibility === "shared"
      ? item.agent_id === context.agent_id
      : item.thread_id === context.thread_id &&
          (item.visibility === "group" || item.agent_id === context.agent_id);
  }
  async require(
    context: LearningContext,
    item: { agent_id: string; thread_id: string; visibility: string },
  ) {
    if (!(await this.visible(context, item))) throw new DomainError("SCOPE_DENIED", 403);
  }
  base() {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      owner_id: this.lifecycle.store.ownerId,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
  }
  async update<T extends Entity>(item: T, changes: Partial<T>): Promise<T> {
    return await this.lifecycle.store.put(
      { ...item, ...changes, revision: item.revision + 1, updated_at: new Date().toISOString() },
      item.revision,
    );
  }
}
