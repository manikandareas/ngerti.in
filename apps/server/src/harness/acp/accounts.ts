import { join } from "node:path";
import { DomainError } from "../../contracts";
import type { AccountService } from "../accounts";
import { requireAvailable } from "../availability";
import type { HarnessAdapter, HarnessClient } from "../client";
import type { Connections } from "../connections";
import type { CredentialContexts } from "../context";
import { HarnessError } from "../contracts";
import type { HarnessDetector } from "../runtime";

/** Shared key-account inspection. Authentication stays selected and cannot be inferred from chat output. */
export class AcpAccounts implements AccountService {
  readonly #work = new Map<
    string,
    Set<{ controller: AbortController; done: Promise<unknown>; client?: HarnessClient }>
  >();
  #closed = false;
  constructor(
    readonly connections: Connections,
    readonly credentials: CredentialContexts,
    private readonly adapter: HarnessAdapter,
    private readonly detect: HarnessDetector,
  ) {}

  async inspect(id: string) {
    const selected = await this.connections.get(id);
    if (this.#closed || selected.state !== "active" || selected.harness !== this.adapter.harness)
      throw new DomainError("SCOPE_DENIED", 403);
    if (selected.authentication.method === "native_login")
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    const controller = new AbortController();
    const current = async (generation: number) => {
      const connection = await this.connections.get(id);
      if (
        this.#closed ||
        controller.signal.aborted ||
        connection.state !== "active" ||
        connection.grant_revision !== generation
      )
        throw new DomainError("SCOPE_DENIED", 403);
      return connection;
    };
    const entry: { controller: AbortController; done: Promise<unknown>; client?: HarnessClient } = {
      controller,
      done: Promise.resolve(),
    };
    const work = (async () => {
      let client: HarnessClient | undefined;
      try {
        const available = requireAvailable(await this.detect(selected.harness));
        await current(selected.grant_revision);
        const launch = this.credentials.create(selected);
        client = await this.adapter.connect({
          ...launch,
          scoped: true,
          signal: controller.signal,
          purpose: "routing",
          executable: available.executable as string,
          connection_id: id,
          agent_id: selected.id,
          thread_id: selected.id,
          workspace: {
            id: selected.id,
            root: join(launch.state_directory, "account-control"),
            revision: 1,
          },
        });
        entry.client = client;
        const observed = await client.inspect();
        let connection = await current(selected.grant_revision);
        if (
          observed.auth_method !== selected.authentication.method ||
          observed.billing_source !== selected.authentication.billing_source
        )
          throw new HarnessError("BILLING_MISMATCH");
        connection = await this.connections.update(connection, {
          login: observed.login,
          account_id: observed.account_id,
          account_plan: observed.account_plan ?? null,
          effective_billing_source:
            observed.login === "authenticated" ? observed.billing_source : "unknown",
          capabilities: observed.capabilities,
        });
        if (observed.login !== "authenticated") return connection;
        try {
          const models = await client.discoverModels();
          return await this.connections.update(await current(connection.grant_revision), {
            discovery: "succeeded",
            models,
          });
        } catch (error) {
          await this.connections.update(await current(connection.grant_revision), {
            discovery: "failed",
          });
          throw error;
        }
      } finally {
        await client?.close();
      }
    })();
    entry.done = work;
    const pending = this.#work.get(id) ?? new Set();
    pending.add(entry);
    this.#work.set(id, pending);
    try {
      return await work;
    } finally {
      pending.delete(entry);
      if (!pending.size) this.#work.delete(id);
    }
  }

  async login(_id: string): Promise<never> {
    throw new HarnessError("CAPABILITY_UNSUPPORTED");
  }
  async retire(id: string) {
    const pending = [...(this.#work.get(id) ?? [])];
    for (const entry of pending) entry.controller.abort();
    await Promise.allSettled(pending.map((entry) => entry.done));
    // Inspection may reject because revocation is expected. Owned-process cleanup must still succeed.
    await Promise.all(pending.map((entry) => entry.client?.close()));
  }
  async cancel(id: string) {
    await this.retire(id);
  }
  async close() {
    this.#closed = true;
    await Promise.all([...this.#work.keys()].map((id) => this.retire(id)));
  }
}
