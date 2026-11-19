import { createHash } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import { authorizeResponsibilityWork } from "../goals/work-fence";
import type { ToolAccess } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { appAssignment, appExecute, appSearch, toolkitSlug } from "./contracts";
import { type AppHost, ComposioHost } from "./host";
import { McpHost } from "./mcp-host";
import { appOutput } from "./output";

type Scope = { agent_id: string; thread_id: string | null };
function grantFor(connection: Entity<"app_connection">, scope: Scope) {
  return connection.grants.find(
    (grant) =>
      grant.agent_id === scope.agent_id &&
      (grant.thread_id === null || grant.thread_id === scope.thread_id),
  );
}

export class Applications {
  readonly #opening = new Map<string, Promise<Entity<"app_session">>>();
  readonly #busy = new Set<string>();
  private constructor(
    readonly lifecycle: Lifecycle,
    readonly host: AppHost = new ComposioHost(),
    private readonly mcp = new McpHost([]),
  ) {}
  private connector(toolkit: string) {
    return toolkit.startsWith("mcp_") ? this.mcp : this.host;
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
  private async update<T extends Entity<"app_connection" | "app_effect">>(
    entity: T,
    fields: Partial<T>,
  ): Promise<T> {
    const save = () =>
      this.lifecycle.store.put(
        {
          ...entity,
          ...fields,
          revision: entity.revision + 1,
          updated_at: new Date().toISOString(),
        } as T,
        entity.revision,
      );
    return entity.kind === "app_connection" &&
      entity.ownership === "organization" &&
      this.lifecycle.store.dataContext
      ? this.lifecycle.store.publishShared(save)
      : save();
  }
  private async scope(scope: Scope) {
    const agent = await this.lifecycle.store.get("agent", scope.agent_id);
    if (scope.thread_id === null) {
      if (agent.ownership !== "organization") throw new DomainError("SCOPE_DENIED", 403);
      return;
    }
    await this.lifecycle.store.assertInvocation(agent.id);
    const thread = await this.lifecycle.store.get("thread", scope.thread_id);
    if (!thread.member_agent_ids.includes(agent.id) || thread.purpose !== "conversation")
      throw new DomainError("SCOPE_DENIED", 403);
  }
  private identity(ownership: "personal" | "organization") {
    const context = this.lifecycle.store.dataContext;
    return context
      ? `ngertiin:${createHash("sha256")
          .update(
            canonical([
              context.organizationId,
              ownership,
              ownership === "personal" ? context.userId : null,
            ]),
          )
          .digest("hex")}`
      : this.lifecycle.store.ownerId;
  }
  private async manage(connection: Entity<"app_connection">) {
    const context = this.lifecycle.store.dataContext;
    await context?.validate();
    if (
      context &&
      (connection.ownership === "organization"
        ? !context.canManage
        : connection.actor_id !== context.userId)
    )
      throw new DomainError("SCOPE_DENIED", 403);
  }
  private remoteIdentity(connection: Entity<"app_connection">) {
    if (
      this.lifecycle.store.dataContext &&
      connection.integration_identity !== this.identity(connection.ownership)
    )
      throw new DomainError("APP_AUTH_REQUIRED", 403);
    return connection.integration_identity ?? this.lifecycle.store.ownerId;
  }
  private connectionInScope(connection: Entity<"app_connection">) {
    const context = this.lifecycle.store.dataContext;
    return (
      !context ||
      (connection.integration_identity === this.identity(connection.ownership) &&
        (connection.ownership === "personal" ||
          context.allowedAppConnections?.includes(connection.id)))
    );
  }
  private async checkAccount(
    connection: Entity<"app_connection">,
    authorize: () => void | Promise<void> = () => {},
  ) {
    const accounts = await this.connector(connection.toolkit).accounts(
      this.remoteIdentity(connection),
    );
    await authorize();
    const current = await this.lifecycle.store.get("app_connection", connection.id);
    if (current.generation !== connection.generation || current.state !== "active")
      throw new DomainError("STALE_DISPATCH");
    if (
      !accounts.some(
        (account) =>
          account.id === connection.account_id &&
          account.toolkit === connection.toolkit &&
          account.active,
      )
    ) {
      // A member cannot publish organization account configuration. Management refresh
      // records its new state; every invocation still fails closed immediately.
      const context = this.lifecycle.store.dataContext;
      if (!context || connection.ownership === "personal" || context.canManage)
        await this.update(current, { state: "auth_required", generation: current.generation + 1 });
      throw new DomainError("APP_AUTH_REQUIRED");
    }
  }
  async list(scope?: Scope) {
    if (scope) await this.scope(scope);
    return (await this.lifecycle.store.list("app_connection")).filter(
      (connection) => !scope || (this.connectionInScope(connection) && grantFor(connection, scope)),
    );
  }
  async hasEnabledTools(scope: Scope) {
    return (await this.list(scope)).some(
      (connection) =>
        connection.state === "active" && (grantFor(connection, scope)?.tools.length ?? 0) > 0,
    );
  }
  async catalog(query: string, cursor?: string) {
    const identity = this.identity("personal");
    if (!this.mcp.configured || cursor) return await this.host.catalog(identity, query, cursor);
    const local = await this.mcp.catalog(identity, query);
    try {
      const remote = await this.host.catalog(identity, query);
      return {
        ...remote,
        items: [...local.items, ...remote.items.filter((item) => !item.slug.startsWith("mcp_"))],
      };
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== "APP_UNAVAILABLE") throw error;
      return local;
    }
  }
  managedCatalog() {
    return this.mcp.catalog(this.identity("personal"), "");
  }
  async connect(
    toolkit: string,
    previousId?: string,
    ownership: "personal" | "organization" = "personal",
    audienceId: string | null = null,
  ) {
    toolkitSlug.parse(toolkit);
    const previous = previousId
      ? await this.lifecycle.store.get("app_connection", previousId)
      : null;
    if (previous && previous.toolkit !== toolkit) throw new DomainError("SCOPE_DENIED", 403);
    const context = this.lifecycle.store.dataContext;
    if (previous) {
      await this.manage(previous);
      ownership = previous.ownership;
      audienceId = previous.audience_id;
    }
    if (ownership === "organization") {
      if (!context?.canManage || !audienceId) throw new DomainError("SCOPE_DENIED", 403);
      await context.validateAudience?.(audienceId);
    } else if (audienceId) throw new DomainError("SCOPE_DENIED", 403);
    const identity = this.identity(ownership);
    const link = await this.connector(toolkit).connect(identity, toolkit);
    const state = link.connect_url === null ? "active" : "pending";
    await context?.validate();
    const save = async () =>
      previous
        ? await this.update(previous, {
            account_id: link.account_id,
            state,
            generation: previous.generation + 1,
            initiated_by: context?.userId ?? null,
            integration_identity: context ? identity : null,
          })
        : await this.lifecycle.store.put({
            ...this.base(),
            kind: "app_connection",
            toolkit,
            ownership,
            audience_id: audienceId,
            integration_identity: context ? identity : null,
            initiated_by: context?.userId ?? null,
            account_id: link.account_id,
            state,
            generation: 1,
            grants: [],
          });
    const connection =
      context && ownership === "organization"
        ? await this.lifecycle.store.publishShared(save)
        : await save();
    // Connect Links belong to the authenticated owner API only, never a product tool/transcript.
    return { connection, connect_url: link.connect_url };
  }
  async refresh(id: string) {
    const connection = await this.lifecycle.store.get("app_connection", id);
    await this.manage(connection);
    const context = this.lifecycle.store.dataContext;
    if (context && connection.state !== "active" && connection.initiated_by !== context.userId)
      throw new DomainError("SCOPE_DENIED", 403);
    if (connection.state === "revoked") throw new DomainError("SCOPE_DENIED", 403);
    const accounts = await this.connector(connection.toolkit).accounts(
      this.remoteIdentity(connection),
    );
    await this.manage(connection);
    const current = await this.lifecycle.store.get("app_connection", id);
    if (current.revision !== connection.revision) throw new DomainError("STALE_DISPATCH");
    const state = accounts.some(
      (a) => a.id === connection.account_id && a.toolkit === connection.toolkit && a.active,
    )
      ? "active"
      : "auth_required";
    return current.state === state
      ? current
      : await this.update(current, { state, generation: current.generation + 1 });
  }
  async assign(id: string, input: unknown) {
    const data = appAssignment.parse(input),
      connection = await this.lifecycle.store.get("app_connection", id);
    await this.manage(connection);
    if (connection.revision !== data.expected_revision) throw new DomainError("CONFLICT");
    for (const grant of data.grants) {
      await this.scope(grant);
      if (grant.action_budget && !connection.toolkit.startsWith("mcp_"))
        throw new DomainError("INVALID_REQUEST", 422);
      if (
        this.lifecycle.store.dataContext &&
        connection.ownership === "organization" &&
        grant.thread_id !== null
      )
        throw new DomainError("SCOPE_DENIED", 403);
    }
    if (new Set(data.grants.map((g) => `${g.agent_id}:${g.thread_id}`)).size !== data.grants.length)
      throw new DomainError("INVALID_REQUEST", 422);
    return await this.update(connection, {
      grants: data.grants,
      generation: connection.generation + 1,
    });
  }
  async revoke(id: string) {
    const connection = await this.lifecycle.store.get("app_connection", id);
    await this.manage(connection);
    return connection.state === "revoked"
      ? connection
      : await this.update(connection, { state: "revoked", generation: connection.generation + 1 });
  }
  private async authorized(id: string, scope: Scope, generation?: number, tool?: string) {
    await this.scope(scope);
    await this.lifecycle.store.dataContext?.validate(true);
    const connection = await this.lifecycle.store.get("app_connection", id);
    if (!this.connectionInScope(connection)) throw new DomainError("SCOPE_DENIED", 403);
    if (connection.state !== "active")
      throw new DomainError(
        connection.state === "revoked" ? "SCOPE_DENIED" : "APP_AUTH_REQUIRED",
        403,
      );
    if (generation !== undefined && connection.generation !== generation)
      throw new DomainError("STALE_DISPATCH");
    const grant = grantFor(connection, scope);
    if (!grant || (tool && !grant.tools.includes(tool))) throw new DomainError("SCOPE_DENIED", 403);
    return { connection, grant };
  }
  private async session(id: string, scope: Scope) {
    const threadId = scope.thread_id;
    if (!threadId) throw new DomainError("SCOPE_DENIED", 403);
    const { connection, grant } = await this.authorized(id, scope);
    const matches = (s: Entity<"app_session">) =>
      s.connection_id === id &&
      s.agent_id === scope.agent_id &&
      s.thread_id === scope.thread_id &&
      s.generation === connection.generation;
    const existing = (await this.lifecycle.store.list("app_session")).find(matches);
    if (existing) return existing;
    const key = `${id}:${scope.agent_id}:${scope.thread_id}:${connection.generation}`;
    const pending = this.#opening.get(key);
    if (pending) return pending;
    const opening = (async () => {
      const native = await this.connector(connection.toolkit).session(
        this.remoteIdentity(connection),
        {
          toolkit: connection.toolkit,
          account_id: connection.account_id,
          tools: grant.tools,
        },
      );
      await this.authorized(id, scope, connection.generation);
      return await this.lifecycle.store.put({
        ...this.base(),
        kind: "app_session",
        integration_identity: connection.integration_identity,
        connection_id: id,
        agent_id: scope.agent_id,
        thread_id: threadId,
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
    await authorize();
    const connection = scope
      ? (await this.authorized(data.connection_id, scope)).connection
      : await this.lifecycle.store.get("app_connection", data.connection_id);
    if (!scope) await this.manage(connection);
    if (connection.state !== "active") throw new DomainError("APP_AUTH_REQUIRED");
    const host = this.connector(connection.toolkit);
    await this.checkAccount(connection, authorize);
    const session = scope
      ? await this.session(connection.id, scope)
      : {
          native_session_id: await host.session(this.remoteIdentity(connection), {
            toolkit: connection.toolkit,
            account_id: connection.account_id,
          }),
        };
    await authorize();
    const tools = await host.search(session.native_session_id, data.query, {
      user: this.remoteIdentity(connection),
      account: connection.account_id,
    });
    await authorize();
    if (
      (await this.lifecycle.store.get("app_connection", connection.id)).generation !==
      connection.generation
    )
      throw new DomainError("STALE_DISPATCH");
    const grant = scope
      ? (await this.authorized(connection.id, scope, connection.generation)).grant
      : null;
    return appOutput(
      tools.filter(
        (t) =>
          t.toolkit === connection.toolkit &&
          !t.slug.startsWith("COMPOSIO_") &&
          (!grant ||
            (grant.tools.includes(t.slug) &&
              (t.action_policy?.mutability !== "write" || grant.action_budget?.allow_writes))),
      ),
    );
  }
  async execute(input: unknown, access: ToolAccess) {
    const data = appExecute.parse(input);
    await access.authorize();
    await authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
    const { connection, grant } = await this.authorized(
      data.connection_id,
      access.scope,
      undefined,
      data.tool,
    );
    for (const [path, values] of Object.entries(grant.resources)) {
      let value: unknown = data.arguments;
      for (const key of path.split("."))
        value =
          value && typeof value === "object" && Object.hasOwn(value, key)
            ? (value as Record<string, unknown>)[key]
            : undefined;
      if (!values.some((allowed) => canonical(allowed) === canonical(value)))
        throw new DomainError("SCOPE_DENIED", 403);
    }
    const fingerprint = createHash("sha256")
      .update(canonical({ ...data, run_id: access.scope.run_id }))
      .digest("hex");
    const previous = (await this.lifecycle.store.list("app_effect")).find(
      (e) => e.id === data.command_id,
    );
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new DomainError("IDEMPOTENCY_CONFLICT");
      return { receipt: previous };
    }
    if (this.#busy.has(connection.account_id)) throw new DomainError("CONFLICT");
    this.#busy.add(connection.account_id);
    let effect: Entity<"app_effect"> | undefined;
    try {
      if (
        (await this.lifecycle.store.list("app_effect")).some(
          (effect) =>
            effect.account_id === connection.account_id &&
            ["dispatched", "unknown"].includes(effect.state),
        )
      )
        throw new DomainError("RECONCILIATION_REQUIRED");
      const session = await this.session(connection.id, access.scope);
      const authorize = async () => {
        await access.authorize();
        await authorizeResponsibilityWork(this.lifecycle, access.scope.run_id);
        await this.authorized(connection.id, access.scope, connection.generation, data.tool);
      };
      await this.checkAccount(connection, authorize);
      const result = await this.connector(connection.toolkit).execute(
        session.native_session_id,
        connection.account_id,
        data.tool,
        data.arguments,
        async (policy) => {
          effect = await this.lifecycle.store.transaction(async () => {
            await authorize();
            if (connection.toolkit.startsWith("mcp_") && !policy)
              throw new DomainError("APP_UNAVAILABLE");
            if (policy?.mutability === "write" && !grant.action_budget?.allow_writes)
              throw new DomainError("SCOPE_DENIED", 403);
            const reserved = await this.lifecycle.store.query(
              "INSERT INTO app_account_holds(owner_id,account_id,effect_id,organization_id,actor_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING effect_id",
              [
                this.lifecycle.store.ownerId,
                connection.account_id,
                data.command_id,
                this.lifecycle.store.dataContext?.organizationId ?? null,
                this.lifecycle.store.dataContext?.userId ?? null,
              ],
            );
            if (!reserved.rowCount) throw new DomainError("RECONCILIATION_REQUIRED");
            if (policy && policy.units > 0) {
              const spent = await this.lifecycle.store.query<{ units: string }>(
                `SELECT COALESCE(SUM((body->>'budget_units')::integer),0) AS units
                 FROM entities WHERE kind='app_effect' AND body->>'account_id'=$1
                   AND body->>'agent_id'=$2 AND ($3::text IS NULL OR body->>'thread_id'=$3)`,
                [connection.account_id, grant.agent_id, grant.thread_id],
              );
              if (
                Number(spent.rows[0]?.units ?? 0) + policy.units >
                (grant.action_budget?.limit_units ?? 0)
              )
                throw new DomainError("APP_BUDGET_EXCEEDED");
            }
            return this.lifecycle.store.put({
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
              ...(policy ? { budget_units: policy.units } : {}),
              log_id: null,
              request_id: null,
              sdk_error: null,
              error_code: null,
              result: null,
            });
          });
        },
        { user: this.remoteIdentity(connection), account: connection.account_id },
      );
      if (!effect) throw new DomainError("APP_UNAVAILABLE");
      const receipt = await this.lifecycle.store.settleAppEffect(effect, {
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
      await authorize();
      return { receipt };
    } catch (error) {
      if (effect) {
        try {
          await this.lifecycle.store.settleAppEffect(effect, {
            ...effect,
            state: "unknown",
            error_code: "APP_UNKNOWN",
          });
        } catch (settlementError) {
          if (!(settlementError instanceof DomainError) || settlementError.code !== "CONFLICT")
            throw settlementError;
        }
      }
      throw error;
    } finally {
      this.#busy.delete(connection.account_id);
    }
  }

  private async initialize(lifecycle: Lifecycle) {
    await lifecycle.store.recoverAppEffects();
  }

  static async open(
    lifecycle: Lifecycle,
    host: AppHost = new ComposioHost(),
    mcp?: McpHost,
  ): Promise<Applications> {
    const instance = new Applications(lifecycle, host, mcp);
    await instance.initialize(lifecycle);
    return instance;
  }
}
