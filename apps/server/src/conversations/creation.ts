import { z } from "zod";
import { randomAgentName } from "../agents/names";
import { DomainError, id } from "../contracts";
import { billingSource, harness } from "../contracts/base";
import { Groups } from "../groups/service";
import type { Lifecycle } from "../lifecycle";

const opener = z
  .string()
  .min(1)
  .max(100_000)
  .default(
    "Help me get started with what you can do. Ask one useful question if you need context.",
  );
export const createAgentConversation = z.strictObject({
  connection_id: id.nullable(),
  harness: harness.optional(),
  model_id: z.string().min(1).max(200).nullable(),
  reasoning: z.string().max(100).nullable().default(null),
  billing_source: billingSource,
  opener,
});
export const createGroupConversation = z.strictObject({
  name: z.string().trim().min(1).max(200),
  member_agent_ids: z.array(id).min(1).max(100),
  opener,
});
export const groupConfiguration = z.strictObject({
  expected_revision: z.int().positive(),
  changes: z
    .strictObject({
      name: z.string().trim().min(1).max(200).optional(),
      shared_instructions: z.string().max(100_000).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, "Empty update."),
});

/** Creation and its single opening admission share one durable command transaction. */
export class Creation {
  constructor(
    readonly lifecycle: Lifecycle,
    readonly generateName?: () => string,
  ) {}

  async agent(operationId: string, input: unknown) {
    const data = createAgentConversation.parse(input);
    const { store } = this.lifecycle;
    return await store.command(
      operationId,
      { operation: "create_agent_conversation", data },
      async () => {
        const connection = data.connection_id
          ? await store.get("connection", data.connection_id)
          : null;
        if (!connection && !data.harness) throw new DomainError("INVALID_REQUEST", 422);
        if (connection && connection.authentication.billing_source !== data.billing_source)
          throw new DomainError("SCOPE_DENIED", 403);
        const names = new Set(
          (await store.list("agent")).map((a) => a.name.toLocaleLowerCase("en")),
        );
        const base = this.generateName?.() ?? randomAgentName(names);
        let name = base;
        for (let suffix = 2; names.has(name.toLocaleLowerCase("en")); suffix++)
          name = `${base} ${suffix}`;
        const agent = await this.lifecycle.createAgent({
          name,
          avatar: "🤖",
          harness: connection?.harness ?? data.harness,
          connection_id: connection?.id ?? null,
          billing_source: data.billing_source,
          model_id: data.model_id,
          reasoning: data.reasoning,
        });
        const thread = await this.lifecycle.create("thread", {
          type: "dm",
          member_agent_ids: [agent.id],
        });
        const saved = await store.put(
          { ...thread, creation_operation_id: operationId, revision: thread.revision + 1 },
          thread.revision,
        );
        const admission = await this.lifecycle.admit({
          thread_id: thread.id,
          agent_id: agent.id,
          text: data.opener,
        });
        const message = await store.put(
          {
            ...admission.message,
            creation_operation_id: operationId,
            revision: admission.message.revision + 1,
          },
          admission.message.revision,
        );
        return { agent, thread: saved, message, run: admission.run };
      },
    );
  }

  async group(operationId: string, input: unknown) {
    const data = createGroupConversation.parse(input);
    const { store } = this.lifecycle;
    return await store.command(
      operationId,
      { operation: "create_group_conversation", data },
      async () => {
        const thread = await this.lifecycle.create("thread", {
          type: "group",
          member_agent_ids: data.member_agent_ids,
        });
        const saved = await store.put(
          {
            ...thread,
            name: data.name,
            creation_operation_id: operationId,
            revision: thread.revision + 1,
          },
          thread.revision,
        );
        const route = await new Groups(this.lifecycle).send(thread.id, { text: data.opener });
        const original = await store.get("message", route.message_id);
        const message = await store.put(
          { ...original, creation_operation_id: operationId, revision: original.revision + 1 },
          original.revision,
        );
        const annotatedRoute = route.routing
          ? await store.put(
              {
                ...route,
                revision: route.revision + 1,
                routing: { ...route.routing, request_revision: message.revision },
              },
              route.revision,
            )
          : route;
        return { thread: saved, message, route: annotatedRoute };
      },
    );
  }

  async configureGroup(threadId: string, input: unknown) {
    const data = groupConfiguration.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const thread = await this.lifecycle.store.get("thread", threadId);
      if (thread.type !== "group" || thread.purpose !== "conversation")
        throw new DomainError("SCOPE_DENIED", 403);
      if (thread.revision !== data.expected_revision) throw new DomainError("CONFLICT");
      const store = this.lifecycle.store;
      const saved = await store.put(
        {
          ...thread,
          ...data.changes,
          revision: thread.revision + 1,
          updated_at: new Date().toISOString(),
        },
        thread.revision,
      );
      for (const run of await store.list("run")) {
        if (
          run.thread_id === threadId &&
          run.thread_revision === thread.revision &&
          ["queued", "dispatching", "running", "cancel_requested"].includes(run.status)
        )
          await store.put(
            { ...run, thread_revision: saved.revision, revision: run.revision + 1 },
            run.revision,
          );
      }
      return saved;
    });
  }
}

