import { Artifacts } from "../artifacts";
import { Attachments } from "../attachments/service";
import type { ExecutorContext, HarnessExecutor } from "../background";
import { agentInput, DomainError, type Entity } from "../contracts";
import type { NativeSkillMetadata } from "../learning/contracts";
import type { Lifecycle } from "../lifecycle";
import { prepareVisualInputs } from "../multimodal";
import { RunControls } from "../run-controls";
import { observeToolActivity } from "../runs/activity";
import { InteractionJournal } from "../runs/interaction-journal";
import { canonical } from "../store";
import { Workspaces } from "../workspaces/service";
import { detectHarness, type HarnessId, requireAvailable } from "./availability";
import type { HarnessAdapter, HarnessClient, RecoveryObservation, ToolLease } from "./client";
import { Connections } from "./connections";
import type { CredentialContexts, LaunchContext } from "./context";
import {
  capabilities,
  diagnostic,
  HarnessError,
  type NativeEvent,
  NativeSessionMissing,
  nativeEvent,
  type Settings,
  settings,
  terminal,
} from "./contracts";
import { persistInheritedSkills } from "./inherited-skills";
import { runLearningContext, sessionInstructions } from "./instructions";
import { type RecoveryPolicy, RunRecovery } from "./recovery";
import type { HarnessDetector } from "./runtime";
import type { ProductTools } from "./tools";

