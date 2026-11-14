import { join } from "node:path";
import { z } from "zod";
import { DomainError } from "../../contracts";
import type { AccountService } from "../accounts";
import { detectHarness, requireAvailable } from "../availability";
import type { Connections } from "../connections";
import type { CredentialContexts } from "../context";
import { HarnessError } from "../contracts";
import { MuseClient } from "./client";

export class MuseAccounts implements AccountService {
  readonly #clients = new Set<MuseClient>();
  readonly #clientConnections = new Map<MuseClient, string>();
  readonly #logins = new Map<
    string,
    { client: MuseClient; timer: ReturnType<typeof setTimeout> }
  >();
  readonly #starting = new Set<string>();
  #closed = false;
  constructor(
    readonly connections: Connections,
    readonly credentials: CredentialContexts,
    private readonly detect = async () => detectHarness("muse"),
    private readonly args: string[] = [],
  ) {}
  private async current(id: string, revision: number) {
    const connection = await this.connections.get(id);
    if (
      this.#closed ||
      connection.harness !== "muse" ||
      connection.state !== "active" ||
      connection.grant_revision !== revision
    )
      throw new DomainError("SCOPE_DENIED", 403);
    return connection;
  }
  private async client(id: string) {
    const connection = await this.connections.get(id);
    await this.current(id, connection.grant_revision);
    const available = requireAvailable(await this.detect());
    await this.current(id, connection.grant_revision);
    const launch = this.credentials.create(connection);
    const client = new MuseClient(
      available.executable as string,
      launch,
      join(launch.state_directory, "account-workspace"),
      () => {
        throw new HarnessError("NATIVE_REJECTED");
      },
      "",
      this.args,
    );
    this.#clients.add(client);
    this.#clientConnections.set(client, id);
    try {
      await client.initialize();
      await this.current(id, connection.grant_revision);
      return client;
    } catch (error) {
      await this.release(client);
      throw error;
    }
  }
  private async release(client: MuseClient) {
    this.#clients.delete(client);
    this.#clientConnections.delete(client);
    await client.close();
  }
  async inspect(id: string) {
    const revision = (await this.connections.get(id)).grant_revision;
    const client = await this.client(id);
    try {
      const observed = await client.inspect();
      const before = await this.current(id, revision);
      if (
        observed.auth_method !== before.authentication.method ||
        observed.billing_source !== before.authentication.billing_source
      )
        throw new HarnessError("BILLING_MISMATCH");
      let current = await this.connections.update(before, {
        login: observed.login,
        effective_billing_source:
          observed.login === "authenticated" ? observed.billing_source : "unknown",
        account_id: observed.account_id,
        capabilities: observed.capabilities,
      });
      if (observed.login !== "authenticated") return current;
      try {
        const models = await client.discoverModels();
        current = await this.current(id, current.grant_revision);
        return await this.connections.update(current, { models, discovery: "succeeded" });
      } catch (error) {
        current = await this.connections.get(id);
        if (!this.#closed && current.state === "active")
          await this.connections.update(current, { discovery: "failed" });
        throw error;
      }
    } catch (error) {
      const latest = await this.connections.get(id);
      if (
        !this.#closed &&
        latest.state === "active" &&
        error instanceof HarnessError &&
        error.code === "BILLING_MISMATCH"
      )
        await this.connections.update(latest, {
          login: "rejected",
          effective_billing_source: "unknown",
        });
      if (error instanceof z.ZodError) throw new HarnessError("PROTOCOL_ERROR");
      throw error;
    } finally {
      await this.release(client);
    }
  }
  async login(id: string) {
    const connection = await this.connections.get(id);
    if (connection.authentication.method !== "native_login")
      throw new HarnessError("BILLING_MISMATCH");
    if (this.#starting.has(id) || this.#logins.has(id)) throw new DomainError("CONFLICT");
    this.#starting.add(id);
    let client: MuseClient | undefined;
    try {
      client = await this.client(id);
      // The account host has no session. Claim notifications before starting the device flow.
      client.transport.connection.onNotification(async ({ method, params }) => {
        if (method !== "account/loginCompleted") return;
        const outcome = z.object({ outcome: z.string() }).safeParse(params);
        const latest = await this.connections.get(id);
        if (
          !this.#closed &&
          latest.state === "active" &&
          latest.grant_revision === connection.grant_revision &&
          outcome.success &&
          outcome.data.outcome !== "granted"
        )
          await this.connections.update(latest, { login: "rejected" });
        // A granted browser flow is not evidence of the effective billing lane or inference.
        void this.cancel(id).catch(() => {});
      });
      const held = client;
      const timer = setTimeout(() => void this.cancel(id).catch(() => {}), 600_000);
      this.#logins.set(id, { client: held, timer });
      const result = z
        .object({
          verificationUrl: z.url().refine((url) => new URL(url).protocol === "https:"),
          userCode: z.string().min(1).max(200),
        })
        .parse(await client.transport.read("account/loginStart", { type: "deviceCode" }));
      await this.current(id, connection.grant_revision);
      return {
        auth_url: result.verificationUrl,
        user_code: result.userCode,
        expires_in_seconds: 600,
      };
    } catch (error) {
      await this.cancel(id).catch(() => {});
      if (client) await this.release(client);
      throw error;
    } finally {
      this.#starting.delete(id);
    }
  }
  async cancel(id: string) {
    const pending = this.#logins.get(id);
    if (!pending) return;
    this.#logins.delete(id);
    clearTimeout(pending.timer);
    try {
      await pending.client.transport.read("account/loginCancel");
    } finally {
      await this.release(pending.client);
    }
  }
  async close() {
    this.#closed = true;
    await Promise.allSettled([...this.#logins.keys()].map(async (id) => this.cancel(id)));
    await Promise.allSettled([...this.#clients].map(async (client) => this.release(client)));
  }
  async retire(id: string) {
    await this.cancel(id);
    await Promise.all(
      [...this.#clientConnections]
        .filter(([, connection]) => connection === id)
        .map(([client]) => this.release(client)),
    );
  }
}
