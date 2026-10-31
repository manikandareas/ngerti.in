import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { appAssignment, appExecute, appSearch, toolkitSlug } from "./contracts";
import { type AppHost, ComposioHost } from "./host";
import { appOutput } from "./output";

type Scope = { agent_id: string; thread_id: string };
export class Applications {
  readonly #opening = new Map<string, Promise<Entity<"app_session">>>();
  readonly #busy = new Set<string>();
  constructor(
    readonly lifecycle: Lifecycle,
    readonly host: AppHost = new ComposioHost(),
  ) {
    for (const effect of lifecycle.store.list("app_effect"))
      if (effect.state === "dispatched")
        this.update(effect, { state: "unknown", error_code: "APP_UNKNOWN" });
  }
  private base() {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      owner_id: this.lifecycle.store.ownerId,
      revision: 1,
      created_at: now,
      updated_at: now,
    };
  }
  private update<T extends Entity<"app_connection" | "app_effect">>(
    entity: T,
    fields: Partial<T>,
  ): T {
    return this.lifecycle.store.put(
      {
        ...entity,
        ...fields,
        revision: entity.revision + 1,
        updated_at: new Date().toISOString(),
      } as T,
      entity.revision,
    );
  }
  private scope(scope: Scope) {
    const agent = this.lifecycle.store.get("agent", scope.agent_id);
    const thread = this.lifecycle.store.get("thread", scope.thread_id);
    if (!thread.member_agent_ids.includes(agent.id) || thread.purpose !== "conversation")
      throw new DomainError("SCOPE_DENIED", 403);
  }
  list(scope?: Scope) {
    if (scope) this.scope(scope);
    return this.lifecycle.store
      .list("app_connection")
      .filter(
        (c) =>
          !scope ||
          c.grants.some((g) => g.agent_id === scope.agent_id && g.thread_id === scope.thread_id),
      );
  }
  catalog(query: string, cursor?: string) {
    return this.host.catalog(this.lifecycle.store.ownerId, query, cursor);
  }
  async connect(toolkit: string, previousId?: string) {
    toolkitSlug.parse(toolkit);
    const previous = previousId ? this.lifecycle.store.get("app_connection", previousId) : null;
    if (previous && previous.toolkit !== toolkit) throw new DomainError("SCOPE_DENIED", 403);
    const link = await this.host.connect(this.lifecycle.store.ownerId, toolkit);
    const connection = previous
      ? this.update(previous, {
          account_id: link.account_id,
          state: "pending",
          generation: previous.generation + 1,
        })
      : this.lifecycle.store.put({
          ...this.base(),
          kind: "app_connection",
          toolkit,
          account_id: link.account_id,
          state: "pending",
          generation: 1,
          grants: [],
        });
    // Connect Links belong to the authenticated owner API only, never a product tool/transcript.
    return { connection, connect_url: link.connect_url };
  }
  async refresh(id: string) {
    const connection = this.lifecycle.store.get("app_connection", id);
    if (connection.state === "revoked") throw new DomainError("SCOPE_DENIED", 403);
    const accounts = await this.host.accounts(this.lifecycle.store.ownerId);
    const current = this.lifecycle.store.get("app_connection", id);
    if (current.revision !== connection.revision) throw new DomainError("STALE_DISPATCH");
    const state = accounts.some(
      (a) => a.id === connection.account_id && a.toolkit === connection.toolkit && a.active,
    )
      ? "active"
      : "auth_required";
    return current.state === state
      ? current
      : this.update(current, { state, generation: current.generation + 1 });
  }
  assign(id: string, input: unknown) {
    const data = appAssignment.parse(input),
      connection = this.lifecycle.store.get("app_connection", id);
    if (connection.revision !== data.expected_revision) throw new DomainError("CONFLICT");
    for (const grant of data.grants) this.scope(grant);
    if (new Set(data.grants.map((g) => `${g.agent_id}:${g.thread_id}`)).size !== data.grants.length)
      throw new DomainError("INVALID_REQUEST", 422);
    return this.update(connection, { grants: data.grants, generation: connection.generation + 1 });
  }
  revoke(id: string) {
    const connection = this.lifecycle.store.get("app_connection", id);
    return connection.state === "revoked"
      ? connection
      : this.update(connection, { state: "revoked", generation: connection.generation + 1 });
  }
  private authorized(id: string, scope: Scope, generation?: number, tool?: string) {
    this.scope(scope);
    const connection = this.lifecycle.store.get("app_connection", id);
    if (connection.state !== "active")
      throw new DomainError(
        connection.state === "revoked" ? "SCOPE_DENIED" : "APP_AUTH_REQUIRED",
        403,
      );
    if (generation !== undefined && connection.generation !== generation)
      throw new DomainError("STALE_DISPATCH");
    const grant = connection.grants.find(
      (g) => g.agent_id === scope.agent_id && g.thread_id === scope.thread_id,
    );
    if (!grant || (tool && !grant.tools.includes(tool))) throw new DomainError("SCOPE_DENIED", 403);
    return { connection, grant };
  }
  private async session(id: string, scope: Scope) {
    const { connection, grant } = this.authorized(id, scope);
    const matches = (s: Entity<"app_session">) =>
      s.connection_id === id &&
      s.agent_id === scope.agent_id &&
      s.thread_id === scope.thread_id &&
      s.generation === connection.generation;
    const existing = this.lifecycle.store.list("app_session").find(matches);
    if (existing) return existing;
    const key = `${id}:${scope.agent_id}:${scope.thread_id}:${connection.generation}`;
    const pending = this.#opening.get(key);
    if (pending) return pending;
    const opening = (async () => {
      const native = await this.host.session(this.lifecycle.store.ownerId, {
        toolkit: connection.toolkit,
        account_id: connection.account_id,
        tools: grant.tools,
      });
      this.authorized(id, scope, connection.generation);
      return this.lifecycle.store.put({
        ...this.base(),
        kind: "app_session",
        connection_id: id,
        agent_id: scope.agent_id,
        thread_id: scope.thread_id,
        generation: connection.generation,
        native_session_id: native,
      });
    })();
    this.#opening.set(key, opening);
    try {
      return await opening;
    } finally {
      this.#opening.delete(key);
    }
  }
  async search(input: unknown, scope?: Scope, authorize = () => {}) {
    const data = appSearch.parse(input);
    authorize();
    const connection = this.lifecycle.store.get("app_connection", data.connection_id);
    if (connection.state !== "active") throw new DomainError("APP_AUTH_REQUIRED");
    const session = scope
      ? await this.session(connection.id, scope)
      : {
          native_session_id: await this.host.session(this.lifecycle.store.ownerId, {
            toolkit: connection.toolkit,
            account_id: connection.account_id,
          }),
        };
    authorize();
    const tools = await this.host.search(session.native_session_id, data.query);
    authorize();
    if (
      this.lifecycle.store.get("app_connection", connection.id).generation !== connection.generation
    )
      throw new DomainError("STALE_DISPATCH");
    const grant = scope ? this.authorized(connection.id, scope, connection.generation).grant : null;
    return appOutput(
      tools.filter(
        (t) =>
          t.toolkit === connection.toolkit &&
          !t.slug.startsWith("COMPOSIO_") &&
          (!grant || grant.tools.includes(t.slug)),
      ),
    );
  }
  async execute(input: unknown, access: ToolAccess) {
    const data = appExecute.parse(input);
    access.authorize();
    authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
    const { connection } = this.authorized(data.connection_id, access.scope, undefined, data.tool);
    const fingerprint = createHash("sha256")
      .update(canonical({ ...data, run_id: access.scope.run_id }))
      .digest("hex");
    const previous = this.lifecycle.store.list("app_effect").find((e) => e.id === data.command_id);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { receipt: previous };
    }
    if (this.#busy.has(connection.account_id)) throw new DomainError("CONFLICT");
    if (
      this.lifecycle.store
        .list("app_effect")
        .some(
          (e) =>
            e.account_id === connection.account_id && ["dispatched", "unknown"].includes(e.state),
        )
    )
      throw new DomainError("RECONCILIATION_REQUIRED");
    this.#busy.add(connection.account_id);
    let effect: Entity<"app_effect"> | undefined;
    try {
      const session = await this.session(connection.id, access.scope);
      const accounts = await this.host.accounts(this.lifecycle.store.ownerId);
      const authorize = () => {
        access.authorize();
        authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
        this.authorized(connection.id, access.scope, connection.generation, data.tool);
      };
      authorize();
      if (
        !accounts.some(
          (a) => a.id === connection.account_id && a.toolkit === connection.toolkit && a.active,
        )
      ) {
        this.update(connection, { state: "auth_required", generation: connection.generation + 1 });
        throw new DomainError("APP_AUTH_REQUIRED");
      }
      const result = await this.host.execute(
        session.native_session_id,
        connection.account_id,
        data.tool,
        data.arguments,
        () => {
          authorize();
          effect = this.lifecycle.store.put({
            ...this.base(),
            id: data.command_id,
            kind: "app_effect",
            connection_id: connection.id,
            account_id: connection.account_id,
            agent_id: access.scope.agent_id,
            thread_id: access.scope.thread_id,
            run_id: access.scope.run_id,
            generation: connection.generation,
            tool: data.tool,
            fingerprint,
            state: "dispatched",
            log_id: null,
            request_id: null,
            sdk_error: null,
            error_code: null,
            result: null,
          });
        },
      );
      if (!effect) throw new DomainError("APP_UNAVAILABLE");
      const receipt = this.update(effect, {
        state: result.state,
        log_id: result.log_id,
        request_id: result.request_id ?? null,
        sdk_error: result.sdk_error ?? null,
        error_code:
          result.state === "unknown"
            ? "APP_UNKNOWN"
            : result.state === "failed"
              ? "APP_TOOL_FAILED"
              : null,
        result: appOutput(result.data),
      });
      authorize();
      return { receipt };
    } catch (error) {
      if (effect && this.lifecycle.store.get("app_effect", effect.id).state === "dispatched")
        this.update(effect, { state: "unknown", error_code: "APP_UNKNOWN" });
      throw error;
    } finally {
      this.#busy.delete(connection.account_id);
    }
  }
}
