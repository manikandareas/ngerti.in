import { DomainError, type Entity } from "./contracts";
import { diagnostic } from "./harness/contracts";
import type { Lifecycle } from "./lifecycle";

export interface ExecutorContext {
  signal: AbortSignal;
  /** Called only after native acceptance. Abort intent alone never confirms native stop. */
  started(nativeRunId?: string): void;
}
export interface HarnessExecutor {
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
  constructor(
    readonly lifecycle: Lifecycle,
    private readonly executors: Partial<Record<"codex" | "muse", HarnessExecutor>> = {},
    private readonly report: (code: string) => void = () => {},
    private readonly concurrency = 4,
  ) {}

  get executorCount() {
    return Object.keys(this.executors).length;
  }
  get activeCount() {
    return this.#work.size;
  }

  start(intervalMs = 1000) {
    if (this.#timer || this.#stopping) return;
    this.tick();
    this.#timer = setInterval(() => this.tick(), intervalMs);
  }

  tick(now = new Date()) {
    if (this.#stopping) return;
    for (const routine of this.lifecycle.store.list("routine")) {
      try {
        this.lifecycle.fireRoutine(routine.id, now);
      } catch (error) {
        this.report(error instanceof DomainError ? error.code : "SCHEDULER_ERROR");
      }
    }
    for (const work of this.#work.values()) {
      if (this.lifecycle.store.get("run", work.run.id).cancellation === "requested")
        work.controller.abort();
    }
    for (const queued of this.lifecycle.store.list("run")) {
      if (this.#work.size + this.#preparing.size >= this.concurrency) break;
      if (queued.status !== "queued" || queued.delivery !== "pending") continue;
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
      if (executor.prepare) {
        const pending = executor
          .prepare(queued.thread_id, queued.agent_id)
          .then(() => {
            if (!this.#stopping) this.claim(queued.thread_id, queued.agent_id);
          })
          .catch((error) => {
            if (!this.#closed && !this.#stopping)
              this.lifecycle.recordDiagnostic(queued.id, diagnostic(error));
            this.report(error instanceof DomainError ? error.code : "SESSION_PREPARATION_FAILED");
          })
          .finally(() => this.#preparing.delete(lane));
        this.#preparing.set(lane, pending);
        continue;
      }
      this.claim(queued.thread_id, queued.agent_id);
    }
  }

  /** Control requests bypass ordinary work and do not wait for the next scheduler tick. */
  notifyControls() {
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
    }
  }

  async idle() {
    await Promise.all([...this.#preparing.values()]);
    await Promise.all([...this.#work.values()].map((work) => work.done));
  }

  async stop(timeoutMs = 5000) {
    this.#stopping = true;
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
