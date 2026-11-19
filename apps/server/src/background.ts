import { AttachmentSubmissions } from "./attachments/submissions";
import { Boards } from "./boards/service";
import { DomainError, type Entity } from "./contracts";
import { RoutineDelivery } from "./goals/delivery";
import { GroupSchedules } from "./goals/group-schedules";
import { Goals } from "./goals/service";
import { groupRunBlocks, peerBudgetDeadline, peerBudgetExpired } from "./groups/execution";
import { RoutingWorker } from "./groups/routing-worker";
import { Groups } from "./groups/service";
import type { HarnessId } from "./harness/availability";
import { diagnostic, HarnessError } from "./harness/contracts";
import { Channels } from "./integrations/channels";
import { Interactions } from "./interactions/service";
import { SkillCurator } from "./learning/curator";
import { LearningReviews, type ReviewInference } from "./learning/reviews";
import type { Lifecycle } from "./lifecycle";
import type { DataContext } from "./persistence/access-context";

export interface ExecutorContext {
  signal: AbortSignal;
  /** Called only after native acceptance. Abort intent alone never confirms native stop. */
  started(nativeRunId?: string): Promise<void>;
  /** A structured tool receipt has reached the native transport; self-stop can now interrupt. */
  controlReady?(): Promise<void>;
}
export interface HarnessExecutor {
  review?: ReviewInference;
  settled?(run: Entity<"run">): Promise<unknown>;
  preparationRevision?(): string;
  prepare?(threadId: string, agentId: string): Promise<unknown>;
  execute(
    run: Entity<"run">,
    context: ExecutorContext,
  ): Promise<"succeeded" | "failed" | "cancelled" | "unknown">;
}
type Work = {
  run: Entity<"run">;
  controller: AbortController;
  done: Promise<void>;
  scope?: DataContext;
};

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
  #ticking: Promise<void> | undefined;
  #tickAgain = false;
  #dispatching: Promise<void> = Promise.resolve();
  readonly #routing: RoutingWorker;
  readonly #learning: LearningReviews;
  readonly #curator: SkillCurator;
  readonly #deliveries: RoutineDelivery;
  readonly #channels: Channels;
  constructor(
    readonly lifecycle: Lifecycle,
    private readonly executors: Partial<Record<HarnessId, HarnessExecutor>> = {},
    private readonly report: (code: string) => void = () => {},
    private readonly concurrency = 4,
  ) {
    this.#routing = new RoutingWorker(lifecycle, async () => await this.wake());
    this.#learning = new LearningReviews(lifecycle);
    this.#curator = new SkillCurator(lifecycle);
    this.#deliveries = new RoutineDelivery(lifecycle);
    this.#channels = new Channels(lifecycle);
    lifecycle.store.signal.addEventListener(
      "abort",
      () => {
        for (const work of this.#work.values()) work.controller.abort();
      },
      { once: true },
    );
  }

  get executorCount() {
    return Object.keys(this.executors).length;
  }
  get activeCount() {
    return this.#work.size;
  }

  cancelLearningReview(runId: string) {
    return this.#learning.cancel(runId);
  }

  interruptCancelledLearningReview(runId: string) {
    this.#learning.interruptCancelled(runId);
  }

  async start(intervalMs = 1000) {
    if (this.#timer || this.#stopping) return;
    this.#unsubscribe = this.lifecycle.store.subscribe(async () => await this.wake());
    this.#timer = setInterval(() => {
      void this.tick().catch(() => this.report("SCHEDULER_ERROR"));
    }, intervalMs);
    await this.tick();
  }

  /** Coalesce committed changes without reentering the dispatcher or bypassing claim fencing. */
  wake() {
    if (!this.#timer || this.#stopping || this.#wakePending) return;
    this.#wakePending = true;
    queueMicrotask(() => {
      this.#wakePending = false;
      if (!this.#stopping && !this.lifecycle.store.closed)
        void this.tick(new Date(), false).catch(() => this.report("SCHEDULER_ERROR"));
    });
  }

  tick(now = new Date(), checkControls = true): Promise<void> {
    if (this.lifecycle.store.dataContext)
      return this.lifecycle.store.outsideDataContext(() => this.tick(now, checkControls));
    if (this.#stopping || this.lifecycle.store.closed) return Promise.resolve();
    if (this.#ticking) {
      this.#tickAgain = true;
      return this.#ticking;
    }
    this.#ticking = (async () => {
      for (const work of this.#work.values()) {
        if (!checkControls || this.lifecycle.toolControlHeld(work.run.id)) continue;
        try {
          if (peerBudgetExpired(work.run, Math.max(now.getTime(), Date.now()))) {
            if (!work.controller.signal.aborted) await this.stopExpiredPeer(work);
            continue;
          }
          if (!work.scope) continue;
          await this.inScope(work, () =>
            this.lifecycle.authorizeDispatch(work.run.id, work.run.dispatch_token as string),
          );
        } catch {
          if (work.scope) await this.lifecycle.store.fenceScopedRun(work.run);
          work.controller.abort();
        }
      }
      await this.dispatchTick(now, checkControls);
      await this.lifecycle.store.scopeRunner?.(async () => {
        await this.lifecycle.store.dataContext?.validate(true);
        if (checkControls) await this.lifecycle.recoverScopedRuns();
        await this.dispatchTick(now, checkControls);
      });
    })().finally(() => {
      this.#ticking = undefined;
      if (this.#tickAgain) {
        this.#tickAgain = false;
        this.wake();
      }
    });
    return this.#ticking;
  }

  private async dispatchTick(now: Date, checkControls: boolean) {
    if (this.#stopping || this.lifecycle.store.closed) return;
    await this.dispatchReady(now, checkControls);
    if (checkControls) {
      await this.advanceSchedules(now);
      await this.dispatchReady(now, checkControls);
      await this.#learning.advance(async (run, prompt, signal, authorize) => {
        const review =
          run.provider_selection && this.executors[run.provider_selection.harness]?.review;
        if (!review) throw new HarnessError("CAPABILITY_UNSUPPORTED");
        return await review(run, prompt, signal, authorize);
      }, this.report);
      await this.#curator.advance(now);
    }
  }

  private async advanceSchedules(now: Date) {
    if (now.getTime() - this.#lastAttachmentSweep >= 60_000) {
      this.#lastAttachmentSweep = now.getTime();
      try {
        await new AttachmentSubmissions(this.lifecycle).sweep(now);
      } catch {
        await this.report("ATTACHMENT_CLEANUP_ERROR");
      }
    }
    await new Interactions(this.lifecycle).advance();
    await new Groups(this.lifecycle).advance();
    await new Boards(this.lifecycle).advance(now, (run) => {
      const work = this.#work.get(run.id);
      return (
        !!work && work.run.dispatch_token === run.dispatch_token && !work.controller.signal.aborted
      );
    });
    await this.#routing.advance();
    await new Goals(this.lifecycle).advance(now);
    await new GroupSchedules(this.lifecycle).advance();
    await this.#deliveries.advance(now, this.report);
    await this.#channels.advance(now, this.report);
    for (const routine of await this.lifecycle.store.list("routine", { state: "active" })) {
      try {
        await this.lifecycle.fireRoutine(routine.id, now);
      } catch (error) {
        await this.report(error instanceof DomainError ? error.code : "SCHEDULER_ERROR");
      }
    }
  }

  notifyAdmission(threadId: string, agentId: string) {
    void this.dispatchReady(new Date(), false, { threadId, agentId }).catch(() =>
      this.report("DISPATCH_ERROR"),
    );
  }

  private dispatchReady(
    now: Date,
    checkControls: boolean,
    lane?: { threadId: string; agentId: string },
  ): Promise<void> {
    const pending = this.#dispatching.then(() => this.dispatchQueued(now, checkControls, lane));
    this.#dispatching = pending.catch(() => {});
    return pending;
  }

  private async dispatchQueued(
    now: Date,
    checkControls: boolean,
    target?: { threadId: string; agentId: string },
  ) {
    if (this.#stopping || this.lifecycle.store.closed) return;
    // Owner controls call notifyControls immediately. A commit wake must not abort a native
    // self-stop tool before its committed receipt has crossed the tool transport.
    for (const work of checkControls ? this.#work.values() : []) {
      const scope = this.lifecycle.store.dataContext;
      if (
        work.scope?.organizationId !== scope?.organizationId ||
        work.scope?.userId !== scope?.userId
      )
        continue;
      if (
        !this.lifecycle.toolControlHeld(work.run.id) &&
        (await this.lifecycle.store.get("run", work.run.id)).cancellation === "requested"
      )
        work.controller.abort();
    }
    const runs = await this.lifecycle.store.list("run", {
      ...(target ? { thread_id: target.threadId, agent_id: target.agentId } : {}),
      statuses: ["queued", "dispatching", "running", "cancel_requested", "unknown"],
    });
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
      if (target && (queued.thread_id !== target.threadId || queued.agent_id !== target.agentId))
        continue;
      if (heads.get(`${queued.thread_id}:${queued.agent_id}`) !== queued.id) continue;
      const { executionAgent, thread } = await this.lifecycle.store.read(async () => ({
        executionAgent: await this.lifecycle.store.get("agent", queued.agent_id),
        thread: await this.lifecycle.store.get("thread", queued.thread_id),
      }));
      const execution = this.executors[executionAgent.harness];
      if (queued.preparation?.state === "blocked") {
        if (
          queued.preparation.configuration_revision ===
            (await this.lifecycle.preparationConfiguration(queued)) &&
          queued.preparation.runtime_revision === execution?.preparationRevision?.()
        )
          continue;
        // A repaired connection or configuration retries preparation of the same
        // undispatched input. Native unknown outcomes remain fenced above.
        queued = await this.lifecycle.retryPreparation(queued.id, queued.revision);
      }
      if (
        queued.preparation?.next_attempt_at &&
        queued.preparation.next_attempt_at > now.toISOString()
      )
        continue;
      if (
        thread.type === "group" &&
        thread.purpose === "conversation" &&
        runs.some((run) => groupRunBlocks(queued, run))
      )
        continue;
      if (
        runs.some(
          (run) =>
            run.thread_id === queued.thread_id &&
            run.agent_id === queued.agent_id &&
            ["dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
      )
        continue;
      const executor = execution;
      // Missing adapters keep work queued. Never fall back to another provider or engine.
      if (!executor) continue;
      const lane = `${queued.thread_id}:${queued.agent_id}`;
      if (this.#preparing.has(lane)) continue;
      this.#dispatchCursor = queued.id;
      if (executor.prepare) {
        if (!(await this.lifecycle.preparing(queued.id, executor.preparationRevision?.())))
          continue;
        const pending = executor
          .prepare(queued.thread_id, queued.agent_id)
          .then(async () => {
            if (!this.#stopping && !this.#closed) {
              await this.claim(queued.thread_id, queued.agent_id, queued.id);
            }
          })
          .catch(async (error) => {
            if (!this.#closed && !this.#stopping)
              await this.lifecycle.preparationFailed(
                queued.id,
                diagnostic(error),
                executor.preparationRevision?.(),
              );
            await this.report(
              error instanceof DomainError ? error.code : "SESSION_PREPARATION_FAILED",
            );
          })
          .finally(async () => {
            this.#preparing.delete(lane);
            await this.wake();
          });
        this.#preparing.set(lane, pending);
        continue;
      }
      await this.claim(queued.thread_id, queued.agent_id);
    }
  }

  /** Control requests bypass ordinary work and do not wait for the next scheduler tick. */
  async notifyControls() {
    await this.wake();
    for (const work of this.#work.values()) {
      const scope = this.lifecycle.store.dataContext;
      if (
        work.scope?.organizationId !== scope?.organizationId ||
        work.scope?.userId !== scope?.userId
      )
        continue;
      if ((await this.lifecycle.store.get("run", work.run.id)).cancellation === "requested")
        work.controller.abort();
    }
  }

  private async claim(threadId: string, agentId: string, preparedRunId?: string) {
    if (this.#work.size >= this.concurrency) return;
    const agent = await this.lifecycle.store.get("agent", agentId);
    const executor = this.executors[agent.harness];
    if (!executor) return;
    try {
      const run = await this.lifecycle.claimNext(threadId, agentId, preparedRunId);
      if (!run) return;
      const controller = new AbortController();
      const work: Work = {
        run,
        controller,
        done: Promise.resolve(),
        scope: this.lifecycle.store.dataContext,
      };
      this.#work.set(run.id, work);
      work.done = this.execute(work, executor).catch(() => this.report("EXECUTION_UNKNOWN"));
    } catch (error) {
      const pending = (
        await this.lifecycle.store.list("run", {
          statuses: ["queued", "dispatching", "running", "cancel_requested", "unknown"],
        })
      ).find(
        (run) => run.thread_id === threadId && run.agent_id === agentId && run.status === "queued",
      );
      if (pending?.preparation)
        await this.lifecycle.preparationFailed(pending.id, {
          code: error instanceof DomainError ? error.code : "PROTOCOL_ERROR",
          category: "configuration",
          outcome: "not_dispatched",
        });
      await this.report(error instanceof DomainError ? error.code : "DISPATCH_ERROR");
    }
  }

  private async execute(work: Work, executor: HarnessExecutor) {
    const token = work.run.dispatch_token;
    if (!token) throw new Error("Dispatch token is required.");
    const deadline = peerBudgetDeadline(work.run);
    // The next general scheduler tick may be busy reconciling unrelated work.
    const budgetTimer =
      deadline === undefined
        ? undefined
        : setTimeout(
            () => {
              if (!work.controller.signal.aborted && !this.#closed)
                void this.stopExpiredPeer(work).catch(() => this.report("SCHEDULER_ERROR"));
            },
            Math.max(0, deadline - Date.now()),
          );
    try {
      const run = await this.lifecycle.authorizeDispatch(work.run.id, token);
      const outcome = await executor.execute(run, {
        signal: work.controller.signal,
        started: async (nativeRunId) => {
          if (!this.#closed && !this.lifecycle.store.closed)
            await this.lifecycle.started(run.id, token, nativeRunId);
        },
        controlReady: async () => {
          this.lifecycle.releaseToolControl(run.id);
          if (
            !this.#closed &&
            (await this.lifecycle.store.get("run", run.id)).cancellation === "requested"
          )
            work.controller.abort();
        },
      });
      if (this.#closed || this.lifecycle.store.closed) return;
      try {
        await this.lifecycle.settle(run.id, token, outcome);
        if (!this.#stopping && executor.settled)
          void executor.settled(await this.lifecycle.store.get("run", run.id)).catch(() => {});
      } catch (error) {
        if (!work.scope) throw error;
        await this.lifecycle.store.fenceScopedRun(work.run, outcome);
      }
    } catch (error) {
      if (this.#closed || this.lifecycle.store.closed) return;
      // A thrown error may follow an accepted native request or external effect.
      try {
        const current = await this.lifecycle.store.get("run", work.run.id);
        if (["dispatching", "running", "cancel_requested"].includes(current.status))
          await this.lifecycle.settle(work.run.id, token, "unknown");
      } catch (settlementError) {
        if (!work.scope) throw settlementError;
        await this.lifecycle.store.fenceScopedRun(work.run, "unknown");
      }
      await this.report(error instanceof DomainError ? error.code : "EXECUTION_UNKNOWN");
    } finally {
      clearTimeout(budgetTimer);
      this.#work.delete(work.run.id);
      await this.wake();
    }
  }

  async idle() {
    await this.#ticking;
    await this.#dispatching;
    await this.#routing.idle();
    await this.#deliveries.idle();
    await this.#channels.idle();
    await Promise.all([...this.#preparing.values()]);
    await Promise.all([...this.#work.values()].map((work) => work.done));
  }

  private inScope<T>(work: Work, action: () => Promise<T>) {
    return work.scope ? this.lifecycle.store.withDataContext(work.scope, action) : action();
  }

  private async stopExpiredPeer(work: Work) {
    const stopped = await this.inScope(work, () =>
      this.lifecycle.cancel(work.run.id, "peer_budget"),
    );
    if (stopped.cancellation === "requested") work.controller.abort();
  }

  async stop(timeoutMs = 5000) {
    this.#stopping = true;
    await this.#unsubscribe?.();
    this.#unsubscribe = null;
    await this.#learning.close();
    await this.#routing.close();
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
    for (const work of this.#work.values()) {
      if (!this.lifecycle.store.closed) {
        try {
          await this.inScope(work, () => this.lifecycle.cancel(work.run.id));
        } catch (error) {
          if (!work.scope) throw error;
          await this.lifecycle.store.fenceScopedRun(work.run);
        }
      }
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
      if (token && !this.lifecycle.store.closed) {
        try {
          await this.inScope(work, () => this.lifecycle.settle(work.run.id, token, "unknown"));
        } catch (error) {
          if (!work.scope) throw error;
          await this.lifecycle.store.fenceScopedRun(work.run, "unknown");
        }
      }
    }
    this.#closed = true;
    // The process exits after stop. Late native completion must not touch a closed store.
  }
}
