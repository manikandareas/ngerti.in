import { z } from "zod";
import {
  agent,
  artifact,
  binding,
  control,
  DomainError,
  id,
  message,
  run,
  thread,
  workspace,
} from "./contracts";
import { Connections } from "./harness/connections";
import type { Lifecycle } from "./lifecycle";

export const historyQuery = z.object({
  before: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const conversationSnapshot = z.strictObject({
  cursor: z.int().nonnegative(),
  thread,
  agents: z.array(agent),
  bindings: z.array(binding),
  runs: z.array(run),
  controls: z.array(control),
  messages: z.array(message),
  workspaces: z.array(workspace),
  artifacts: z.array(artifact),
  has_more: z.boolean(),
  next_before: id.nullable(),
});

/** Product reads never open a native session or admit a model request. */
export class Conversations {
  constructor(readonly lifecycle: Lifecycle) {}

  setup() {
    const { store } = this.lifecycle;
    return store.command("development:tobi:v1", { operation: "setup_tobi", version: 1 }, () => {
      const connection = new Connections(this.lifecycle).create({
        harness: "codex",
        authentication: { method: "native_login", billing_source: "subscription" },
      });
      const created = this.lifecycle.createAgent({
        name: "Tobi",
        handle: "tobi",
        soul: "A thoughtful generalist who helps the user turn conversations into useful work.",
        instructions:
          "Help the user configure agents through Ngertiin product tools when requested. Report actual results and respect each conversation's private context.",
        harness: "codex",
        connection_id: connection.id,
      });
      const tobi = store.put(
        {
          ...created,
          revision: created.revision + 1,
          system_role: "tobi",
          configuration_access: "owner",
        },
        created.revision,
      );
      const dm = this.lifecycle.create("thread", { type: "dm", member_agent_ids: [tobi.id] });
      const now = new Date().toISOString();
      const welcome = store.put({
        id: crypto.randomUUID(),
        owner_id: store.ownerId,
        revision: 1,
        created_at: now,
        updated_at: now,
        kind: "message",
        thread_id: dm.id,
        author: "agent",
        author_agent_id: tobi.id,
        routine_id: null,
        run_id: null,
        state: "complete",
        artifact_ids: [],
        text: "Hi, I'm Tobi. Tell me what you'd like to work on. I can help you create and configure agents through our conversation.",
      });
      return { agent_id: tobi.id, thread_id: dm.id, welcome_message_id: welcome.id };
    });
  }

  history(threadId: string, input: unknown = {}) {
    const { before, limit } = historyQuery.parse(input);
    const { store } = this.lifecycle;
    store.get("thread", threadId);
    const all = store.list("message").filter((item) => item.thread_id === threadId);
    const end = before === undefined ? all.length : all.findIndex((item) => item.id === before);
    if (end < 0) throw new DomainError("SCOPE_DENIED", 403);
    const start = Math.max(0, end - limit);
    const messages = all.slice(start, end).filter((item) => item.state !== "deleted");
    return {
      messages,
      has_more: start > 0,
      next_before: start > 0 ? (all[start]?.id ?? null) : null,
    };
  }

  snapshot(threadId: string) {
    const { store } = this.lifecycle;
    return store.transaction(() => {
      const thread = store.get("thread", threadId);
      return conversationSnapshot.parse({
        cursor: store.cursor,
        thread,
        agents: thread.member_agent_ids.map((id) => store.get("agent", id)),
        bindings: store.list("binding").filter((item) => item.thread_id === threadId),
        runs: store.list("run").filter((item) => item.thread_id === threadId),
        controls: store.list("control").filter((item) => item.thread_id === threadId),
        workspaces: store.list("workspace").filter((item) => item.thread_id === threadId),
        artifacts: store.list("artifact").filter((item) => item.thread_id === threadId),
        ...this.history(threadId),
      });
    });
  }
}
