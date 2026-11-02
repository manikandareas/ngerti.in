import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import { diagnostic, HarnessError, interactionAnswer } from "../harness/contracts";
import {
  type InteractionAnswer,
  type InteractionSnapshot,
  interactionSnapshot,
  type NativeInteraction,
} from "../harness/interaction-contracts";
import { canonical, type Store } from "../store";

const identity = (type: string, requestId: string, sourceIndex: number | null) =>
  canonical([type, requestId, sourceIndex]);
const answerIdentity = (answer: InteractionAnswer) =>
  identity(answer.type, answer.request_id, answer.type === "approval" ? answer.source_index : null);
const fingerprint = (value: unknown) => createHash("sha256").update(canonical(value)).digest("hex");
function redact<T>(value: T, text: (value: string) => string): T {
  if (typeof value === "string") return text(value) as T;
  if (Array.isArray(value)) return value.map((item) => redact(item, text)) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, redact(item, text)]),
    ) as T;
  return value;
}

/** App-owned observations and response fences, never a replay log for native effects. */
export class InteractionJournal {
  constructor(readonly store: Store) {}
  private run(runId: string) {
    const run = this.store.get("run", runId);
    if (run.owner_id !== this.store.ownerId) throw new DomainError("SCOPE_DENIED", 403);
    return run;
  }
  private write(run: Entity<"run">, records: NativeInteraction[]) {
    const acknowledgementReserve =
      records.filter((record) => record.submission?.state === "submitting").length * 512;
    if (
      Buffer.byteLength(JSON.stringify(records)) + acknowledgementReserve > 2 * 1024 * 1024 ||
      records.length > 1000
    )
      throw new HarnessError("PROTOCOL_ERROR");
    if (canonical(records) === canonical(run.native_interactions)) return run;
    return this.store.put(
      {
        ...run,
        native_interactions: records,
        revision: run.revision + 1,
        updated_at: new Date().toISOString(),
      },
      run.revision,
    );
  }
  history(runId: string) {
    const run = this.run(runId);
    return {
      run_id: run.id,
      run_status: run.status,
      cancellation: run.cancellation,
      coverage: "observed_requests_only" as const,
      records: run.native_interactions,
    };
  }
  observe(runId: string, raw: unknown, text: (value: string) => string): InteractionSnapshot {
    const snapshot = interactionSnapshot.parse(redact(interactionSnapshot.parse(raw), text));
    if (Buffer.byteLength(JSON.stringify(snapshot)) > 128 * 1024)
      throw new HarnessError("PROTOCOL_ERROR");
    this.store.transaction(() => {
      const run = this.run(runId);
      const message = this.store.answer(run.id);
      const ownMessage =
        message &&
        message.thread_id === run.thread_id &&
        message.author_agent_id === run.agent_id &&
        message.owner_id === run.owner_id &&
        message.state !== "deleted";
      const anchor = ownMessage
        ? {
            anchor_message_id: message.id,
            anchor_text_offset: message.text.length,
            anchor_prefix_sha256: createHash("sha256").update(message.text).digest("hex"),
          }
        : {
            anchor_message_id: run.input_message_id,
            anchor_text_offset: null,
            anchor_prefix_sha256: null,
          };
      const now = new Date().toISOString();
      const seen = new Set<string>();
      const records = [...run.native_interactions];
      const requests = [
        ...snapshot.approvals.map((request) => ({
          type: "approval" as const,
          request_id: request.approvalId,
          source_index: request.currentRequirementId.sourceIndex,
          request,
        })),
        ...snapshot.user_inputs.map((request) => ({
          type: "user_input" as const,
          request_id: request.userInputId,
          source_index: null,
          request,
        })),
      ];
      for (const request of requests) {
        const key = identity(request.type, request.request_id, request.source_index);
        if (seen.has(key)) throw new HarnessError("PROTOCOL_ERROR");
        seen.add(key);
        const index = records.findIndex(
          (record) => identity(record.type, record.request_id, record.source_index) === key,
        );
        const old = records[index];
        if (old) {
          const changed = canonical(old.request) !== canonical(request.request);
          if (changed && old.submission && old.submission.state !== "not_dispatched")
            throw new HarnessError("PROTOCOL_ERROR", "unknown");
          if (changed || old.observed_state !== "pending")
            records[index] = {
              ...old,
              ...request,
              observed_state: "pending",
              last_observed_at: now,
            } as NativeInteraction;
        } else
          records.push({
            ...request,
            ...anchor,
            id: crypto.randomUUID(),
            observed_at: now,
            last_observed_at: now,
            observed_state: "pending",
            submission: null,
          });
      }
      this.write(
        run,
        records.map((record) =>
          record.observed_state === "pending" &&
          !seen.has(identity(record.type, record.request_id, record.source_index))
            ? { ...record, observed_state: "not_pending", last_observed_at: now }
            : record,
        ),
      );
    });
    return snapshot;
  }
  replay(runId: string, raw: unknown) {
    const answer = interactionAnswer.parse(raw);
    const record = this.run(runId).native_interactions.find(
      (item) => identity(item.type, item.request_id, item.source_index) === answerIdentity(answer),
    );
    const submitted = record?.submission;
    if (!submitted || submitted.state === "not_dispatched") return null;
    if (submitted.fingerprint !== fingerprint(answer))
      throw new DomainError("IDEMPOTENCY_CONFLICT");
    if (submitted.state === "submitted") return { status: "submitted" as const };
    if (submitted.state === "unknown") throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    throw new DomainError("CONFLICT");
  }
  begin(runId: string, raw: unknown, text: (value: string) => string) {
    const answer = interactionAnswer.parse(raw);
    return this.store.transaction(() => {
      if (this.replay(runId, answer)) return null;
      const run = this.run(runId);
      const index = run.native_interactions.findIndex(
        (item) =>
          identity(item.type, item.request_id, item.source_index) === answerIdentity(answer),
      );
      const record = run.native_interactions[index];
      if (record?.observed_state !== "pending") throw new HarnessError("NATIVE_REJECTED");
      const now = new Date().toISOString();
      const submission = {
        attempt_id: crypto.randomUUID(),
        fingerprint: fingerprint(answer),
        answer: redact(answer, text),
        state: "submitting" as const,
        started_at: now,
        updated_at: now,
        diagnostic: null,
      };
      const records = [...run.native_interactions];
      records[index] = { ...record, submission };
      this.write(run, records);
      return { record_id: record.id, attempt_id: submission.attempt_id };
    });
  }
  settle(
    runId: string,
    recordId: string,
    attemptId: string,
    state: "submitted" | "not_dispatched" | "unknown",
    problem: ReturnType<typeof diagnostic> | null = null,
  ) {
    if (this.store.closed) return;
    this.store.transaction(() => {
      const run = this.run(runId);
      const records = run.native_interactions.map((record) => {
        const current = record.submission;
        if (
          record.id !== recordId ||
          current?.attempt_id !== attemptId ||
          current.state === "submitted"
        )
          return record;
        if (current.state === state && canonical(current.diagnostic) === canonical(problem))
          return record;
        return {
          ...record,
          submission: {
            ...current,
            state,
            diagnostic: problem,
            updated_at: new Date().toISOString(),
          },
        };
      });
      this.write(run, records);
    });
  }
  recover() {
    for (const run of this.store.list("run"))
      for (const record of run.native_interactions)
        if (record.submission?.state === "submitting")
          this.settle(
            run.id,
            record.id,
            record.submission.attempt_id,
            "unknown",
            diagnostic(new HarnessError("NATIVE_UNKNOWN", "unknown")),
          );
  }
}
