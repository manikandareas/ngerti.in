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
import type { HarnessAdapter, HarnessClient, ToolLease } from "./client";
import { Connections } from "./connections";
import type { CredentialContexts, LaunchContext } from "./context";
import {
  capabilities,
  diagnostic,
  HarnessError,
  type NativeEvent,
  nativeEvent,
  type Settings,
  settings,
  terminal,
} from "./contracts";
import { persistInheritedSkills } from "./inherited-skills";
import { runLearningContext, sessionInstructions } from "./instructions";
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
  ) {
    this.connections = new Connections(lifecycle);
    this.#interactionJournal = new InteractionJournal(lifecycle.store);
    for (const [id, adapter] of Object.entries(adapters))
      if (adapter?.harness !== id) throw new Error("Adapter identity mismatch.");
  }
  executors(): Partial<Record<HarnessId, HarnessExecutor>> {
    return Object.fromEntries(
      Object.keys(this.adapters).map((id) => [
        id,
        {
          preparationRevision: () => this.detect.fingerprint?.(id as HarnessId) ?? "",
          prepare: (threadId: string, agentId: string) => this.openSession(threadId, agentId),
          execute: (run: Entity<"run">, context: ExecutorContext) => this.execute(run, context),
        },
      ]),
    );
  }
  private selection(agent: Entity<"agent">): Settings {
    if (agent.model_id === null) throw new HarnessError("MODEL_UNAVAILABLE");
    return settings.parse({ model_id: agent.model_id, reasoning: agent.reasoning });
  }
  private member(threadId: string, agentId: string) {
    const thread = this.lifecycle.store.get("thread", threadId);
    if (
      !thread.member_agent_ids.includes(agentId) ||
      (thread.purpose === "routing" &&
        thread.group_thread_id &&
        !this.lifecycle.store
          .get("thread", thread.group_thread_id)
          .member_agent_ids.includes(agentId))
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return this.connections.forAgent(agentId, threadId);
  }
  async openSession(threadId: string, agentId: string): Promise<Entity<"binding">> {
    return (await this.session(threadId, agentId)).binding;
  }

  /** Prepare only an idle DM. No prompt, tool lease or model run is admitted. */
  prewarm(threadId: string, agentId: string): { state: "ready" | "preparing" | "skipped" } {
    const thread = this.lifecycle.store.get("thread", threadId);
    const { agent } = this.member(threadId, agentId);
    if (thread.type !== "dm" || !agent.model_id || this.#closed) return { state: "skipped" };
    const lane = `${threadId}:${agentId}`;
    const existing = this.#sessions.get(lane);
    if (existing) {
      try {
        this.check(existing, threadId, agentId);
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
      this.lifecycle.store
        .list("run")
        .some((run) =>
          ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
        )
    )
      return { state: "skipped" };
    // Only idle transports can reach this point. Keep the selected DM warm within
    // the existing cap; native bindings and transcripts survive transport eviction.
    if (!existing) this.retireIdleSessions(2);
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
    const timer = setTimeout(() => {
      this.#idleTimers.delete(lane);
      if (this.#closed || this.lifecycle.store.closed || this.#sessions.get(lane) !== session)
        return;
      const busy = this.lifecycle.store
        .list("run")
        .some(
          (run) =>
            run.thread_id === session.binding.thread_id &&
            run.agent_id === session.binding.agent_id &&
            ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(
              run.status,
            ),
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

  private retireIdleSessions(limit = 3) {
    const busy = new Set(
      this.lifecycle.store
        .list("run")
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
      const current = this.member(threadId, agentId);
      if (
        existing.agent_revision !== current.agent.revision &&
        existing.agent_config === executionConfiguration(current.agent) &&
        existing.connection_revision === current.connection.grant_revision
      ) {
        const binding = this.lifecycle.store.get("binding", existing.binding.id);
        if (binding.active && binding.revision === existing.binding.revision) {
          existing.binding = this.lifecycle.store.put(
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
        this.lifecycle.store.get("binding", existing.binding.id).active
      ) {
        this.check(existing, threadId, agentId);
        this.touch(lane, existing);
        return existing;
      }
    }
    const pending = this.#opening.get(lane);
    if (pending) return pending;
    const promise = this.serializedOpen(threadId, agentId)
      .then((session) => {
        this.#sessions.set(lane, session);
        this.touch(lane, session);
        this.retireIdleSessions();
        return session;
      })
      .finally(() => this.#opening.delete(lane));
    this.#opening.set(lane, promise);
    return promise;
  }
  private async serializedOpen(threadId: string, agentId: string) {
    const connectionId = this.member(threadId, agentId).connection.id;
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
    const initial = this.member(threadId, agentId);
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
    const workspace = workspaces.ensure(threadId, agentId);
    const launch: LaunchContext = {
      ...this.credentials.create(initial.connection),
      purpose: this.lifecycle.store.get("thread", threadId).purpose,
      signal: controller.signal,
      workspace: {
        id: workspace.id,
        root: workspaces.path(workspace),
        revision: workspace.revision,
        shared: workspace.scope === "group",
      },
    };
    const temporary = workspaces.temporary(workspace, agentId);
    launch.env = { ...launch.env, TMPDIR: temporary, TMP: temporary, TEMP: temporary };
    let client: HarnessClient | undefined;
    try {
      const connecting = adapter.connect({
        ...launch,
        executable: availability.executable as string,
        connection_id: initial.connection.id,
        agent_id: agentId,
        thread_id: threadId,
        instructions: sessionInstructions(
          this.lifecycle,
          initial.agent,
          threadId,
          workspaces,
          workspace.id,
          launch.workspace?.root,
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
      let current = this.member(threadId, agentId).connection;
      if (current.grant_revision !== initial.connection.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      if (
        observed.auth_method !== current.authentication.method ||
        observed.billing_source !== current.authentication.billing_source
      )
        throw new HarnessError("BILLING_MISMATCH");
      if (observed.account_id && launch.redactor.text(observed.account_id) !== observed.account_id)
        throw new HarnessError("PROTOCOL_ERROR");
      current = this.connections.update(current, {
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
        current = this.member(threadId, agentId).connection;
        if (current.grant_revision !== beforeDiscovery) throw new DomainError("STALE_DISPATCH");
        if (launch.redactor.text(JSON.stringify(models)) !== JSON.stringify(models))
          throw new HarnessError("PROTOCOL_ERROR");
        current = this.connections.update(current, { discovery: "succeeded", models });
        this.#modelCatalogs.set(current.id, {
          at: fresh ? cached.at : Date.now(),
          grant: current.grant_revision,
          version: availability.version,
        });
      } catch (error) {
        if (!this.#closed) {
          const latest = this.connections.get(current.id);
          if (latest.state === "active") this.connections.update(latest, { discovery: "failed" });
        }
        throw error;
      }
      const chosen = current.models.find((model) => model.id === selected.model_id);
      if (
        !chosen ||
        (selected.reasoning !== null && !chosen.reasoning.includes(selected.reasoning))
      )
        throw new HarnessError("MODEL_UNAVAILABLE");
      const previous = this.lifecycle.store
        .list("binding")
        .find(
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
      const identity = await bounded(
        previous
          ? client.resume({ native_session_id: previous.native_session_id }, { ...selected })
          : client.start({ ...selected }),
        this.timeouts.request_ms,
      );
      if (
        !identity.native_session_id ||
        launch.redactor.text(identity.native_session_id) !== identity.native_session_id
      )
        throw new HarnessError("PROTOCOL_ERROR");
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      const inherited = launch.purpose === "routing" ? undefined : await this.nativeSkills(client);
      const latest = this.member(threadId, agentId);
      if (
        this.#closed ||
        latest.connection.grant_revision !== current.grant_revision ||
        canonical(this.selection(latest.agent)) !== canonical(selected) ||
        latest.agent.revision !== initial.agent.revision
      )
        throw new DomainError("STALE_DISPATCH");
      workspaces.get(workspace.id);
      const binding = this.lifecycle.bind(threadId, agentId, identity.native_session_id, workspace);
      if (inherited) persistInheritedSkills(this.lifecycle, launch, binding.id, inherited);
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
      this.check(session, threadId, agentId);
      return session;
    } catch (error) {
      controller.abort();
      if (error instanceof HarnessError && error.code === "BILLING_MISMATCH") {
        const latest = this.connections.get(initial.connection.id);
        if (!this.#closed && latest.state === "active")
          this.connections.update(latest, {
            login: "rejected",
            effective_billing_source: "unknown",
          });
      }
      if (client) await bounded(client.close(), this.timeouts.close_ms).catch(() => {});
      if (error instanceof HarnessError || error instanceof DomainError) throw error;
      throw new HarnessError("PROTOCOL_ERROR");
    }
  }
  private check(session: Session, threadId: string, agentId: string) {
    const { agent, connection } = this.member(threadId, agentId);
    const binding = this.lifecycle.store.get("binding", session.binding.id);
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
      const workspace = new Workspaces(this.lifecycle).get(binding.workspace_id);
      if (workspace.revision !== binding.workspace_revision)
        throw new DomainError("STALE_DISPATCH");
    }
    return connection;
  }
  dispatchSteer(controlId: string): Promise<Entity<"control">> {
    const pending = this.#controls.get(controlId);
    if (pending) return pending;
    const control = this.lifecycle.store.get("control", controlId);
    if (control.state !== "requested") return Promise.resolve(control);
    const controls = new RunControls(this.lifecycle);
    const operation = (async () => {
      try {
        await this.steer(
          control.run_id,
          this.lifecycle.store.get("message", control.message_id).text,
          control.native_run_id,
        );
        if (this.#closed)
          return { ...control, state: "unknown" as const, error_code: "NATIVE_UNKNOWN" };
        return controls.settleSteer(controlId, "accepted");
      } catch (error) {
        if (this.#closed)
          return { ...control, state: "unknown" as const, error_code: "NATIVE_UNKNOWN" };
        const unknown = error instanceof HarnessError && error.outcome === "unknown";
        return controls.settleSteer(
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
    const run = this.lifecycle.store.get("run", runId);
    if (
      !run.dispatch_token ||
      run.status !== "running" ||
      (expectedNativeRunId && expectedNativeRunId !== run.native_run_id)
    )
      throw new DomainError("CONFLICT");
    this.lifecycle.authorizeDispatch(runId, run.dispatch_token);
    const session = await this.session(run.thread_id, run.agent_id);
    this.requireCapability(this.check(session, run.thread_id, run.agent_id), "steer");
    if (!session.client.steer) throw new HarnessError("CAPABILITY_UNSUPPORTED");
    this.lifecycle.authorizeDispatch(runId, run.dispatch_token);
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
    const runs = this.lifecycle.store.list("run").filter((run) => run.status === "unknown");
    // Bounded sequential native reads; never submit a prompt during recovery.
    for (const run of runs) {
      if (this.#closed) return;
      await this.reconcile(run.id).catch((error) => {
        if (!this.#closed) this.lifecycle.recordDiagnostic(run.id, diagnostic(error));
      });
    }
  }
  private async readReceipt(runId: string) {
    const run = this.lifecycle.store.get("run", runId);
    if (run.status !== "unknown") return run;
    const nativeId = run.native_run_id ?? run.native_dispatch_id;
    if (!nativeId || !run.binding_id || !run.agent_snapshot) return run;
    const binding = this.lifecycle.store.get("binding", run.binding_id);
    const connection = this.connections.get(binding.connection_id);
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
      const latest = this.connections.get(connection.id);
      if (latest.state !== "active" || latest.grant_revision !== connection.grant_revision)
        throw new DomainError("STALE_DISPATCH");
      if (
        receipt.native_session_id !== binding.native_session_id ||
        receipt.native_run_id !== nativeId ||
        receipt.status === "unknown"
      )
        return this.lifecycle.store.get("run", runId);
      if (receipt.status === "cancelled" && run.cancellation !== "requested") return run;
      return this.lifecycle.reconcile(
        run.id,
        run.revision,
        receipt.status,
        `native-receipt:${run.id}:${nativeId}:${receipt.status}`,
        launch.redactor.text(receipt.text),
        nativeId,
      );
    } finally {
      controller.abort();
      this.#recoveryControllers.delete(controller);
      if (client) await bounded(client.close(), this.timeouts.close_ms).catch(() => {});
    }
  }
  private async interactionSession(runId: string) {
    const run = this.lifecycle.store.get("run", runId);
    if (!run.dispatch_token || run.status !== "running" || run.cancellation !== "none")
      throw new DomainError("CONFLICT");
    this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
    const session = await this.session(run.thread_id, run.agent_id);
    this.requireCapability(this.check(session, run.thread_id, run.agent_id), "permission_requests");
    this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
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
    return this.#interactionJournal.observe(runId, snapshot, (text) =>
      session.launch.redactor.text(text),
    );
  }
  async respond(runId: string, answer: unknown) {
    const replay = this.#interactionJournal.replay(runId, answer);
    if (replay) return replay;
    const session = await this.interactionSession(runId);
    if (!session.client.respond || !session.client.interactions)
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    // Reconcile native pending state, then recheck application grants after that asynchronous read.
    await this.interactions(runId);
    if ((await this.interactionSession(runId)) !== session) throw new DomainError("STALE_DISPATCH");
    const attempt = this.#interactionJournal.begin(runId, answer, (text) =>
      session.launch.redactor.text(text),
    );
    if (!attempt) return { status: "submitted" as const };
    const settle = (
      state: "submitted" | "not_dispatched" | "unknown",
      error: HarnessError | null = null,
    ) =>
      this.#interactionJournal.settle(
        runId,
        attempt.record_id,
        attempt.attempt_id,
        state,
        error ? diagnostic(error) : null,
      );
    try {
      const observed = Promise.resolve(session.client.respond(runId, answer)).then(
        () => {
          settle("submitted");
        },
        (error: unknown) => {
          const failure =
            error instanceof HarnessError ? error : new HarnessError("NATIVE_UNKNOWN", "unknown");
          settle(failure.outcome === "not_dispatched" ? "not_dispatched" : "unknown", failure);
          throw failure;
        },
      );
      // A later acknowledgement may settle this exact attempt, never create another dispatch.
      await bounded(observed, this.timeouts.request_ms, true);
    } catch (error) {
      const failure =
        error instanceof HarnessError ? error : new HarnessError("NATIVE_UNKNOWN", "unknown");
      settle(failure.outcome === "not_dispatched" ? "not_dispatched" : "unknown", failure);
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
  private appendIfAuthorized(runId: string, text: string, state: "complete" | "partial") {
    try {
      this.lifecycle.appendAnswer(runId, text, state);
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
    let outcome: "succeeded" | "failed" | "cancelled" | "unknown" = "unknown";
    let text = "";
    let lastPublishedAt = 0;
    try {
      const session = await this.session(run.thread_id, run.agent_id);
      const connection = this.check(session, run.thread_id, run.agent_id);
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
      this.check(session, run.thread_id, run.agent_id);
      this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      if (run.workspace_id) new Artifacts(this.lifecycle).verifyInputs(run);
      const attachments = new Attachments(this.lifecycle);
      const authorizeAttachments = () => {
        this.check(session, run.thread_id, run.agent_id);
        this.lifecycle.authorizeDispatch(run.id, run.dispatch_token as string);
      };
      const attachmentContext = await attachments.context(run, authorizeAttachments);
      const visual = await prepareVisualInputs(
        this.lifecycle,
        run,
        connection,
        session.selected.model_id,
      );
      this.check(session, run.thread_id, run.agent_id);
      this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      if (visual.receipts.length)
        this.lifecycle.observe(run.id, run.dispatch_token, { visual_inputs: visual.receipts });
      const inherited =
        session.launch.purpose === "routing" ? undefined : await this.sessionSkills(session);
      this.lifecycle.authorizeDispatch(run.id, run.dispatch_token);
      this.check(session, run.thread_id, run.agent_id);
      if (inherited)
        persistInheritedSkills(this.lifecycle, session.launch, session.binding.id, inherited);
      lease = this.tools.issue(run);
      session.launch.redactor.add(lease.token);
      let stopped: (result: unknown) => void = () => {};
      const stopResult = new Promise<unknown>((resolve) => {
        stopped = resolve;
      });
      const abort = () => {
        stopTimer = setTimeout(() => {
          if (!this.#closed)
            this.lifecycle.recordDiagnostic(
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
      dispatched = true;
      const observation = await Promise.race([
        stopResult,
        session.client.prompt({
          identity: { native_session_id: session.binding.native_session_id },
          run_id: run.id,
          images: visual.images,
          text: this.lifecycle.store.get("message", run.input_message_id).text,
          learning_context: [runLearningContext(this.lifecycle, run), attachmentContext.text]
            .filter(Boolean)
            .join("\n\n"),
          settings: { ...session.selected },
          tools: lease,
          signal: context.signal,
          onEvent: (raw) => {
            if (finished || this.#closed) return;
            const event = nativeEvent.parse(raw);
            if (event.type === "accepted") {
              if (
                event.native_session_id !== session.binding.native_session_id ||
                (accepted !== null && accepted !== event.native_run_id)
              )
                throw new HarnessError("PROTOCOL_ERROR", "unknown");
              if (session.launch.redactor.text(event.native_run_id) !== event.native_run_id)
                throw new HarnessError("PROTOCOL_ERROR", "unknown");
              accepted = event.native_run_id;
              context.started(event.native_run_id);
              attachments.record(run.id, attachmentContext.observations, authorizeAttachments);
            }
            if (event.type === "text") {
              text += event.text;
              if (text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
            } else if (event.type === "text_snapshot") text = event.text;
            else if (event.type === "dispatch") {
              if (session.launch.redactor.text(event.native_run_id) !== event.native_run_id)
                throw new HarnessError("PROTOCOL_ERROR", "unknown");
              this.lifecycle.observe(run.id, run.dispatch_token as string, {
                native_dispatch_id: event.native_run_id,
              });
            } else if (event.type === "activity") {
              const current = this.lifecycle.store.get("run", run.id);
              this.lifecycle.observe(run.id, run.dispatch_token as string, {
                activity: current.active_tools.length ? "tool_running" : event.activity,
              });
              if (event.activity === "generating") context.controlReady?.();
            } else if (event.type === "tool_activity") {
              observeToolActivity(
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
                const current = this.lifecycle.store.get("run", run.id);
                const source = {
                  url: event.url,
                  title: session.launch.redactor.text(event.title),
                  operation: event.operation,
                };
                this.lifecycle.observe(run.id, run.dispatch_token as string, {
                  sources: [...current.sources.filter((s) => s.url !== source.url), source].slice(
                    -100,
                  ),
                });
              }
            } else if (event.type === "native_tool") {
              const current = this.lifecycle.store.get("run", run.id);
              const tools = current.native_tools.filter((item) => item.item_id !== event.item_id);
              tools.push({
                item_id: event.item_id,
                name: event.name,
                command: event.command,
                state: event.state,
                exit_code: event.exit_code,
              });
              this.lifecycle.observe(run.id, run.dispatch_token as string, {
                native_tools: tools.slice(-200),
              });
            } else if (event.type === "failure") {
              this.lifecycle.observe(run.id, run.dispatch_token as string, {
                diagnostic: { ...diagnostic(new HarnessError(event.code)), outcome: "failed" },
              });
              if (event.code === "LOGIN_REQUIRED" || event.code === "AUTH_REJECTED") {
                const current = this.connections.get(connection.id);
                if (current.state === "active")
                  this.connections.update(current, {
                    login: event.code === "LOGIN_REQUIRED" ? "required" : "rejected",
                  });
              }
            } else this.publish(run.id, event);
            if (
              (event.type === "text" || event.type === "text_snapshot") &&
              accepted &&
              Date.now() - lastPublishedAt >= 100
            ) {
              const safe = session.launch.redactor.stream(text);
              if (safe) {
                this.appendIfAuthorized(run.id, safe, "partial");
                lastPublishedAt = Date.now();
              }
            }
          },
        }),
      ]);
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
      outcome = dispatched
        ? !accepted && error instanceof HarnessError && error.outcome === "not_dispatched"
          ? "failed"
          : "unknown"
        : "failed";
      if (!this.#closed && run.dispatch_token)
        this.lifecycle.observe(run.id, run.dispatch_token, { diagnostic: diagnostic(error) });
    } finally {
      finished = true;
      removeAbort();
      clearTimeout(stopTimer);
      lease?.revoke();
      const groupWorkspace = run.workspace_id
        ? this.lifecycle.store.get("workspace", run.workspace_id).scope === "group"
        : false;
      if (groupWorkspace) {
        const session = this.#sessions.get(`${run.thread_id}:${run.agent_id}`);
        if (session) {
          // End the writer process before the application's durable workspace lease can settle.
          try {
            await bounded(session.client.close(), this.timeouts.close_ms);
          } catch {
            outcome = "unknown";
          }
        }
      }
      if (!this.#closed && (text || this.lifecycle.store.answer(run.id))) {
        const session = this.#sessions.get(`${run.thread_id}:${run.agent_id}`);
        if (session && accepted) {
          const safe = session.launch.redactor.text(text);
          const published = this.appendIfAuthorized(
            run.id,
            safe,
            outcome === "succeeded" ? "complete" : "partial",
          );
          if (published && this.lifecycle.store.get("run", run.id).publication === "immediate")
            this.publish(run.id, { type: "text", text: safe }, outcome);
        }
      }
      if (!this.#closed && dispatched) {
        const connection = this.connections.get(
          lease?.scope.connection_id ??
            this.lifecycle.store.get("agent", run.agent_id).connection_id,
        );
        if (connection.state === "active")
          this.connections.update(connection, {
            inference: outcome,
          });
      }
      if (
        !this.#closed &&
        (groupWorkspace || this.lifecycle.store.get("thread", run.thread_id).purpose === "routing")
      ) {
        const key = `${run.thread_id}:${run.agent_id}`;
        const session = this.#sessions.get(key);
        if (session) {
          this.#sessions.delete(key);
          clearTimeout(this.#idleTimers.get(key));
          this.#idleTimers.delete(key);
          session.controller.abort();
          await bounded(session.client.close(), this.timeouts.close_ms).catch(() => {});
        }
      }
    }
    return outcome;
  }
  async close() {
    if (this.#closed) return;
    this.#interactionJournal.recover();
    for (const control of this.lifecycle.store.list("control"))
      if (control.state === "requested")
        new RunControls(this.lifecycle).settleSteer(control.id, "unknown", "NATIVE_UNKNOWN");
    this.#closed = true;
    for (const timer of this.#idleTimers.values()) clearTimeout(timer);
    this.#idleTimers.clear();
    for (const controller of this.#recoveryControllers) controller.abort();
    this.tools.revokeAll();
    for (const session of this.#sessions.values()) session.controller.abort();
    await bounded(Promise.allSettled([...this.#opening.values()]), this.timeouts.close_ms).catch(
      () => {},
    );
    await Promise.allSettled(
      [...this.#sessions.values()].map((session) =>
        bounded(session.client.close(), this.timeouts.close_ms),
      ),
    );
    this.#sessions.clear();
  }
}
