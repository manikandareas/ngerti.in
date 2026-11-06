import { AttachmentSubmissions } from "./attachments/submissions";
import { DomainError, type Entity } from "./contracts";
import { GroupSchedules } from "./goals/group-schedules";
import { Goals } from "./goals/service";
import { RoutingWorker } from "./groups/routing-worker";
import { Groups } from "./groups/service";
import { diagnostic } from "./harness/contracts";
import { Interactions } from "./interactions/service";
import type { Lifecycle } from "./lifecycle";

export interface ExecutorContext {
  signal: AbortSignal;
  /** Called only after native acceptance. Abort intent alone never confirms native stop. */
  started(nativeRunId?: string): void;
  /** A structured tool receipt has reached the native transport; self-stop can now interrupt. */
  controlReady?(): void;
}
export interface HarnessExecutor {
  preparationRevision?(): string;
  prepare?(threadId: string, agentId: string): Promise<unknown>;
  execute(
    run: Entity<"run">,
    context: ExecutorContext,
  ): Promise<"succeeded" | "failed" | "cancelled" | "unknown">;
}
type Work = { run: Entity<"run">; controller: AbortController; done: Promise<void> };

/** Scheduler and dispatcher share the application authority; neither runs a model loop. */
export class Background {
  readonly #work = new Map<string, Work>();
  readonly #preparing = new Map<string, Promise<void>>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #stopping = false;
  #closed = false;
  #dispatchCursor: string | null = null;
  #lastAttachmentSweep = 0;
  #unsubscribe: (() => void) | null = null;
  #wakePending = false;
  readonly #routing: RoutingWorker;
  constructor(
    readonly lifecycle: Lifecycle,
    private readonly executors: Partial<Record<"codex" | "muse", HarnessExecutor>> = {},
    private readonly report: (code: string) => void = () => {},
    private readonly concurrency = 4,
  ) {
    this.#routing = new RoutingWorker(lifecycle, () => this.wake());
  }

  get executorCount() {
    return Object.keys(this.executors).length;
  }
  get activeCount() {
    return this.#work.size;
  }

