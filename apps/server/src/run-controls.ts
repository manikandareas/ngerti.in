import {
  admissionInput,
  DomainError,
  type Entity,
  queueDelete,
  queueEdit,
  steerInput,
} from "./contracts";
import type { Lifecycle } from "./lifecycle";

/** Only standalone, unquoted control utterances take this independent path. User text stays unchanged. */
export function cancellationIntent(text: string): "run" | "pause_goal" | "stop_goal" | null {
  if (/[?？]/u.test(text)) return null;
  const sentence = text
    .trim()
    .toLowerCase()
    .replace(/[.!?,]+$/u, "")
    .trim();
  const polite = sentence
    .replace(/^(?:please|tolong)\s+/u, "")
    .replace(/\s+(?:please|ya|dong|deh)$/u, "");
  if (
    /^(?:stop|cancel|abort|hentikan|batalkan|berhenti)(?:\s+(?:this|that|the|current|work|job|now|pekerjaan|run|task|tugas|yang|sedang|berjalan|ini|sekarang|lagi|dulu|saja|aja))*$/u.test(
      polite,
    )
  )
    return "run";
  if (
    /^(?:(?:ga|gak|nggak|jangan)(?:\s+usah)?\s+(?:dilanjutkan|dilanjutin|lanjutkan|lanjutin|lanjut|diteruskan)|(?:sudah|udah)\s+cukup|don't continue)$/u.test(
      polite,
    )
  )
    return "run";
  if (
    /^(?:gak|ga|nggak|tidak|enggak)\s*jadi(?:\s+(?:aja|deh))?$|^gajadi(?:\s+deh)?$|^never mind$/u.test(
      polite,
    )
  )
    return "run";
  if (
    /^(?:pause|jeda|tunda)(?:\s+(?:this|the|current))?\s+(?:goal|tujuan)(?:\s+(?:ini|sekarang))?$/u.test(
      polite,
    )
  )
    return "pause_goal";
  if (
    /^(?:stop|cancel|hentikan|batalkan)(?:\s+(?:this|the|current))?\s+(?:goal|tujuan)(?:\s+(?:ini|sekarang))?$/u.test(
      polite,
    )
  )
    return "stop_goal";
  return null;
}

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
    const data = admissionInput.parse(input);
    const intent = cancellationIntent(data.text);
    if (!intent) return { ...this.lifecycle.admit(data), control: null };
    return this.lifecycle.store.transaction(() => {
      const store = this.lifecycle.store;
      const thread = store.get("thread", data.thread_id);
      store.get("agent", data.agent_id);
      if (!thread.member_agent_ids.includes(data.agent_id))
        throw new DomainError("SCOPE_DENIED", 403);
      const lane = store
        .list("run")
        .filter((item) => item.thread_id === data.thread_id && item.agent_id === data.agent_id);
      const current =
        lane.find((item) =>
          ["dispatching", "running", "cancel_requested", "unknown"].includes(item.status),
        ) ?? lane.find((item) => item.status === "queued" && item.delivery === "pending");
      let goal: Entity<"goal"> | undefined;
      if (intent !== "run") {
        const goals = store
          .list("goal")
          .filter(
            (item) =>
              item.thread_id === data.thread_id &&
              item.agent_id === data.agent_id &&
              ["active", "paused"].includes(item.state),
          );
        const goalId = data.goal_id ?? current?.goal_id;
        goal = goalId
          ? goals.find((item) => item.id === goalId)
          : goals.length === 1
            ? goals[0]
            : undefined;
        if (!goal) throw new DomainError("CONTROL_AMBIGUOUS");
      }
      if (
        data.routine_id ||
        (intent === "run" && data.goal_id && current?.goal_id !== data.goal_id)
      )
        throw new DomainError("SCOPE_DENIED", 403);
      const now = new Date().toISOString();
      const message = store.put({
        id: crypto.randomUUID(),
        owner_id: store.ownerId,
        revision: 1,
        created_at: now,
        updated_at: now,
        kind: "message",
        purpose: "conversation",
        source_run_id: null,
        artifact_ids: [],
        thread_id: data.thread_id,
        author: "user",
        author_agent_id: null,
        routine_id: null,
        run_id: null,
        text: data.text,
        state: "complete",
      });
      if (goal) {
        const result = this.lifecycle.controlGoal(
          goal.id,
          intent === "pause_goal" ? "paused" : "stopped",
        );
        return { message, run: null, control: { action: intent, goal: result } };
      }
      return {
        message,
        run: current ? this.lifecycle.cancel(current.id) : null,
        control: { action: "stop_run" },
      };
    });
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