type Session = {
  client: HarnessClient;
  launch: LaunchContext;
  binding: Entity<"binding">;
  connection_revision: number;
  selected: Settings;
  controller: AbortController;
  agent_revision: number;
  agent_config: string;
  touched_at: number;
  skills?: {
    at: number;
    value: { native_catalog: NativeSkillMetadata[]; native_state: "supported" | "unknown" };
  };
};
function executionConfiguration(agent: Entity<"agent">) {
  const {
    avatar: _avatar,
    avatar_config: _avatarConfig,
    ...execution
  } = agentInput.strip().parse(agent);
  return canonical(execution);
}
async function bounded<T>(operation: Promise<T>, timeoutMs: number, effect = false) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              effect
                ? new HarnessError("NATIVE_UNKNOWN", "unknown")
                : new HarnessError("SERVICE_UNAVAILABLE"),
            ),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export class HarnessBroker {
  readonly connections: Connections;
  readonly #interactionJournal: InteractionJournal;
  readonly #sessions = new Map<string, Session>();
  readonly #opening = new Map<string, Promise<Session>>();
  readonly #connectionOpens = new Map<string, Promise<void>>();
  readonly #controls = new Map<string, Promise<Entity<"control">>>();
  readonly #recovering = new Map<string, Promise<Entity<"run">>>();
  readonly #recoveryControllers = new Set<AbortController>();
  readonly #recovery: RunRecovery;
  readonly #closingWriters = new Map<string, { client: HarnessClient; done?: Promise<void> }>();
  #recoveryError: (runId: string, code: string) => void = () => {};
  #closed = false;
  #warming = false;
  readonly #idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #modelCatalogs = new Map<
    string,
    { at: number; grant: number; version: string | null }
  >();
  constructor(
    readonly lifecycle: Lifecycle,
    readonly credentials: CredentialContexts,
    readonly tools: ProductTools,
    private readonly adapters: Partial<Record<HarnessId, HarnessAdapter>> = {},
    private readonly detect: HarnessDetector = detectHarness,
    private readonly publish: (
      runId: string,
      event: NativeEvent,
      outcome?: string,
    ) => void = () => {},
    private readonly timeouts = { request_ms: 30_000, close_ms: 1000 },
    recoveryPolicy: Partial<RecoveryPolicy> = {},
  ) {
    this.connections = new Connections(lifecycle);
    this.#interactionJournal = new InteractionJournal(lifecycle.store);
    this.#recovery = new RunRecovery(
      lifecycle.store,
      (runId) =>
        this.reconcile(runId).catch(async (error) => {
          if (!this.#closed && (await this.lifecycle.store.get("run", runId)).status === "unknown")
            await this.lifecycle.recordDiagnostic(runId, diagnostic(error));
          throw error;
        }),
      recoveryPolicy,
      async (runId, error) => await this.#recoveryError(runId, diagnostic(error).code),
    );
    for (const [id, adapter] of Object.entries(adapters))
      if (adapter?.harness !== id) throw new Error("Adapter identity mismatch.");
  }
  executors(): Partial<Record<HarnessId, HarnessExecutor>> {
    return Object.fromEntries(
      Object.keys(this.adapters).map((id) => [
        id,
        {
          preparationRevision: () => this.detect.fingerprint?.(id as HarnessId) ?? "",
          prepare: async (threadId: string, agentId: string) => this.openSession(threadId, agentId),
          execute: async (run: Entity<"run">, context: ExecutorContext) =>
            this.execute(run, context),
        },
      ]),
    );
  }
  private selection(agent: Entity<"agent">): Settings {
    if (agent.model_id === null) throw new HarnessError("MODEL_UNAVAILABLE");
    return settings.parse({ model_id: agent.model_id, reasoning: agent.reasoning });
  }
  private async member(threadId: string, agentId: string) {
    const thread = await this.lifecycle.store.get("thread", threadId);
    if (
      !thread.member_agent_ids.includes(agentId) ||
      (thread.purpose === "routing" &&
        thread.group_thread_id &&
        !(
          await this.lifecycle.store.get("thread", thread.group_thread_id)
        ).member_agent_ids.includes(agentId))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return await this.connections.forAgent(agentId, threadId);
  }
  async openSession(threadId: string, agentId: string): Promise<Entity<"binding">> {
    return (await this.session(threadId, agentId)).binding;
  }

  /** Prepare only an idle DM. No prompt, tool lease or model run is admitted. */
  async prewarm(
    threadId: string,
    agentId: string,
  ): Promise<{ state: "ready" | "preparing" | "skipped" }> {
    const thread = await this.lifecycle.store.get("thread", threadId);
    const { agent } = await this.member(threadId, agentId);
    if (thread.type !== "dm" || !agent.model_id || this.#closed) return { state: "skipped" };
    const lane = `${threadId}:${agentId}`;
    const existing = this.#sessions.get(lane);
    if (existing) {
      try {
        await this.check(existing, threadId, agentId);
        this.touch(lane, existing);
        return { state: "ready" };
      } catch (error) {
        // A configuration change needs the ordinary fenced open path below.
        if (!(error instanceof DomainError) || error.code !== "STALE_DISPATCH") throw error;
      }
    }
    if (this.#opening.has(lane)) return { state: "preparing" };
    if (
      this.#warming ||
      (await this.lifecycle.store.list("run")).some((run) =>
        ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
      )
    )
      return { state: "skipped" };
    // Only idle transports can reach this point. Keep the selected DM warm within
    // the existing cap; native bindings and transcripts survive transport eviction.
    if (!existing) await this.retireIdleSessions(2);
    this.#warming = true;
    void this.openSession(threadId, agentId)
      .catch(() => {})
      .finally(() => {
        this.#warming = false;
      });
    return { state: "preparing" };
  }

  private touch(lane: string, session: Session) {
    session.touched_at = Date.now();
    clearTimeout(this.#idleTimers.get(lane));
    const timer = setTimeout(async () => {
      this.#idleTimers.delete(lane);
      if (this.#closed || this.lifecycle.store.closed || this.#sessions.get(lane) !== session)
        return;
      const busy = (
        await this.lifecycle.store.list("run", {
          thread_id: session.binding.thread_id,
          agent_id: session.binding.agent_id,
        })
      ).some(
        (run) =>
          run.thread_id === session.binding.thread_id &&
          run.agent_id === session.binding.agent_id &&
          ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
      );
      if (busy) {
        this.touch(lane, session);
        return;
      }
      this.#sessions.delete(lane);
      session.controller.abort();
      void bounded(session.client.close(), this.timeouts.close_ms).catch(() => {});
    }, 180_000);
    timer.unref?.();
    this.#idleTimers.set(lane, timer);
  }

  private async retireIdleSessions(limit = 3) {
    const busy = new Set(
      (await this.lifecycle.store.list("run"))
        .filter((run) =>
          ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
        .map((run) => `${run.thread_id}:${run.agent_id}`),
    );
    const idle = [...this.#sessions]
      .filter(([lane]) => !busy.has(lane))
      .sort((a, b) => a[1].touched_at - b[1].touched_at);
    while (this.#sessions.size > limit && idle.length) {
      const entry = idle.shift();
      if (!entry) break;
      const [lane, session] = entry;
      this.#sessions.delete(lane);
      clearTimeout(this.#idleTimers.get(lane));
      this.#idleTimers.delete(lane);
      session.controller.abort();
      void bounded(session.client.close(), this.timeouts.close_ms).catch(() => {});
    }
  }

  private async session(threadId: string, agentId: string): Promise<Session> {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const lane = `${threadId}:${agentId}`;
    const existing = this.#sessions.get(lane);
    if (existing) {
      const current = await this.member(threadId, agentId);
      if (
        existing.agent_revision !== current.agent.revision &&
        existing.agent_config === executionConfiguration(current.agent) &&
        existing.connection_revision === current.connection.grant_revision
      ) {
        const binding = await this.lifecycle.store.get("binding", existing.binding.id);
        if (binding.active && binding.revision === existing.binding.revision) {
          existing.binding = await this.lifecycle.store.put(
            {
              ...binding,
              agent_revision: current.agent.revision,
              revision: binding.revision + 1,
              updated_at: new Date().toISOString(),
            },
            binding.revision,
          );
          existing.agent_revision = current.agent.revision;
        }
      }
      if (
        existing.agent_revision === current.agent.revision &&
        (await this.lifecycle.store.get("binding", existing.binding.id)).active
      ) {
        await this.check(existing, threadId, agentId);
        this.touch(lane, existing);
        return existing;
      }
    }
    const pending = this.#opening.get(lane);
    if (pending) return pending;
    const promise = this.serializedOpen(threadId, agentId)
      .then(async (session) => {
        this.#sessions.set(lane, session);
        this.touch(lane, session);
        await this.retireIdleSessions();
        return session;
      })
      .finally(() => this.#opening.delete(lane));
    this.#opening.set(lane, promise);
    return promise;
  }
  private async serializedOpen(threadId: string, agentId: string) {
    const connectionId = (await this.member(threadId, agentId)).connection.id;
    const previous = this.#connectionOpens.get(connectionId);
    let release: () => void = () => {};
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#connectionOpens.set(connectionId, current);
    await previous;
    try {
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      return await this.open(threadId, agentId);
    } finally {
      release();
      if (this.#connectionOpens.get(connectionId) === current)
        this.#connectionOpens.delete(connectionId);
    }
  }
  private async open(threadId: string, agentId: string): Promise<Session> {
    const initial = await this.member(threadId, agentId);
    const lane = `${threadId}:${agentId}`;
    const stale = this.#sessions.get(lane);
    if (stale) {
      this.#sessions.delete(lane);
      stale.controller.abort();
      await bounded(stale.client.close(), this.timeouts.close_ms).catch(() => {});
    }
    const selected = this.selection(initial.agent);
    const adapter = this.adapters[initial.connection.harness];
    if (!adapter) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const availability = requireAvailable(
      await bounded(this.detect(initial.connection.harness), this.timeouts.request_ms),
    );
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const controller = new AbortController();
    const workspaces = new Workspaces(this.lifecycle);
    const workspace = await workspaces.ensure(threadId, agentId);
    const launch: LaunchContext = {
      ...this.credentials.create(initial.connection),
      purpose: (await this.lifecycle.store.get("thread", threadId)).purpose,
      signal: controller.signal,
      workspace: {
        id: workspace.id,
        root: workspace.machine_id
          ? workspaces.controlDirectory(workspace, agentId)
          : workspaces.path(workspace),
        revision: workspace.revision,
        shared: workspace.scope === "group",
      },
      ...(workspace.machine_id
        ? { machine: { id: workspace.machine_id, root: workspaces.path(workspace) } }
        : {}),
    };
    const temporary = await workspaces.temporary(workspace, agentId);
    launch.env = { ...launch.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
    let client: HarnessClient | undefined;
    try {
      const connecting = adapter.connect({
        ...launch,
        executable: availability.executable as string,
        connection_id: initial.connection.id,
        agent_id: agentId,
        thread_id: threadId,
        instructions: await sessionInstructions(
          this.lifecycle,
          initial.agent,
          threadId,
          workspaces,
          workspace.id,
          launch.machine?.root ?? launch.workspace?.root,
        ),
        model_id: selected.model_id,
      });
      void connecting
        .then((late) => {
          if (controller.signal.aborted)
            void bounded(late.close(), this.timeouts.close_ms).catch(() => {});
        })
        .catch(() => {});
      client = await bounded(connecting, this.timeouts.request_ms);
      const observed = await bounded(client.inspect(), this.timeouts.request_ms);
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      let current = (await this.member(threadId, agentId)).connection;
      if (current.grant_revision !== initial.connection.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      if (
        observed.auth_method !== current.authentication.method ||
        observed.billing_source !== current.authentication.billing_source
      )
        throw new HarnessError("BILLING_MISMATCH");
      if (observed.account_id && launch.redactor.text(observed.account_id) !== observed.account_id)
        throw new HarnessError("PROTOCOL_ERROR");
      current = await this.connections.update(current, {
        login: observed.login,
        effective_billing_source:
          observed.login === "authenticated" ? observed.billing_source : "unknown",
        account_id: observed.account_id,
        capabilities: capabilities.parse(observed.capabilities),
      });
      if (current.login !== "authenticated")
        throw new HarnessError(current.login === "rejected" ? "AUTH_REJECTED" : "LOGIN_REQUIRED");
      const beforeDiscovery = current.grant_revision;
      try {
        const cached = this.#modelCatalogs.get(current.id);
        const fresh =
          cached &&
          Date.now() - cached.at < 60_000 &&
          cached.grant === current.grant_revision &&
          cached.version === availability.version &&
          current.models.some((model) => model.id === selected.model_id);
        const models = fresh
          ? current.models
          : await bounded(client.discoverModels(), this.timeouts.request_ms);
        if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
        current = (await this.member(threadId, agentId)).connection;
        if (current.grant_revision !== beforeDiscovery) throw new DomainError("STALE_DISPATCH");
        if (launch.redactor.text(JSON.stringify(models)) !== JSON.stringify(models))
          throw new HarnessError("PROTOCOL_ERROR");
        current = await this.connections.update(current, { discovery: "succeeded", models });
        this.#modelCatalogs.set(current.id, {
          at: fresh ? cached.at : Date.now(),
          grant: current.grant_revision,
          version: availability.version,
        });
      } catch (error) {
        if (!this.#closed) {
          const latest = await this.connections.get(current.id);
          if (latest.state === "active")
            await this.connections.update(latest, { discovery: "failed" });
        }
        throw error;
      }
      const chosen = current.models.find((model) => model.id === selected.model_id);
      if (
        !chosen ||
        (selected.reasoning !== null && !chosen.reasoning.includes(selected.reasoning))
      )
        throw new HarnessError("MODEL_UNAVAILABLE");
      const previous = (
        await this.lifecycle.store.list("binding", {
          thread_id: threadId,
          agent_id: agentId,
          connection_id: current.id,
          workspace_id: workspace.id,
        })
      ).find(
        (binding) =>
          binding.active &&
          binding.thread_id === threadId &&
          binding.agent_id === agentId &&
          binding.connection_id === current.id &&
          binding.harness === current.harness &&
          binding.agent_revision === initial.agent.revision &&
          binding.workspace_id === workspace.id &&
          binding.workspace_revision === workspace.revision,
      );
      if (previous) this.requireCapability(current, "resume");
      let replaceUnused: Entity<"binding"> | undefined;
      let identity: { native_session_id: string };
      try {
        identity = await bounded(
          previous
            ? client.resume({ native_session_id: previous.native_session_id }, { ...selected })
            : client.start({ ...selected }),
          this.timeouts.request_ms,
        );
      } catch (error) {
        // Codex may discard a prewarmed thread before its first turn creates a rollout.
        // An explicit missing-session response can replace only an unused binding;
        // unknown acknowledgements and every prior dispatch keep their original identity.
        if (
          !(error instanceof NativeSessionMissing) ||
          current.harness !== "codex" ||
          !previous ||
          (await this.lifecycle.store.list("run", { binding_id: previous.id })).some(
            (run) => run.binding_id === previous.id,
          )
        )
          throw error;
        replaceUnused = previous;
        identity = await bounded(client.start({ ...selected }), this.timeouts.request_ms);
      }
      if (
        !identity.native_session_id ||
        launch.redactor.text(identity.native_session_id) !== identity.native_session_id
      )
        throw new HarnessError("PROTOCOL_ERROR");
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      const inherited = launch.purpose === "routing" ? undefined : await this.nativeSkills(client);
      const latest = await this.member(threadId, agentId);
      if (
        this.#closed ||
        latest.connection.grant_revision !== current.grant_revision ||
        canonical(this.selection(latest.agent)) !== canonical(selected) ||
        latest.agent.revision !== initial.agent.revision
      )
        throw new DomainError("STALE_DISPATCH");
      await workspaces.get(workspace.id);
      const binding = await this.lifecycle.bind(
        threadId,
        agentId,
        identity.native_session_id,
        workspace,
        replaceUnused,
      );
      if (inherited) await persistInheritedSkills(this.lifecycle, launch, binding.id, inherited);
      const session: Session = {
        client,
        launch,
        binding,
        connection_revision: latest.connection.grant_revision,
        selected,
        controller,
        agent_revision: initial.agent.revision,
        agent_config: executionConfiguration(initial.agent),
        touched_at: Date.now(),
        skills: inherited ? { at: Date.now(), value: inherited } : undefined,
      };
      await this.check(session, threadId, agentId);
      return session;
    } catch (error) {
      controller.abort();
      if (error instanceof HarnessError && error.code === "BILLING_MISMATCH") {
        const latest = await this.connections.get(initial.connection.id);
        if (!this.#closed && latest.state === "active")
          await this.connections.update(latest, {
            login: "rejected",
            effective_billing_source: "unknown",
          });
      }
      if (client) await bounded(client.close(), this.timeouts.close_ms).catch(() => {});
      if (error instanceof HarnessError || error instanceof DomainError) throw error;
      throw new HarnessError("PROTOCOL_ERROR");
    }
  }
  private async check(session: Session, threadId: string, agentId: string) {
    const { agent, connection } = await this.member(threadId, agentId);
    const binding = await this.lifecycle.store.get("binding", session.binding.id);
    if (
      !binding.active ||
      binding.revision !== session.binding.revision ||
      binding.native_session_id !== session.binding.native_session_id ||
      session.binding.connection_id !== connection.id ||
      session.binding.harness !== agent.harness ||
      session.connection_revision !== connection.grant_revision ||
      session.agent_revision !== agent.revision ||
      canonical(session.selected) !== canonical(this.selection(agent))
    )
      throw new DomainError("STALE_DISPATCH");
    if (binding.workspace_id) {
      const workspace = await new Workspaces(this.lifecycle).get(binding.workspace_id);
      if (workspace.revision !== binding.workspace_revision)
        throw new DomainError("STALE_DISPATCH");
    }
    return connection;
  }
  async dispatchSteer(controlId: string): Promise<Entity<"control">> {
    const pending = this.#controls.get(controlId);
    if (pending) return pending;
    const operation = (async () => {
      const control = await this.lifecycle.store.get("control", controlId);
      if (control.state !== "requested") return control;
      const controls = new RunControls(this.lifecycle);
      try {
        await this.steer(
          control.run_id,
          (await this.lifecycle.store.get("message", control.message_id)).text,
          control.native_run_id,
        );
        if (this.#closed)
          return { ...control, state: "unknown" as const, error_code: "NATIVE_UNKNOWN" };
        return await controls.settleSteer(controlId, "accepted");
      } catch (error) {
        if (this.#closed)
          return { ...control, state: "unknown" as const, error_code: "NATIVE_UNKNOWN" };
        const unknown = error instanceof HarnessError && error.outcome === "unknown";
        return await controls.settleSteer(
          controlId,
          unknown ? "unknown" : "rejected",
          error instanceof HarnessError || error instanceof DomainError
            ? error.code
            : "NATIVE_UNKNOWN",
        );
      }
    })().finally(() => this.#controls.delete(controlId));
    this.#controls.set(controlId, operation);
    return operation;
  }
  async steer(runId: string, text: string, expectedNativeRunId?: string) {
    const run = await this.lifecycle.store.get("run", runId);
    if (
      !run.dispatch_token ||
      run.status !== "running" ||
      (expectedNativeRunId && expectedNativeRunId !== run.native_run_id)
    )
      throw new DomainError("CONFLICT");
    await this.lifecycle.authorizeDispatch(runId, run.dispatch_token);
    const session = await this.session(run.thread_id, run.agent_id);
    this.requireCapability(await this.check(session, run.thread_id, run.agent_id), "steer");
    if (!session.client.steer) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    await this.lifecycle.authorizeDispatch(runId, run.dispatch_token);
    try {
      await bounded(
        session.client.steer({ native_session_id: session.binding.native_session_id }, runId, text),
        this.timeouts.request_ms,
      );
    } catch (error) {
      if (error instanceof HarnessError && error.code === "NATIVE_REJECTED") throw error;
      throw new HarnessError("NATIVE_UNKNOWN", "unknown");
    }
  }
  reconcile(runId: string): Promise<Entity<"run">> {
    if (this.#closed) return Promise.reject(new HarnessError("ADAPTER_UNAVAILABLE"));
    const pending = this.#recovering.get(runId);
    if (pending) return pending;
    const operation = this.readReceipt(runId).finally(() => this.#recovering.delete(runId));
    this.#recovering.set(runId, operation);
    return operation;
  }
  async recover() {
    const runs = (await this.lifecycle.store.list("run", { status: "unknown" })).filter(
      (run) => run.status === "unknown",
    );
    // Bounded sequential native reads; never submit a prompt during recovery.
    for (const run of runs) {
      if (this.#closed) return;
      await this.reconcile(run.id).catch(async (error) => {
        if (!this.#closed) await this.lifecycle.recordDiagnostic(run.id, diagnostic(error));
      });
    }
  }
  async startRecovery(report: (runId: string, code: string) => void = () => {}) {
    this.#recoveryError = report;
    await this.#recovery.start();
  }
  private async readReceipt(runId: string) {
    const run = await this.lifecycle.store.get("run", runId);
    if (run.status !== "unknown") return run;
    await this.closeWriter(runId);
    const receipt = await this.inspectReceipt(run);
    const current = await this.lifecycle.store.get("run", runId);
    if (!receipt || current.status !== "unknown") return current;
    if (receipt.status === "unknown") return current;
    if (receipt.status === "cancelled" && current.cancellation !== "requested") return current;
    return await this.lifecycle.reconcile(
      current.id,
      current.revision,
      receipt.status,
      `native-receipt:${current.id}:${receipt.native_run_id}:${receipt.status}`,
      receipt.text,
      receipt.native_run_id,
    );
  }
  private async closeWriter(runId: string, client?: HarnessClient) {
    let writer = this.#closingWriters.get(runId);
    if (!writer && client) {
      writer = { client };
      this.#closingWriters.set(runId, writer);
    }
    if (!writer) return;
    const current = writer;
    current.done ??= Promise.resolve()
      .then(() => current.client.close())
      .then(
        () => {
          if (this.#closingWriters.get(runId) === current) this.#closingWriters.delete(runId);
        },
        (error) => {
          current.done = undefined;
          throw error;
        },
      );
    // A timeout retains the same writer and close promise for the next receipt check.
    // A terminal model receipt alone cannot release a still-live shared writer.
    await bounded(current.done, this.timeouts.close_ms);
  }
  private async inspectReceipt(run: Entity<"run">): Promise<RecoveryObservation | null> {
    const nativeId = run.native_run_id ?? run.native_dispatch_id;
    if (!nativeId || !run.binding_id || !run.agent_snapshot) return null;
    const binding = await this.lifecycle.store.get("binding", run.binding_id);
    const connection = await this.connections.get(binding.connection_id);
    if (connection.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
    const adapter = this.adapters[binding.harness];
    if (!adapter) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const available = requireAvailable(
      await bounded(this.detect(binding.harness), this.timeouts.request_ms),
    );
    const controller = new AbortController();
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    // Owner-authorized receipt inspection never resumes a turn or grants filesystem/tools.
    // It must remain possible after membership/workspace revocation to release unknown work.
    const launch: LaunchContext = {
      ...this.credentials.create(connection),
      signal: controller.signal,
      purpose: "routing",
    };
    this.#recoveryControllers.add(controller);
    let client: HarnessClient | undefined;
    try {
      const connecting = adapter.connect({
        ...launch,
        executable: available.executable as string,
        connection_id: connection.id,
        agent_id: run.agent_id,
        thread_id: run.thread_id,
        model_id: run.agent_snapshot.model_id ?? undefined,
      });
      void connecting
        .then((late) => {
          if (controller.signal.aborted)
            void bounded(late.close(), this.timeouts.close_ms).catch(() => {});
        })
        .catch(() => {});
      client = await bounded(connecting, this.timeouts.request_ms);
      if (!client.reconcile) throw new HarnessError("CAPABILITY_UNSUPPORTED");
      const inspected = await bounded(client.inspect(), this.timeouts.request_ms);
      if (
        inspected.login !== "authenticated" ||
        inspected.account_id !== connection.account_id ||
        inspected.auth_method !== connection.authentication.method ||
        inspected.billing_source !== connection.authentication.billing_source
      )
        throw new HarnessError("BILLING_MISMATCH");
      const receipt = await bounded(
        client.reconcile({ native_session_id: binding.native_session_id }, nativeId),
        this.timeouts.request_ms,
      );
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      const latest = await this.connections.get(connection.id);
      if (latest.state !== "active" || latest.grant_revision !== connection.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      if (
        receipt.native_session_id !== binding.native_session_id ||
        receipt.native_run_id !== nativeId
      )
        return null;
      return { ...receipt, text: launch.redactor.text(receipt.text) };
    } finally {
      controller.abort();
      this.#recoveryControllers.delete(controller);
      if (client) await bounded(client.close(), this.timeouts.close_ms).catch(() => {});
    }
  }
  private async interactionSession(runId: string) {
    const run = await this.lifecycle.store.get("run", runId);
    if (!run.dispatch_token || run.status !== "running" || run.cancellation !== "none")
      throw new DomainError("CONFLICT");
    await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const session = await this.session(run.thread_id, run.agent_id);
    this.requireCapability(
      await this.check(session, run.thread_id, run.agent_id),
      "permission_requests",
    );
    await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    return session;
  }
  async interactions(runId: string) {
    const session = await this.interactionSession(runId);
    if (!session.client.interactions) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const snapshot = await bounded(
      Promise.resolve(session.client.interactions(runId)),
      this.timeouts.request_ms,
    );
    if ((await this.interactionSession(runId)) !== session) throw new DomainError("STALE_DISPATCH");
    return await this.#interactionJournal.observe(runId, snapshot, (text) =>
      session.launch.redactor.text(text),
    );
  }
  async respond(runId: string, answer: unknown) {
    const replay = await this.#interactionJournal.replay(runId, answer);
    if (replay) return replay;
    const session = await this.interactionSession(runId);
    if (!session.client.respond || !session.client.interactions)
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    // Reconcile native pending state, then recheck application grants after that asynchronous read.
    await this.interactions(runId);
    if ((await this.interactionSession(runId)) !== session) throw new DomainError("STALE_DISPATCH");
    const attempt = await this.#interactionJournal.begin(runId, answer, (text) =>
      session.launch.redactor.text(text),
    );
    if (!attempt) return { status: "submitted" as const };
    const settle = async (
      state: "submitted" | "not_dispatched" | "unknown",
      error: HarnessError | null = null,
    ) =>
      await this.#interactionJournal.settle(
        runId,
        attempt.record_id,
        attempt.attempt_id,
        state,
        error ? diagnostic(error) : null,
      );
    try {
      const observed = Promise.resolve(session.client.respond(runId, answer)).then(
        async () => {
          await settle("submitted");
        },
        async (error: unknown) => {
          const failure =
            error instanceof HarnessError ? error : new HarnessError("NATIVE_UNKNOWN", "unknown");
          await settle(
            failure.outcome === "not_dispatched" ? "not_dispatched" : "unknown",
            failure,
          );
          throw failure;
        },
      );
      // A later acknowledgement may settle this exact attempt, never create another dispatch.
      await bounded(observed, this.timeouts.request_ms, true);
    } catch (error) {
      const failure =
        error instanceof HarnessError ? error : new HarnessError("NATIVE_UNKNOWN", "unknown");
      await settle(failure.outcome === "not_dispatched" ? "not_dispatched" : "unknown", failure);
      throw failure;
    }
    // A native acknowledgement is not proof that the approved action completed.
    return { status: "submitted" as const };
  }
  private async nativeSkills(client: HarnessClient) {
    if (!client.skills) return { native_catalog: [], native_state: "unknown" as const };
    try {
      return {
        native_catalog: await bounded(client.skills(), Math.min(2000, this.timeouts.request_ms)),
        native_state: "supported" as const,
      };
    } catch {
      return { native_catalog: [], native_state: "unknown" as const };
    }
  }
  private async sessionSkills(session: Session) {
    if (session.skills && Date.now() - session.skills.at < 30_000) return undefined;
    const value = await this.nativeSkills(session.client);
    session.skills = { at: Date.now(), value };
    return value;
  }
  private requireCapability(
    connection: Entity<"connection">,
    capability: keyof Entity<"connection">["capabilities"],
  ) {
    const state = connection.capabilities[capability];
    if (state !== "supported")
      throw new HarnessError(state === "unknown" ? "CAPABILITY_UNKNOWN" : "CAPABILITY_UNSUPPORTED");
  }
  private async appendIfAuthorized(runId: string, text: string, state: "complete" | "partial") {
    try {
      await this.lifecycle.appendAnswer(runId, text, state);
      return true;
    } catch (error) {
      if (
        error instanceof DomainError &&
        ["STALE_DISPATCH", "SCOPE_DENIED", "CONFLICT"].includes(error.code)
      )
        return false;
      throw error;
    }
  }

  async execute(
    run: Entity<"run">,
    context: ExecutorContext,
  ): Promise<Entity<"run">["outcome"] & ("succeeded" | "failed" | "cancelled" | "unknown")> {
    let lease: ToolLease | undefined;
    let removeAbort = () => {};
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    let dispatched = false;
    let accepted: string | null = null;
    let finished = false;
    let recoveredNative = false;
    let removeWatch = () => {};
    let outcome: "succeeded" | "failed" | "cancelled" | "unknown" = "unknown";
    let text = "";
    let lastPublishedAt = 0;
    let nativeEvents = Promise.resolve();
    let nativeEventError: unknown;
    let nativeEventPending = 0;
    try {
      const session = await this.session(run.thread_id, run.agent_id);
      const connection = await this.check(session, run.thread_id, run.agent_id);
      this.requireCapability(connection, "product_tools");
      if (run.binding_id !== session.binding.id || !run.dispatch_token)
        throw new DomainError("STALE_DISPATCH");
      this.requireCapability(connection, "settings");
      const observed = await bounded(session.client.inspect(), this.timeouts.request_ms);
      if (
        observed.auth_method !== connection.authentication.method ||
        observed.billing_source !== connection.authentication.billing_source
      )
        throw new HarnessError("BILLING_MISMATCH");
      if (
        observed.login !== connection.login ||
        observed.account_id !== connection.account_id ||
        canonical(observed.capabilities) !== canonical(connection.capabilities)
      )
        throw new DomainError("STALE_DISPATCH");
      await bounded(
        session.client.settings(
          { native_session_id: session.binding.native_session_id },
          { ...session.selected },
        ),
        this.timeouts.request_ms,
      );
      await this.check(session, run.thread_id, run.agent_id);
      await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      if (run.workspace_id) await new Artifacts(this.lifecycle).verifyInputs(run);
      const attachments = new Attachments(this.lifecycle);
      const authorizeAttachments = async () => {
        await this.check(session, run.thread_id, run.agent_id);
        await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
      };
      const attachmentContext = await attachments.context(run, authorizeAttachments);
      const visual = await prepareVisualInputs(
        this.lifecycle,
        run,
        connection,
        session.selected.model_id,
      );
      await this.check(session, run.thread_id, run.agent_id);
      await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      if (visual.receipts.length)
        await this.lifecycle.observe(run.id, run.dispatch_token, {
          visual_inputs: visual.receipts,
        });
      const inherited =
        session.launch.purpose === "routing" ? undefined : await this.sessionSkills(session);
      await this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      await this.check(session, run.thread_id, run.agent_id);
      if (inherited)
        await persistInheritedSkills(this.lifecycle, session.launch, session.binding.id, inherited);
      lease = await this.tools.issue(run, async () => {
        await nativeEvents;
        if (nativeEventError) throw nativeEventError;
      });
      session.launch.redactor.add(lease.token);
      let stopped: (result: unknown) => void = () => {};
      const stopResult = new Promise<unknown>((resolve) => {
        stopped = resolve;
      });
      const abort = () => {
        stopTimer = setTimeout(async () => {
          if (!this.#closed)
            await this.lifecycle.recordDiagnostic(
              run.id,
              diagnostic(new HarnessError("NATIVE_UNKNOWN", "unknown")),
            );
          stopped({
            status: "unknown",
            native_session_id: session.binding.native_session_id,
            native_run_id: accepted,
          });
          session.controller.abort();
          void session.client.close().catch(() => {});
        }, this.timeouts.request_ms);
        session.client
          .stop({ native_session_id: session.binding.native_session_id }, run.id)
          .then((receipt) => {
            if (receipt.confirmed)
              stopped({
                status: "cancelled",
                native_session_id: session.binding.native_session_id,
                native_run_id: accepted,
              });
          })
          .catch(() => {});
      };
      context.signal.addEventListener("abort", abort, { once: true });
      removeAbort = () => context.signal.removeEventListener("abort", abort);
      if (context.signal.aborted) {
        outcome = "cancelled";
        return outcome;
      }
      let recovered: (receipt: RecoveryObservation) => void = () => {};
      const recoveryResult = new Promise<RecoveryObservation>((resolve) => {
        recovered = resolve;
      });
      const watch = this.#recovery.watch(run.id, async () => {
        if (finished || this.#closed || nativeEventPending > 0) return;
        const current = await this.lifecycle.store.get("run", run.id);
        if (!["running", "cancel_requested"].includes(current.status)) return;
        const receipt = await this.inspectReceipt(current);
        if (finished || this.#closed || !receipt || receipt.status === "unknown") return;
        const latest = await this.lifecycle.store.get("run", run.id);
        if (
          latest.dispatch_token !== run.dispatch_token ||
          !["running", "cancel_requested"].includes(latest.status) ||
          (receipt.status === "cancelled" && latest.cancellation !== "requested")
        )
          return;
        // Resolve through execute's normal publication/transport-close/settlement path.
        // A receipt never starts or resumes a model turn, nor cancels a long valid run.
        recoveredNative = true;
        finished = true;
        text = receipt.text;
        recovered(receipt);
      });
      removeWatch = watch.dispose;
      dispatched = true;
      const observation = await Promise.race([
        stopResult,
        recoveryResult,
        session.client.prompt({
          identity: { native_session_id: session.binding.native_session_id },
          run_id: run.id,
          images: visual.images,
          text: (await this.lifecycle.store.get("message", run.input_message_id)).text,
          learning_context: [await runLearningContext(this.lifecycle, run), attachmentContext.text]
            .filter(Boolean)
            .join("\n\n"),
          settings: { ...session.selected },
          tools: lease,
          signal: context.signal,
          onEvent: (raw) => {
            watch.observe();
            nativeEventPending++;
            nativeEvents = nativeEvents
              .then(async () => {
                if (finished || this.#closed) return;
                const event = nativeEvent.parse(raw);
                watch.observe();
                if (event.type === "accepted") {
                  if (
                    event.native_session_id !== session.binding.native_session_id ||
                    (accepted !== null && accepted !== event.native_run_id)
                  )
                    throw new HarnessError("PROTOCOL_ERROR", "unknown");
                  if (session.launch.redactor.text(event.native_run_id) !== event.native_run_id)
                    throw new HarnessError("PROTOCOL_ERROR", "unknown");
                  accepted = event.native_run_id;
                  await context.started(event.native_run_id);
                  await attachments.record(
                    run.id,
                    attachmentContext.observations,
                    authorizeAttachments,
                  );
                }
                if (event.type === "text") {
                  text += event.text;
                  if (text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
                } else if (event.type === "text_snapshot") text = event.text;
                else if (event.type === "dispatch") {
                  if (session.launch.redactor.text(event.native_run_id) !== event.native_run_id)
                    throw new HarnessError("PROTOCOL_ERROR", "unknown");
                  await this.lifecycle.observe(run.id, run.dispatch_token as string, {
                    native_dispatch_id: event.native_run_id,
                  });
                } else if (event.type === "activity") {
                  const current = await this.lifecycle.store.get("run", run.id);
                  await this.lifecycle.observe(run.id, run.dispatch_token as string, {
                    activity: current.active_tools.length ? "tool_running" : event.activity,
                  });
                  if (event.activity === "generating") await context.controlReady?.();
                } else if (event.type === "tool_activity") {
                  await observeToolActivity(
                    this.lifecycle,
                    run.id,
                    run.dispatch_token as string,
                    {
                      call_id: event.call_id,
                      kind: event.kind,
                      target_agent_id: null,
                    },
                    event.state,
                  );
                } else if (event.type === "web_source") {
                  const url = new URL(event.url);
                  if (
                    ["https:", "http:"].includes(url.protocol) &&
                    !url.username &&
                    !url.password &&
                    !url.search &&
                    !/token|secret|credential|(?:^|[&#])(?:code|key)=/i.test(url.hash) &&
                    session.launch.redactor.text(event.url) === event.url
                  ) {
                    const current = await this.lifecycle.store.get("run", run.id);
                    const source = {
                      url: event.url,
                      title: session.launch.redactor.text(event.title),
                      operation: event.operation,
                    };
                    await this.lifecycle.observe(run.id, run.dispatch_token as string, {
                      sources: [
                        ...current.sources.filter((s) => s.url !== source.url),
                        source,
                      ].slice(-100),
                    });
                  }
                } else if (event.type === "native_tool") {
                  const current = await this.lifecycle.store.get("run", run.id);
                  const tools = current.native_tools.filter(
                    (item) => item.item_id !== event.item_id,
                  );
                  tools.push({
                    item_id: event.item_id,
                    name: event.name,
                    command: event.command,
                    state: event.state,
                    exit_code: event.exit_code,
                  });
                  await this.lifecycle.observe(run.id, run.dispatch_token as string, {
                    native_tools: tools.slice(-200),
                  });
                } else if (event.type === "failure") {
                  await this.lifecycle.observe(run.id, run.dispatch_token as string, {
                    diagnostic: { ...diagnostic(new HarnessError(event.code)), outcome: "failed" },
                  });
                  if (event.code === "LOGIN_REQUIRED" || event.code === "AUTH_REJECTED") {
                    const current = await this.connections.get(connection.id);
                    if (current.state === "active")
                      await this.connections.update(current, {
                        login: event.code === "LOGIN_REQUIRED" ? "required" : "rejected",
                      });
                  }
                } else await this.publish(run.id, event);
                if (
                  (event.type === "text" || event.type === "text_snapshot") &&
                  accepted &&
                  Date.now() - lastPublishedAt >= 100
                ) {
                  const safe = session.launch.redactor.stream(text);
                  if (safe) {
                    await this.appendIfAuthorized(run.id, safe, "partial");
                    lastPublishedAt = Date.now();
                  }
                }
              })
              .catch((error) => {
                nativeEventError ??= error;
              })
              .finally(() => {
                nativeEventPending--;
                watch.observe();
              });
            return nativeEvents;
          },
        }),
      ]);
      await nativeEvents;
      if (nativeEventError) throw nativeEventError;
      const result = terminal.parse(observation);
      if (
        result.native_session_id !== session.binding.native_session_id ||
        result.native_run_id !== accepted ||
        (result.status === "succeeded" && !accepted) ||
        (result.status === "cancelled" && !context.signal.aborted)
      )
        throw new HarnessError("PROTOCOL_ERROR", "unknown");
      outcome = result.status;
    } catch (error) {
      await nativeEvents;
      outcome = dispatched
        ? !accepted && error instanceof HarnessError && error.outcome === "not_dispatched"
          ? "failed"
          : "unknown"
        : "failed";
      if (!this.#closed && run.dispatch_token)
        await this.lifecycle.observe(run.id, run.dispatch_token, { diagnostic: diagnostic(error) });
    } finally {
      finished = true;
      removeWatch();
      removeAbort();
      clearTimeout(stopTimer);
      lease?.revoke();
      const groupWorkspace = run.workspace_id
        ? (await this.lifecycle.store.get("workspace", run.workspace_id)).scope === "group"
        : false;
      if (groupWorkspace || recoveredNative) {
        const session = this.#sessions.get(`${run.thread_id}:${run.agent_id}`);
        if (session) {
          // End the writer process before the application's durable workspace lease can settle.
          try {
            await this.closeWriter(run.id, session.client);
          } catch {
            outcome = "unknown";
          }
        }
      }
      if (!this.#closed && (text || (await this.lifecycle.store.answer(run.id)))) {
        const session = this.#sessions.get(`${run.thread_id}:${run.agent_id}`);
        if (session && accepted) {
          const safe = session.launch.redactor.text(text);
          const published = await this.appendIfAuthorized(
            run.id,
            safe,
            outcome === "succeeded" ? "complete" : "partial",
          );
          if (
            published &&
            (await this.lifecycle.store.get("run", run.id)).publication === "immediate"
          )
            await this.publish(run.id, { type: "text", text: safe }, outcome);
        }
      }
      if (!this.#closed && dispatched) {
        const connection = await this.connections.get(
          lease?.scope.connection_id ??
            (await this.lifecycle.store.get("agent", run.agent_id)).connection_id,
        );
        if (connection.state === "active")
          await this.connections.update(connection, {
            inference: outcome,
          });
      }
      if (
        !this.#closed &&
        (groupWorkspace ||
          recoveredNative ||
          (await this.lifecycle.store.get("thread", run.thread_id)).purpose === "routing")
      ) {
        const key = `${run.thread_id}:${run.agent_id}`;
        const session = this.#sessions.get(key);
        if (session) {
          this.#sessions.delete(key);
          clearTimeout(this.#idleTimers.get(key));
          this.#idleTimers.delete(key);
          session.controller.abort();
          await this.closeWriter(run.id, session.client).catch(() => {});
        }
      }
    }
    return outcome;
  }
  async close() {
    if (this.#closed) return;
    this.#closed = true;
    this.#recovery.close();
    if (!this.lifecycle.store.closed) {
      await this.#interactionJournal.recover();
      for (const control of await this.lifecycle.store.list("control"))
        if (control.state === "requested")
          await new RunControls(this.lifecycle).settleSteer(
            control.id,
            "unknown",
            "NATIVE_UNKNOWN",
          );
    }
    for (const timer of this.#idleTimers.values()) clearTimeout(timer);
    this.#idleTimers.clear();
    for (const controller of this.#recoveryControllers) controller.abort();
    this.tools.revokeAll();
    for (const session of this.#sessions.values()) session.controller.abort();
    await bounded(Promise.allSettled([...this.#opening.values()]), this.timeouts.close_ms).catch(
      () => {},
    );
    await Promise.allSettled(
      [
        ...[...this.#sessions.values()].map((session) => session.client),
        ...[...this.#closingWriters.values()].map((writer) => writer.client),
      ].map(async (client) => bounded(client.close(), this.timeouts.close_ms)),
    );
    this.#sessions.clear();
    this.#closingWriters.clear();
  }
}
