import {
  admissionInput,
  DomainError,
  type Entity,
  queueDelete,
  queueEdit,
  steerInput,
} from "./contracts";
import type { Lifecycle } from "./lifecycle";
import { hasUnresolvedResponseEffects } from "./runs/retry-policy";

export class RunControls {
  constructor(readonly lifecycle: Lifecycle) {}
  private async update<T extends Entity>(value: T, fields: Partial<T>): Promise<T> {
    return await this.lifecycle.store.put(
      { ...value, ...fields, revision: value.revision + 1, updated_at: new Date().toISOString() },
      value.revision,
    );
  }
  private async queued(messageId: string, expectedRevision: number) {
    const message = await this.lifecycle.store.get("message", messageId);
    if (
      message.revision !== expectedRevision ||
      message.author !== "user" ||
      message.state === "deleted"
    )
      throw new DomainError("CONFLICT");
    const run = message.run_id
      ? await this.lifecycle.store.get("run", message.run_id)
      : (await this.lifecycle.store.list("run")).findLast(
          (run) => run.input_message_id === message.id,
        );
    if (run?.status !== "queued" || run.delivery !== "pending") throw new DomainError("CONFLICT");
    if (
      (await this.lifecycle.store.list("run")).some(
        (other) =>
          other.input_message_id === message.id && other.id !== run.id && other.status !== "queued",
      )
    )
      throw new DomainError("CONFLICT");
    return { message, run };
  }
  async edit(messageId: string, input: unknown) {
    const data = queueEdit.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const { message } = await this.queued(messageId, data.expected_revision);
      return await this.update(message, { text: data.text });
    });
  }
  async remove(messageId: string, input: unknown) {
    const data = queueDelete.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const { message, run } = await this.queued(messageId, data.expected_revision);
      await this.lifecycle.cancel(run.id);
      // A durable tombstone lets reconnecting clients remove their projection without losing its identity.
      return await this.update(message, { state: "deleted" });
    });
  }
  async send(input: unknown) {
    return { ...(await this.lifecycle.admit(admissionInput.parse(input))), control: null };
  }
  async retry(runId: string, expectedRevision: number) {
    return await this.lifecycle.store.transaction(async () => {
      const store = this.lifecycle.store;
      const run = await store.get("run", runId);
      if (
        run.revision !== expectedRevision ||
        run.status !== "failed" ||
        run.cancellation !== "none" ||
        run.retried_by_run_id ||
        run.diagnostic?.outcome === "unknown"
      )
        throw new DomainError("CONFLICT");
      if (await hasUnresolvedResponseEffects(store, run))
        throw new DomainError("RECONCILIATION_REQUIRED");
      const input = await store.get("message", run.input_message_id);
      if (input.state === "deleted") throw new DomainError("CONFLICT");
      const next = await this.lifecycle.enqueue(input, run.agent_id, {
        task_id: run.task_id ?? undefined,
        goal_id: run.goal_id,
        routine_id: run.routine_id,
      });
      await this.update(run, { retried_by_run_id: next.id, retry_allowed: false });
      const linked = await this.update(next, { retry_of_run_id: run.id, sources: run.sources });
      if (run.task_id) {
        const task = await store.get("peer_task", run.task_id);
        if (task.current_run_id !== run.id) throw new DomainError("CONFLICT");
        await this.update(task, { current_run_id: next.id, state: "working" });
      }
      return linked;
    });
  }
  async requestSteer(runId: string, input: unknown) {
    const data = steerInput.parse(input);
    return await this.lifecycle.store.transaction(async () => {
      const store = this.lifecycle.store;
      const run = await store.get("run", runId);
      if (
        !run.native_run_id ||
        run.status !== "running" ||
        !run.dispatch_token ||
        (data.expected_native_run_id && data.expected_native_run_id !== run.native_run_id)
      )
        throw new DomainError("CONFLICT");
      await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      const now = new Date().toISOString();
      let message: Entity<"message">;
      if (data.queued_run_id) {
        const queued = await store.get("run", data.queued_run_id);
        if (queued.thread_id !== run.thread_id || queued.agent_id !== run.agent_id)
          throw new DomainError("SCOPE_DENIED", 403);
        if (queued.goal_id !== run.goal_id || queued.routine_id !== null)
          throw new DomainError("SCOPE_DENIED", 403);
        if (queued.status !== "queued" || queued.delivery !== "pending")
          throw new DomainError("CONFLICT");
        message = await store.get("message", queued.input_message_id);
        if (message.author !== "user" || message.state === "deleted")
          throw new DomainError("CONFLICT");
        await this.update(queued, { delivery: "steering" });
      } else {
        message = await store.put({
          id: crypto.randomUUID(),
          owner_id: store.ownerId,
          revision: 1,
          created_at: now,
          updated_at: now,
          kind: "message",
          creation_operation_id: null,
          purpose: "conversation",
          source_run_id: null,
          artifact_ids: [],
          thread_id: run.thread_id,
          author: "user",
          author_agent_id: null,
          routine_id: null,
          run_id: run.id,
          text: data.text as string,
          state: "complete",
        });
      }
      return await store.put({
        id: crypto.randomUUID(),
        owner_id: store.ownerId,
        revision: 1,
        created_at: now,
        updated_at: now,
        kind: "control",
        thread_id: run.thread_id,
        agent_id: run.agent_id,
        run_id: run.id,
        native_run_id: run.native_run_id,
        message_id: message.id,
        queued_run_id: data.queued_run_id ?? null,
        state: "requested",
        error_code: null,
      });
    });
  }
  async settleSteer(
    controlId: string,
    state: "accepted" | "rejected" | "unknown",
    code: string | null = null,
  ) {
    return await this.lifecycle.store.transaction(async () => {
      const store = this.lifecycle.store;
      const control = await store.get("control", controlId);
      if (control.state !== "requested") return control;
      if (control.queued_run_id) {
        const run = await store.get("run", control.queued_run_id);
        if (run.status === "queued")
          await this.update(
            run,
            state === "accepted"
              ? { status: "steered", outcome: "steered", delivery: "delivered" }
              : { delivery: state === "unknown" ? "unknown" : "pending" },
          );
      }
      return await this.update(control, { state, error_code: code });
    });
  }
}