/** Reads are derived from durable projections, never from assistant prose. */
export async function openingState(lifecycle: Lifecycle, threadId: string) {
  const { store } = lifecycle;
  const thread = await store.get("thread", threadId);
  const message = (await store.list("message", { thread_id: threadId })).find(
    (m) => m.thread_id === threadId && m.creation_operation_id !== null,
  );
  const route = message
    ? ((await store.list("group_route")).find((r) => r.message_id === message.id) ?? null)
    : null;
  const task = route?.task_id ? await store.get("peer_task", route.task_id) : null;
  const runs = message
    ? (await store.list("run")).filter((r) => r.input_message_id === message.id)
    : [];
  const current = task
    ? await store.get("run", task.current_run_id)
    : route?.router_run_id
      ? await store.get("run", route.router_run_id)
      : (runs.at(-1) ?? null);
  const connectionId = current ? (await store.get("agent", current.agent_id)).connection_id : null;
  const connection = connectionId ? await store.get("connection", connectionId) : null;
  return {
    thread,
    message: message ?? null,
    route,
    task,
    run: current,
    connection: connection
      ? {
          id: connection.id,
          state: connection.state,
          login: connection.login,
          capabilities: connection.capabilities,
          billing_source: connection.authentication.billing_source,
          effective_billing_source: connection.effective_billing_source,
        }
      : null,
    recovery:
      current?.status === "unknown" || route?.state === "unknown"
        ? "reconcile"
        : current && ["failed", "cancelled"].includes(current.status)
          ? "retry"
          : current?.status === "queued"
            ? "configure_or_wait"
            : "none",
  };
}

export async function retryOpening(lifecycle: Lifecycle, threadId: string, expectedRunId: string) {
  return await lifecycle.store.transaction(async () => {
    const state = await openingState(lifecycle, threadId);
    if (!state.run || state.run.id !== expectedRunId || state.recovery !== "retry")
      throw new DomainError("CONFLICT");
    const run = state.run;
    if (
      (await lifecycle.store.list("app_effect", { run_id: run.id })).some(
        (effect) => effect.run_id === run.id && ["unknown", "dispatched"].includes(effect.state),
      )
    )
      throw new DomainError("CONFLICT");
    if (
      (await lifecycle.store.list("browser_action", { run_id: run.id })).some(
        (effect) => effect.run_id === run.id && ["unknown", "dispatched"].includes(effect.state),
      )
    )
      throw new DomainError("CONFLICT");
    const message = await lifecycle.store.get("message", run.input_message_id);
    const next = await lifecycle.enqueue(message, run.agent_id, {
      task_id: run.task_id ?? undefined,
    });
    if (state.task)
      await lifecycle.store.put(
        {
          ...state.task,
          current_run_id: next.id,
          state: "working",
          revision: state.task.revision + 1,
        },
        state.task.revision,
      );
    else if (state.route)
      await lifecycle.store.put(
        {
          ...state.route,
          router_run_id: next.id,
          state: "pending",
          error_code: null,
          thread_revision: state.thread.revision,
          revision: state.route.revision + 1,
        },
        state.route.revision,
      );
    return next;
  });
}
