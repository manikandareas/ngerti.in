import { defaultAgentAvatar } from "@ngertiin/avatar/config";
import { z } from "zod";
import { randomAgentName } from "./agents/names";
import {
  agent,
  artifact,
  binding,
  control,
  DomainError,
  goal,
  humanRequest,
  id,
  message,
  occurrence,
  peerTask,
  routine,
  run,
  schemas,
  thread,
  workspace,
} from "./contracts";
import { conversationPart } from "./conversations/parts";
import { conversationMessage } from "./conversations/projection";
import { groupRouteView } from "./groups/contracts";
import { routeView } from "./groups/projection";
import { Connections } from "./harness/connections";
import type { Lifecycle } from "./lifecycle";
import { asyncFilter, asyncMap } from "./persistence/async-collections";

export const historyQuery = z.object({
  before: id.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const timelineQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const conversationTimeline = z.strictObject({
  parts: z.array(conversationPart),
  messages: z.array(message),
  has_more: z.boolean(),
  next_before: z.int().positive().nullable(),
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
  attachment_documents: z.array(schemas.attachment_document).default([]),
  routes: z.array(groupRouteView),
  tasks: z.array(peerTask),
  human_requests: z.array(humanRequest),
  goals: z.array(goal),
  routines: z.array(routine),
  occurrences: z.array(occurrence),
  has_more: z.boolean(),
  next_before: id.nullable(),
  timeline: conversationTimeline,
});

/** Product reads never open a native session or admit a model request. */
export class Conversations {
  constructor(readonly lifecycle: Lifecycle) {}

  async setup() {
    const { store } = this.lifecycle;
    return await store.command(
      "development:tobi:v1",
      { operation: "setup_tobi", version: 1 },
      async () => {
        const name = randomAgentName((await store.list("agent")).map((agent) => agent.name));
        const connection = await new Connections(this.lifecycle).create({
          harness: "codex",
          authentication: { method: "native_login", billing_source: "subscription" },
        });
        const created = await this.lifecycle.createAgent({
          name,
          handle: "default",
          avatar_config: defaultAgentAvatar("tobi-circle", true),
          soul: "A thoughtful generalist who helps the user turn conversations into useful work.",
          instructions:
            "Help the user configure agents through Ngertiin product tools when requested. Report actual results and respect each conversation's private context.",
          harness: "codex",
          connection_id: connection.id,
        });
        const tobi = await store.put(
          {
            ...created,
            revision: created.revision + 1,
            system_role: "tobi",
            configuration_access: "owner",
          },
          created.revision,
        );
        const dm = await this.lifecycle.create("thread", {
          type: "dm",
          member_agent_ids: [tobi.id],
        });
        const now = new Date().toISOString();
        const welcome = await store.put({
          id: crypto.randomUUID(),
          owner_id: store.ownerId,
          revision: 1,
          created_at: now,
          updated_at: now,
          kind: "message",
          creation_operation_id: null,
          purpose: "conversation",
          source_run_id: null,
          thread_id: dm.id,
          author: "agent",
          author_agent_id: tobi.id,
          routine_id: null,
          run_id: null,
          state: "complete",
          artifact_ids: [],
          text: `Hi, I'm ${name}. Tell me what you'd like to work on. I can help you create and configure agents through our conversation.`,
        });
        return { agent_id: tobi.id, thread_id: dm.id, welcome_message_id: welcome.id };
      },
    );
  }

  async history(threadId: string, input: unknown = {}) {
    const { before, limit } = historyQuery.parse(input);
    const { store } = this.lifecycle;
    await store.get("thread", threadId);
    const all = (await store.list("message", { thread_id: threadId })).filter(
      (item) => item.thread_id === threadId && item.purpose !== "continuation",
    );
    const end = before === undefined ? all.length : all.findIndex((item) => item.id === before);
    if (end < 0) throw new DomainError("SCOPE_DENIED", 403);
    const start = Math.max(0, end - limit);
    const messages = await asyncMap(
      all.slice(start, end).filter((item) => item.state !== "deleted"),
      async (item) => await conversationMessage(store, item),
    );
    return {
      messages,
      has_more: start > 0,
      next_before: start > 0 ? (all[start]?.id ?? null) : null,
    };
  }

  async snapshot(threadId: string) {
    const { store } = this.lifecycle;
    return await store.read(async () => {
      const thread = await store.get("thread", threadId);
      return conversationSnapshot.parse({
        cursor: await store.cursor,
        thread,
        agents: await asyncMap(thread.member_agent_ids, async (id) => await store.get("agent", id)),
        bindings: (await store.list("binding", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        runs: (await store.list("run", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        controls: (await store.list("control", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        workspaces: (await store.list("workspace", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        artifacts: (await store.list("artifact", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        attachment_documents: (
          await store.list("attachment_document", { thread_id: threadId })
        ).filter((item) => item.thread_id === threadId),
        routes: await asyncMap(
          (await store.list("group_route", { thread_id: threadId })).filter(
            (item) => item.thread_id === threadId,
          ),
          async (item) => await routeView(store, item),
        ),
        tasks: (await store.list("peer_task", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        human_requests: (await store.list("human_request", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        goals: (await store.list("goal", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        routines: (await store.list("routine", { thread_id: threadId })).filter(
          (item) => item.thread_id === threadId,
        ),
        occurrences: await asyncFilter(
          await store.list("occurrence"),
          async (item) => (await store.get("routine", item.routine_id)).thread_id === threadId,
        ),
        ...(await this.history(threadId)),
        timeline: await this.timeline(threadId),
      });
    });
  }
  async timeline(threadId: string, input: unknown = {}) {
    const { before, limit } = timelineQuery.parse(input);
    const { store } = this.lifecycle;
    await store.get("thread", threadId);
    return await store.read(async () => {
      const page = await store.journal.page(threadId, before, limit);
      const ids = new Set(
        page.parts.flatMap((part) =>
          part.kind === "message" && part.message_id ? [part.message_id] : [],
        ),
      );
      return {
        ...page,
        messages: await asyncMap(
          [...ids],
          async (id) => await conversationMessage(store, await store.get("message", id)),
        ),
      };
    });
  }
}
