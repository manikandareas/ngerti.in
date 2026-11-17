import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { connectionInput, HarnessError, unknownCapabilities } from "./contracts";
import { connectionProvider, credentialEnvironment } from "./providers";
import { type ProviderSelection, selectionInput } from "./selection-contracts";

/** Secret-free connection projections share the application store, transactions and events. */
export class Connections {
  constructor(readonly lifecycle: Lifecycle) {}
  async get(id: string | null) {
    return await this.lifecycle.store.get("connection", id);
  }
  async create(input: unknown): Promise<Entity<"connection">> {
    const data = connectionInput.parse(input);
    data.provider_id = connectionProvider(data.harness, data.provider_id);
    if (data.authentication.method === "api_key")
      credentialEnvironment(data.harness, data.provider_id);
    if (data.authentication.method === "native_login" && !["codex", "muse"].includes(data.harness))
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if (
      (data.authentication.method === "none") !==
      (data.harness === "opencode" && data.provider_id === "opencode")
    )
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if (data.authentication.method === "harness_config" && data.harness !== "pi")
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const scope = this.lifecycle.store.dataContext;
    if (scope) {
      if (data.ownership === "organization") {
        if (!scope.canManage || !data.audience_id) throw new DomainError("SCOPE_DENIED", 403);
        await scope.validateAudience?.(data.audience_id);
        if (!this.lifecycle.store.publishing)
          return this.lifecycle.store.publishShared(() => this.create(data));
      } else if (data.audience_id !== null) throw new DomainError("SCOPE_DENIED", 403);
    }
    const now = new Date().toISOString();
    return await this.lifecycle.store.put({
      ...data,
      id: crypto.randomUUID(),
      kind: "connection",
      owner_id: this.lifecycle.store.ownerId,
      revision: 1,
      grant_revision: 1,
      created_at: now,
      updated_at: now,
      state: "active",
      account_id: null,
      account_plan: null,
      effective_billing_source: "unknown",
      login: "unknown",
      discovery: "not_attempted",
      models: [],
      inference: "not_attempted",
      capabilities: { ...unknownCapabilities },
    });
  }
  async update(
    connection: Entity<"connection">,
    changes: Partial<
      Pick<
        Entity<"connection">,
        | "state"
        | "account_id"
        | "account_plan"
        | "login"
        | "discovery"
        | "models"
        | "inference"
        | "capabilities"
        | "effective_billing_source"
      >
    >,
  ): Promise<Entity<"connection">> {
    const grantChanged = Object.entries(changes).some(([key, value]) => {
      if (["inference", "discovery", "account_plan"].includes(key)) return false;
      // Discovering an additive native capability/catalog must not revoke a frozen first turn.
      // Losing previously observed support still retires its authority generation.
      if (key === "capabilities")
        return Object.entries(connection.capabilities).some(
          ([name, state]) =>
            state === "supported" &&
            changes.capabilities?.[name as keyof typeof connection.capabilities] !== "supported",
        );
      if (key === "models")
        return connection.models.some((model) => {
          const next = changes.models?.find((entry) => entry.id === model.id);
          return (
            !next ||
            model.reasoning.some((effort) => !next.reasoning.includes(effort)) ||
            (model.input_modalities ?? ["text"]).some(
              (modality) => !(next.input_modalities ?? ["text"]).includes(modality),
            )
          );
        });
      return canonical(connection[key as keyof typeof connection]) !== canonical(value);
    });
    if (
      Object.entries(changes).every(
        ([key, value]) =>
          canonical(connection[key as keyof typeof connection]) === canonical(value),
      )
    )
      return connection;
    if (connection.actor_id === null && connection.organization_id) {
      if (!this.lifecycle.store.dataContext?.canManage) {
        if (Object.keys(changes).every((key) => key === "inference")) return connection;
        throw new HarnessError("AUTH_REJECTED");
      }
      if (!this.lifecycle.store.publishing)
        return this.lifecycle.store.publishShared(() => this.update(connection, changes));
    }
    return await this.lifecycle.store.put(
      {
        ...connection,
        ...changes,
        grant_revision: connection.grant_revision + Number(grantChanged),
        revision: connection.revision + 1,
        updated_at: new Date().toISOString(),
      },
      connection.revision,
    );
  }
  async revoke(id: string | null) {
    if (id) await this.assertManagement(id);
    const current = await this.get(id);
    return current.state === "revoked" ? current : await this.update(current, { state: "revoked" });
  }
  async assertManagement(id: string) {
    const connection = await this.get(id);
    const scope = this.lifecycle.store.dataContext;
    if (scope && connection.actor_id !== scope.userId && !scope.canManage)
      throw new DomainError("SCOPE_DENIED", 403);
    return connection;
  }
  async authorize(connection: Entity<"connection">) {
    const scope = this.lifecycle.store.dataContext;
    await this.lifecycle.store.validateDataContext(true);
    if (scope && connection.actor_id === null && !scope.allowedConnections?.includes(connection.id))
      throw new DomainError("SCOPE_DENIED", 403);
    if (connection.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
  }
  async saveSelection(input: unknown): Promise<Entity<"ai_selection">> {
    const data = selectionInput.parse(input);
    const store = this.lifecycle.store;
    const scope = store.dataContext;
    if (!scope) throw new DomainError("SCOPE_DENIED", 403);
    if (data.scope === "organization") {
      if (!scope.canManage) throw new DomainError("SCOPE_DENIED", 403);
      if (!store.publishing) return store.publishShared(() => this.saveSelection(data));
    }
    if (data.thread_id && data.agent_id) {
      const thread = await store.get("thread", data.thread_id);
      await store.assertInvocation(data.agent_id);
      if (!thread.member_agent_ids.includes(data.agent_id))
        throw new DomainError("SCOPE_DENIED", 403);
      if ((await store.get("agent", data.agent_id)).harness !== data.harness)
        throw new HarnessError("MODEL_UNAVAILABLE");
    }
    if (data.selection) {
      const connection = await this.get(data.selection.connection_id);
      await this.authorize(connection);
      if (
        connection.harness !== data.harness ||
        (data.scope === "organization" && connection.actor_id !== null)
      )
        throw new DomainError("SCOPE_DENIED", 403);
    }
    return store.transaction(async () => {
      const previous = (await store.list("ai_selection")).find(
        (item) =>
          item.scope === data.scope &&
          item.harness === data.harness &&
          item.thread_id === data.thread_id &&
          item.agent_id === data.agent_id &&
          (data.scope === "organization" ? item.actor_id === null : item.actor_id === scope.userId),
      );
      const now = new Date().toISOString();
      return store.put(
        {
          ...data,
          id: previous?.id ?? crypto.randomUUID(),
          kind: "ai_selection",
          owner_id: store.ownerId,
          revision: (previous?.revision ?? 0) + 1,
          created_at: previous?.created_at ?? now,
          updated_at: now,
        },
        previous?.revision ?? null,
      );
    });
  }
  async resolveSelection(
    agent: Entity<"agent">,
    threadId: string,
  ): Promise<ProviderSelection | null> {
    const store = this.lifecycle.store;
    if (!store.dataContext) return null;
    const rows = await store.list("ai_selection");
    const personal = rows.filter(
      (row) => row.actor_id === store.dataContext?.userId && row.harness === agent.harness,
    );
    const selected = [
      personal.find(
        (row) =>
          row.scope === "conversation" && row.thread_id === threadId && row.agent_id === agent.id,
      ),
      personal.find((row) => row.scope === "user"),
      rows.find((row) => row.scope === "organization" && row.harness === agent.harness),
    ].find((row) => row?.selection !== null && row?.selection !== undefined)?.selection;
    if (!selected) return null;
    // A selected but unavailable account never proceeds to the next default.
    const connection = await this.get(selected.connection_id);
    await this.authorize(connection);
    if (connection.harness !== agent.harness) throw new HarnessError("MODEL_UNAVAILABLE");
    const model = connection.models.find((model) => model.id === selected.model_id);
    if (
      connection.discovery === "succeeded" &&
      (!model || (selected.reasoning !== null && !model.reasoning.includes(selected.reasoning)))
    )
      throw new HarnessError("MODEL_UNAVAILABLE");
    return {
      ...selected,
      harness: connection.harness,
      connection_generation: connection.grant_revision,
      provider_id: connectionProvider(connection.harness, connection.provider_id),
      account_id: connection.account_id,
      billing_source: connection.authentication.billing_source,
    };
  }
  async forAgent(agentId: string, threadId?: string) {
    const agent = threadId
      ? await this.lifecycle.executionAgent(threadId, agentId)
      : await this.lifecycle.store.get("agent", agentId);
    const connection = await this.get(agent.connection_id);
    await this.authorize(connection);
    if (threadId && this.lifecycle.store.dataContext) {
      const work = (
        await this.lifecycle.store.list("run", { thread_id: threadId, agent_id: agentId })
      ).filter((run) =>
        ["queued", "dispatching", "running", "cancel_requested", "unknown"].includes(run.status),
      );
      const selected =
        work.find((run) => run.status !== "queued")?.provider_selection ??
        work[0]?.provider_selection;
      if (selected) {
        if (
          selected.connection_id !== connection.id ||
          selected.connection_generation !== connection.grant_revision ||
          selected.account_id !== connection.account_id ||
          connectionProvider(selected.harness, selected.provider_id) !==
            connectionProvider(connection.harness, connection.provider_id) ||
          selected.harness !== connection.harness ||
          selected.billing_source !== connection.authentication.billing_source
        )
          throw new DomainError("STALE_DISPATCH");
        if (
          connection.login !== "authenticated" ||
          (!selected.account_id && connection.authentication.method !== "none")
        )
          throw new HarnessError("LOGIN_REQUIRED");
        if (connection.effective_billing_source !== selected.billing_source)
          throw new HarnessError("BILLING_MISMATCH");
      }
    }
    if (
      connection.state !== "active" ||
      connection.harness !== agent.harness ||
      (agent.billing_source !== null &&
        connection.authentication.billing_source !== agent.billing_source)
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return { agent, connection };
  }
}
