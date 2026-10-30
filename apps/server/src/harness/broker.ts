import type { ExecutorContext, HarnessExecutor } from "../background";
import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { type Availability, detectHarness, type HarnessId, requireAvailable } from "./availability";
import { Connections } from "./connections";
import type { CredentialContexts, LaunchContext } from "./context";
import {
  capabilities,
  HarnessError,
  type NativeEvent,
  nativeEvent,
  type Settings,
  settings,
  terminal,
} from "./contracts";
import type { ProductTools } from "./tools";

export type SessionIdentity = { native_session_id: string };
export type Inspection = {
  login: Entity<"connection">["login"];
  account_id: string | null;
  auth_method: Entity<"connection">["authentication"]["method"];
  billing_source: Entity<"connection">["authentication"]["billing_source"];
  capabilities: Entity<"connection">["capabilities"];
};
export type ToolLease = ReturnType<ProductTools["issue"]>;
/** One client/process per connection + agent + thread. No global account/model mutation. */
export interface HarnessClient {
  inspect(): Promise<Inspection>;
  discoverModels(): Promise<Entity<"connection">["models"]>;
  start(settings: Settings): Promise<SessionIdentity>;
  resume(identity: SessionIdentity, settings: Settings): Promise<SessionIdentity>;
  settings(identity: SessionIdentity, settings: Settings): Promise<void>;
  prompt(request: {
    identity: SessionIdentity;
    run_id: string;
    text: string;
    settings: Settings;
    tools: ToolLease;
    signal: AbortSignal;
    onEvent(event: NativeEvent): void;
  }): Promise<unknown>;
  stop(identity: SessionIdentity, runId: string): Promise<{ confirmed: boolean }>;
  close(): Promise<void>;
}
export interface HarnessAdapter {
  readonly harness: HarnessId;
  connect(
    context: LaunchContext & {
      executable: string;
      connection_id: string;
      agent_id: string;
      thread_id: string;
    },
  ): Promise<HarnessClient>;
}
type Session = {
  client: HarnessClient;
  launch: LaunchContext;
  binding: Entity<"binding">;
  connection_revision: number;
  selected: Settings;
  controller: AbortController;
};
async function bounded<T>(operation: Promise<T>, timeoutMs: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new HarnessError("SERVICE_UNAVAILABLE")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
export class HarnessBroker {
  readonly connections: Connections;
  readonly #sessions = new Map<string, Session>();
  readonly #opening = new Map<string, Promise<Session>>();
  readonly #connectionOpens = new Map<string, Promise<void>>();
  #closed = false;
  constructor(
    readonly lifecycle: Lifecycle,
    readonly credentials: CredentialContexts,
    readonly tools: ProductTools,
    private readonly adapters: Partial<Record<HarnessId, HarnessAdapter>> = {},
    private readonly detect: (harness: HarnessId) => Promise<Availability> = detectHarness,
    private readonly publish: (runId: string, event: NativeEvent) => void = () => {},
    private readonly timeouts = { request_ms: 30_000, close_ms: 1000 },
  ) {
    this.connections = new Connections(lifecycle);
    for (const [id, adapter] of Object.entries(adapters))
      if (adapter?.harness !== id) throw new Error("Adapter identity mismatch.");
  }
  executors(): Partial<Record<HarnessId, HarnessExecutor>> {
    return Object.fromEntries(
      Object.keys(this.adapters).map((id) => [
        id,
        { execute: (run: Entity<"run">, context: ExecutorContext) => this.execute(run, context) },
      ]),
    );
  }
  private selection(agent: Entity<"agent">): Settings {
    if (agent.model_id === null) throw new HarnessError("MODEL_UNAVAILABLE");
    return settings.parse({ model_id: agent.model_id, reasoning: agent.reasoning });
  }
  private member(threadId: string, agentId: string) {
    if (!this.lifecycle.store.get("thread", threadId).member_agent_ids.includes(agentId))
      throw new DomainError("SCOPE_DENIED", 403);
    return this.connections.forAgent(agentId);
  }
  async openSession(threadId: string, agentId: string): Promise<Entity<"binding">> {
    return (await this.session(threadId, agentId)).binding;
  }
  private async session(threadId: string, agentId: string): Promise<Session> {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const lane = `${threadId}:${agentId}`;
    const existing = this.#sessions.get(lane);
    if (existing) {
      this.check(existing, threadId, agentId);
      return existing;
    }
    const pending = this.#opening.get(lane);
    if (pending) return pending;
    const promise = this.serializedOpen(threadId, agentId)
      .then((session) => {
        this.#sessions.set(lane, session);
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
    const selected = this.selection(initial.agent);
    const adapter = this.adapters[initial.connection.harness];
    if (!adapter) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const availability = requireAvailable(
      await bounded(this.detect(initial.connection.harness), this.timeouts.request_ms),
    );
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const controller = new AbortController();
    const launch = { ...this.credentials.create(initial.connection), signal: controller.signal };
    let client: HarnessClient | undefined;
    try {
      const connecting = adapter.connect({
        ...launch,
        executable: availability.executable as string,
        connection_id: initial.connection.id,
        agent_id: agentId,
        thread_id: threadId,
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
        account_id: observed.account_id,
        capabilities: capabilities.parse(observed.capabilities),
      });
      if (current.login !== "authenticated")
        throw new HarnessError(current.login === "rejected" ? "AUTH_REJECTED" : "LOGIN_REQUIRED");
      const beforeDiscovery = current.grant_revision;
      try {
        const models = await bounded(client.discoverModels(), this.timeouts.request_ms);
        if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
        current = this.member(threadId, agentId).connection;
        if (current.grant_revision !== beforeDiscovery) throw new DomainError("STALE_DISPATCH");
        if (launch.redactor.text(JSON.stringify(models)) !== JSON.stringify(models))
          throw new HarnessError("PROTOCOL_ERROR");
        current = this.connections.update(current, { discovery: "succeeded", models });
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
        .find((binding) => binding.thread_id === threadId && binding.agent_id === agentId);
      if (
        previous &&
        (previous.connection_id !== current.id || previous.harness !== current.harness)
      )
        throw new DomainError("SCOPE_DENIED", 403);
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
      const latest = this.member(threadId, agentId);
      if (
        this.#closed ||
        latest.connection.grant_revision !== current.grant_revision ||
        canonical(this.selection(latest.agent)) !== canonical(selected)
      )
        throw new DomainError("STALE_DISPATCH");
      const binding = this.lifecycle.bind(threadId, agentId, identity.native_session_id);
      const session = {
        client,
        launch,
        binding,
        connection_revision: latest.connection.grant_revision,
        selected,
        controller,
      };
      this.check(session, threadId, agentId);
      return session;
    } catch (error) {
      controller.abort();
      if (client) await bounded(client.close(), this.timeouts.close_ms).catch(() => {});
      if (error instanceof HarnessError || error instanceof DomainError) throw error;
      throw new HarnessError("PROTOCOL_ERROR");
    }
  }
  private check(session: Session, threadId: string, agentId: string) {
    const { agent, connection } = this.member(threadId, agentId);
    const binding = this.lifecycle.store.get("binding", session.binding.id);
    if (
      binding.revision !== session.binding.revision ||
      binding.native_session_id !== session.binding.native_session_id ||
      session.binding.connection_id !== connection.id ||
      session.binding.harness !== agent.harness ||
      session.connection_revision !== connection.grant_revision ||
      canonical(session.selected) !== canonical(this.selection(agent))
    )
      throw new DomainError("STALE_DISPATCH");
    return connection;
  }
  private requireCapability(
    connection: Entity<"connection">,
    capability: keyof Entity<"connection">["capabilities"],
  ) {
    const state = connection.capabilities[capability];
    if (state !== "supported")
      throw new HarnessError(state === "unknown" ? "CAPABILITY_UNKNOWN" : "CAPABILITY_UNSUPPORTED");
  }
  async execute(
    run: Entity<"run">,
    context: ExecutorContext,
  ): Promise<Entity<"run">["outcome"] & ("succeeded" | "failed" | "cancelled" | "unknown")> {
    let lease: ToolLease | undefined;
    let removeAbort = () => {};
    let dispatched = false;
    let accepted: string | null = null;
    let finished = false;
    let outcome: "succeeded" | "failed" | "cancelled" | "unknown" = "unknown";
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
      lease = this.tools.issue(run);
      session.launch.redactor.add(lease.token);
      let text = "";
      let stopped: (result: unknown) => void = () => {};
      const stopResult = new Promise<unknown>((resolve) => {
        stopped = resolve;
      });
      const abort = () => {
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
          text: this.lifecycle.store.get("message", run.input_message_id).text,
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
            }
            if (event.type === "text") {
              text += event.text;
              if (text.length > 100_000) throw new HarnessError("PROTOCOL_ERROR", "unknown");
            } else this.publish(run.id, event);
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
      if (text) this.publish(run.id, { type: "text", text: session.launch.redactor.text(text) });
    } catch (error) {
      outcome = dispatched
        ? !accepted && error instanceof HarnessError && error.outcome === "not_dispatched"
          ? "failed"
          : "unknown"
        : "failed";
    } finally {
      finished = true;
      removeAbort();
      lease?.revoke();
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
    }
    return outcome;
  }
  async close() {
    this.#closed = true;
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
