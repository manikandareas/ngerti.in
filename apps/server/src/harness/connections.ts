import { DomainError, type Entity } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { canonical } from "../store";
import { connectionInput, unknownCapabilities } from "./contracts";

/** Secret-free connection projections share the application store, transactions and events. */
export class Connections {
  constructor(readonly lifecycle: Lifecycle) {}
  async get(id: string | null) {
    return await this.lifecycle.store.get("connection", id);
  }
  async create(input: unknown) {
    const data = connectionInput.parse(input);
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
        | "login"
        | "discovery"
        | "models"
        | "inference"
        | "capabilities"
        | "effective_billing_source"
      >
    >,
  ) {
    const grantChanged = Object.entries(changes).some(
      ([key, value]) =>
        key !== "inference" &&
        key !== "discovery" &&
        canonical(connection[key as keyof typeof connection]) !== canonical(value),
    );
    if (
      Object.entries(changes).every(
        ([key, value]) =>
          canonical(connection[key as keyof typeof connection]) === canonical(value),
      )
    )
      return connection;
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
    const current = await this.get(id);
    return current.state === "revoked" ? current : await this.update(current, { state: "revoked" });
  }
  async forAgent(agentId: string, threadId?: string) {
    const agent = threadId
      ? await this.lifecycle.executionAgent(threadId, agentId)
      : await this.lifecycle.store.get("agent", agentId);
    const connection = await this.get(agent.connection_id);
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