  start(intervalMs = 1000) {
    if (this.#timer || this.#stopping) return;
    this.#unsubscribe = this.lifecycle.store.subscribe(() => this.wake());
    this.tick();
    this.#timer = setInterval(() => this.tick(), intervalMs);
  }

  /** Coalesce committed changes without reentering the dispatcher or bypassing claim fencing. */
  wake() {
    if (!this.#timer || this.#stopping || this.#wakePending) return;
    this.#wakePending = true;
    queueMicrotask(() => {
      this.#wakePending = false;
      if (!this.#stopping && !this.lifecycle.store.closed) this.tick(new Date(), false);
    });
  }

  tick(now = new Date(), checkControls = true) {
    if (this.#stopping) return;
    if (now.getTime() - this.#lastAttachmentSweep >= 60_000) {
      this.#lastAttachmentSweep = now.getTime();
      try {
        new AttachmentSubmissions(this.lifecycle).sweep(now);
      } catch {
        this.report("ATTACHMENT_CLEANUP_ERROR");
      }
    }
    new Interactions(this.lifecycle).advance();
    new Groups(this.lifecycle).advance();
    this.#routing.advance();
    new Goals(this.lifecycle).advance(now);
    new GroupSchedules(this.lifecycle).advance();
    for (const routine of this.lifecycle.store.list("routine")) {
      try {
        this.lifecycle.fireRoutine(routine.id, now);
      } catch (error) {
        this.report(error instanceof DomainError ? error.code : "SCHEDULER_ERROR");
      }
    }
    // Owner controls call notifyControls immediately. A commit wake must not abort a native
    // self-stop tool before its committed receipt has crossed the tool transport.
    for (const work of checkControls ? this.#work.values() : []) {
      if (this.lifecycle.store.get("run", work.run.id).cancellation === "requested")
        work.controller.abort();
    }
    const runs = this.lifecycle.store.list("run");
    const heads = new Map<string, string>();
    for (const run of runs) {
      const lane = `${run.thread_id}:${run.agent_id}`;
      if (run.status === "queued" && !heads.has(lane)) heads.set(lane, run.id);
    }
    const offset =
      this.#dispatchCursor === null
        ? 0
        : runs.findIndex((run) => run.id === this.#dispatchCursor) + 1;
    // A lane that cannot prepare must not starve later, ready lanes on every tick.
    for (let queued of [...runs.slice(offset), ...runs.slice(0, offset)]) {
      if (this.#work.size + this.#preparing.size >= this.concurrency) break;
      if (queued.status !== "queued" || queued.delivery !== "pending") continue;
      if (heads.get(`${queued.thread_id}:${queued.agent_id}`) !== queued.id) continue;
      const executionAgent = this.lifecycle.store.get("agent", queued.agent_id);
      const execution = this.executors[executionAgent.harness];
      if (queued.preparation?.state === "blocked") {
        if (
          queued.preparation.configuration_revision ===
            this.lifecycle.preparationConfiguration(queued) &&
          queued.preparation.runtime_revision === execution?.preparationRevision?.()
        )
          continue;
        // A repaired connection or configuration retries preparation of the same
        // undispatched input. Native unknown outcomes remain fenced above.
        queued = this.lifecycle.retryPreparation(queued.id, queued.revision);
      }
      if (
        queued.preparation?.next_attempt_at &&
        queued.preparation.next_attempt_at > now.toISOString()
      )
        continue;
      const thread = this.lifecycle.store.get("thread", queued.thread_id);
      if (
        thread.type === "group" &&
        thread.purpose === "conversation" &&
        runs.some(
          (run) =>
            run.thread_id === thread.id &&
            ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
      )
        continue;
      if (
        this.lifecycle.store
          .list("run")
          .some(
            (run) =>
              run.thread_id === queued.thread_id &&
              run.agent_id === queued.agent_id &&
              ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
          )
      )
        continue;
      const agent = this.lifecycle.store.get("agent", queued.agent_id);
      const executor = this.executors[agent.harness];
      // Missing adapters keep work queued. Never fall back to another provider or engine.
      if (!executor) continue;
      const lane = `${queued.thread_id}:${queued.agent_id}`;
      if (this.#preparing.has(lane)) continue;
      this.#dispatchCursor = queued.id;
      if (executor.prepare) {
        this.lifecycle.preparing(queued.id, executor.preparationRevision?.());
        const pending = executor
          .prepare(queued.thread_id, queued.agent_id)
          .then(() => {
            if (!this.#stopping && !this.#closed) {
              this.lifecycle.prepared(queued.id);
              this.claim(queued.thread_id, queued.agent_id);
            }
          })
          .catch((error) => {
            if (!this.#closed && !this.#stopping)
              this.lifecycle.preparationFailed(
                queued.id,
                diagnostic(error),
                executor.preparationRevision?.(),
              );
            this.report(error instanceof DomainError ? error.code : "SESSION_PREPARATION_FAILED");
          })
          .finally(() => {
            this.#preparing.delete(lane);
            this.wake();
          });
        this.#preparing.set(lane, pending);
        continue;
      }
      this.claim(queued.thread_id, queued.agent_id);
    }
  }

  /** Control requests bypass ordinary work and do not wait for the next scheduler tick. */
  notifyControls() {
    this.wake();
    for (const work of this.#work.values())
      if (this.lifecycle.store.get("run", work.run.id).cancellation === "requested")
        work.controller.abort();
  }

  private claim(threadId: string, agentId: string) {
    if (this.#work.size >= this.concurrency) return;
    const agent = this.lifecycle.store.get("agent", agentId);
    const executor = this.executors[agent.harness];
    if (!executor) return;
    try {
      const run = this.lifecycle.claimNext(threadId, agentId);
      if (!run) return;
      const controller = new AbortController();
      const work: Work = { run, controller, done: Promise.resolve() };
      this.#work.set(run.id, work);
      work.done = this.execute(work, executor);
    } catch (error) {
      const pending = this.lifecycle.store
        .list("run")
        .find(
          (run) =>
            run.thread_id === threadId && run.agent_id === agentId && run.status === "queued",
        );
      if (pending?.preparation)
        this.lifecycle.preparationFailed(pending.id, {
          code: error instanceof DomainError ? error.code : "PROTOCOL_ERROR",
          category: "configuration",
          outcome: "not_dispatched",
        });
      this.report(error instanceof DomainError ? error.code : "DISPATCH_ERROR");
    }
  }

  private async execute(work: Work, executor: HarnessExecutor) {
    const token = work.run.dispatch_token;
    if (!token) throw new Error("Dispatch token is required.");
    try {
      const run = this.lifecycle.authorizeDispatch(work.run.id, token);
      const outcome = await executor.execute(run, {
        signal: work.controller.signal,
        started: (nativeRunId) => {
          if (!this.#closed) this.lifecycle.started(run.id, token, nativeRunId);
        },
        controlReady: () => {
          if (!this.#closed && this.lifecycle.store.get("run", run.id).cancellation === "requested")
            work.controller.abort();
        },
      });
      if (this.#closed) return;
      this.lifecycle.settle(run.id, token, outcome);
    } catch (error) {
      if (this.#closed) return;
      // A thrown error may follow an accepted native request or external effect.
      const current = this.lifecycle.store.get("run", work.run.id);
      if (["dispatching", "running", "cancel_requested"].includes(current.status))
        this.lifecycle.settle(work.run.id, token, "unknown");
      this.report(error instanceof DomainError ? error.code : "EXECUTION_UNKNOWN");
    } finally {
      this.#work.delete(work.run.id);
      this.wake();
    }
  }

  async idle() {
    await this.#routing.idle();
    await Promise.all([...this.#preparing.values()]);
    await Promise.all([...this.#work.values()].map((work) => work.done));
  }

  async stop(timeoutMs = 5000) {
    this.#stopping = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    await this.#routing.close();
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    for (const work of this.#work.values()) {
      this.lifecycle.cancel(work.run.id);
      work.controller.abort();
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.idle(),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    for (const work of this.#work.values()) {
      const token = work.run.dispatch_token;
      if (token) this.lifecycle.settle(work.run.id, token, "unknown");
    }
    this.#closed = true;
    // The process exits after stop. Late native completion must not touch a closed store.
  }
}
