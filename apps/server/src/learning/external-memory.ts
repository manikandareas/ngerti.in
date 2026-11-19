import { createHmac } from "node:crypto";
import { DomainError, type Entity } from "../contracts";
import type { ToolAccess } from "../harness/tools";
import {
  externalMemoryChange,
  externalMemoryMatches,
  externalMemoryQuery,
  type MemoryBackend,
} from "./external-memory-contracts";
import { LearningScope } from "./scope";

export class ExternalMemory extends LearningScope {
  private async actor() {
    const store = this.lifecycle.store;
    const actor = store.dataContext;
    if (!actor) throw new DomainError("SCOPE_DENIED", 403);
    await store.validateDataContext(true);
    return actor;
  }

  private async connection() {
    const actor = await this.actor();
    return (await this.lifecycle.store.list("external_memory_connection")).find(
      (item) => item.actor_id === actor.userId && item.organization_id === actor.organizationId,
    );
  }

  async status(connection?: Entity<"external_memory_connection">) {
    const current = connection ?? (await this.connection());
    return {
      backend_id: current?.backend_id ?? null,
      revision: current?.revision ?? 0,
      options: this.lifecycle.memoryBackends.map(({ id, label }) => ({ id, label })),
    };
  }

  async change(raw: unknown) {
    const { backend_id, expected_revision } = externalMemoryChange.parse(raw);
    const actor = await this.actor();
    if (
      backend_id !== null &&
      !this.lifecycle.memoryBackends.some((item) => item.id === backend_id)
    )
      throw new DomainError("NOT_FOUND", 404);
    const store = this.lifecycle.store;
    await store.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      JSON.stringify(["external-memory", actor.organizationId, actor.userId]),
    ]);
    const current = await this.connection();
    if (expected_revision !== (current?.revision ?? 0)) throw new DomainError("CONFLICT");
    if (backend_id === (current?.backend_id ?? null)) return await this.status(current);
    return await this.status(
      current
        ? await this.update(current, { backend_id })
        : await store.put({ ...this.base(), kind: "external_memory_connection", backend_id }),
    );
  }

  async recall(raw: unknown, { scope, authorize }: ToolAccess) {
    const { query } = externalMemoryQuery.parse(raw);
    const actor = await this.actor();
    const current = await this.connection();
    const backend = this.lifecycle.memoryBackends.find((item) => item.id === current?.backend_id);
    if (!current || !backend)
      return { status: current?.backend_id ? "unavailable" : "disconnected", memories: [] };
    const store = this.lifecycle.store;
    const run = await store.get("run", scope.run_id);
    const input = await store.get("message", run.input_message_id);
    if (input.author !== "user" || !input.text.toLowerCase().includes(query.toLowerCase()))
      throw new DomainError("INVALID_REQUEST", 422);
    const namespace = createHmac("sha256", backend.namespace_key)
      .update(
        JSON.stringify([
          actor.organizationId,
          actor.userId,
          scope.agent_id,
          scope.thread_id,
          run.workspace_id,
        ]),
      )
      .digest("hex");
    const authorized = async () => {
      await authorize();
      const latest = await this.connection();
      return latest?.id === current.id && latest?.revision === current.revision;
    };
    if (!(await authorized())) return { status: "disconnected", memories: [] };
    const result = await retrieve(backend, namespace, query);
    if (!(await authorized())) return { status: "disconnected", memories: [] };
    return result ? { status: "ready", ...result } : { status: "unavailable", memories: [] };
  }
}

async function retrieve(backend: MemoryBackend, namespace: string, query: string) {
  try {
    const response = await fetch(backend.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(4000),
      headers: {
        authorization: `Bearer ${backend.access_token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ namespace, query }),
    });
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return null;
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    for await (const chunk of response.body) {
      length += chunk.byteLength;
      if (length > 64 * 1024) return null;
      chunks.push(chunk);
    }
    const data = externalMemoryMatches.parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    // Avoid disclosing a configured credential even if a provider echoes it in a record.
    return {
      memories: data.memories.filter(
        ({ text }) => !text.includes(backend.access_token) && !text.includes(backend.namespace_key),
      ),
    };
  } catch {
    return null;
  }
}
