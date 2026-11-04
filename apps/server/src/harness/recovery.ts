import type { Store } from "../store";

export interface RecoveryPolicy {
  interval_ms: number;
  stale_ms: number;
  retry_ms: number;
  max_retry_ms: number;
  concurrency: number;
}
const defaults: RecoveryPolicy = {
  interval_ms: 1000,
  stale_ms: 45_000,
  retry_ms: 2000,
  max_retry_ms: 60_000,
  concurrency: 2,
};
type Check = { next: number; attempts: number; observation: number };
type Watch = Check & { inspect: () => Promise<void> };

/** Receipt observation only. Admission, execution and settlement remain with their existing owners. */
export class RunRecovery {
  readonly #policy: RecoveryPolicy;
  readonly #unknown = new Map<string, Check>();
  readonly #watches = new Map<string, Watch>();
  readonly #pending = new Set<string>();
  #timer: ReturnType<typeof setInterval> | undefined;
  #unsubscribe: (() => void) | undefined;
  #closed = false;
  #wakePending = false;

  constructor(
    private readonly store: Store,
    private readonly reconcile: (runId: string) => Promise<unknown>,
    policy: Partial<RecoveryPolicy> = {},
    private readonly report: (runId: string, error: unknown) => void = () => {},
  ) {
    this.#policy = { ...defaults, ...policy };
  }

  start() {
    if (this.#closed || this.#timer !== undefined) return;
    this.#timer = setInterval(() => this.tick(), this.#policy.interval_ms);
    this.#unsubscribe = this.store.subscribe(() => {
      if (this.#wakePending) return;
      this.#wakePending = true;
      queueMicrotask(() => {
        this.#wakePending = false;
        this.tick();
      });
    });
    this.tick();
  }

  watch(runId: string, inspect: () => Promise<void>) {
    const watch: Watch = {
      inspect,
      next: Date.now() + this.#policy.stale_ms,
      attempts: 0,
      observation: 0,
    };
    this.#watches.set(runId, watch);
    return {
      observe: () => {
        watch.next = Date.now() + this.#policy.stale_ms;
        watch.attempts = 0;
        watch.observation++;
      },
      dispose: () => {
        if (this.#watches.get(runId) === watch) this.#watches.delete(runId);
      },
    };
  }

  private tick() {
    if (this.#closed || this.store.closed) return;
    const now = Date.now();
    const unknown = this.store.list("run").filter((run) => run.status === "unknown");
    const unresolved = new Set(unknown.map((run) => run.id));
    for (const id of this.#unknown.keys()) if (!unresolved.has(id)) this.#unknown.delete(id);
    for (const run of unknown) {
      if (!run.binding_id || !(run.native_run_id ?? run.native_dispatch_id)) continue;
      let check = this.#unknown.get(run.id);
      if (!check) {
        check = { next: now, attempts: 0, observation: 0 };
        this.#unknown.set(run.id, check);
      }
      this.inspect(run.id, check, () => this.reconcile(run.id));
    }
    for (const [id, watch] of this.#watches)
      this.inspect(id, watch, watch.inspect, this.#policy.stale_ms);
  }

  private inspect(id: string, check: Check, operation: () => Promise<unknown>, minimumDelay = 0) {
    if (
      check.next > Date.now() ||
      this.#pending.has(id) ||
      this.#pending.size >= this.#policy.concurrency
    )
      return;
    this.#pending.add(id);
    const observation = check.observation;
    void Promise.resolve()
      .then(operation)
      .catch((error) => {
        // Uncertain receipts never authorize replay. Keep diagnostics private and correlated.
        if (!this.#closed) this.report(id, error);
      })
      .finally(() => {
        this.#pending.delete(id);
        if (this.#closed || check.observation !== observation) return;
        const delay = Math.max(
          minimumDelay,
          Math.min(
            this.#policy.max_retry_ms,
            this.#policy.retry_ms * 2 ** Math.min(check.attempts++, 10),
          ),
        );
        check.next = Date.now() + delay;
      });
  }

  close() {
    this.#closed = true;
    clearInterval(this.#timer);
    this.#unsubscribe?.();
    this.#watches.clear();
    this.#unknown.clear();
  }
}
