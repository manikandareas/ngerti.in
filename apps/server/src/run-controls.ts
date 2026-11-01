import {
  admissionInput,
  DomainError,
  type Entity,
  queueDelete,
  queueEdit,
  steerInput,
} from "./contracts";
import type { Lifecycle } from "./lifecycle";

export class RunControls {
  constructor(readonly lifecycle: Lifecycle) {}
  private update<T extends Entity>(value: T, fields: Partial<T>): T {
    return this.lifecycle.store.put(
      { ...value, ...fields, revision: value.revision + 1, updated_at: new Date().toISOString() },
      value.revision,
    );
  }
  private queued(messageId: string, expectedRevision: number) {
    const message = this.lifecycle.store.get("message", messageId);
    if (
      message.revision !== expectedRevision ||
      message.author !== "user" ||
      !message.run_id ||
      message.state === "deleted"
    )
      throw new DomainError("CONFLICT");
    const run = this.lifecycle.store.get("run", message.run_id);
    if (run.status !== "queued" || run.delivery !== "pending") throw new DomainError("CONFLICT");
    return { message, run };
  }
  edit(messageId: string, input: unknown) {
    const data = queueEdit.parse(input);
    return this.lifecycle.store.transaction(() => {
      const { message } = this.queued(messageId, data.expected_revision);
      return this.update(message, { text: data.text });
    });
  }
  remove(messageId: string, input: unknown) {
    const data = queueDelete.parse(input);
    return this.lifecycle.store.transaction(() => {
      const { message, run } = this.queued(messageId, data.expected_revision);
      this.lifecycle.cancel(run.id);
      // A durable tombstone lets reconnecting clients remove their projection without losing its identity.
      return this.update(message, { state: "deleted" });
    });
  }
  send(input: unknown) {
    return { ...this.lifecycle.admit(admissionInput.parse(input)), control: null };
  }
  requestSteer(runId: string, input: unknown) {
    const data = steerInput.parse(input);
    return this.lifecycle.store.transaction(() => {
      const store = this.lifecycle.store;
      const run = store.get("run", runId);
      if (
        !run.native_run_id ||
        run.status !== "running" ||
        !run.dispatch_token ||
        (data.expected_native_run_id && data.expected_native_run_id !== run.native_run_id)
      )
        throw new DomainError("CONFLICT");
      this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      const now = new Date().toISOString();
      let message: Entity<"message">;
      if (data.queued_run_id) {
        const queued = store.get("run", data.queued_run_id);
        if (queued.thread_id !== run.thread_id || queued.agent_id !== run.agent_id)
          throw new DomainError("SCOPE_DENIED", 403);
        if (queued.goal_id !== run.goal_id || queued.routine_id !== null)
          throw new DomainError("SCOPE_DENIED", 403);
        if (queued.status !== "queued" || queued.delivery !== "pending")
          throw new DomainError("CONFLICT");
        message = store.get("message", queued.input_message_id);
        if (message.author !== "user" || message.state === "deleted")
          throw new DomainError("CONFLICT");
        this.update(queued, { delivery: "steering" });
      } else {
        message = store.put({
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
      return store.put({
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
  settleSteer(
    controlId: string,
    state: "accepted" | "rejected" | "unknown",
    code: string | null = null,
  ) {
    return this.lifecycle.store.transaction(() => {
      const store = this.lifecycle.store;
      const control = store.get("control", controlId);
      if (control.state !== "requested") return control;
      if (control.queued_run_id) {
        const run = store.get("run", control.queued_run_id);
        if (run.status === "queued")
          this.update(
            run,
            state === "accepted"
              ? { status: "steered", outcome: "steered", delivery: "delivered" }
              : { delivery: state === "unknown" ? "unknown" : "pending" },
          );
      }
      return this.update(control, { state, error_code: code });
    });
  }
}
