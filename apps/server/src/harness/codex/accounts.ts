import { join } from "node:path";
import { z } from "zod";
import { DomainError } from "../../contracts";
import { detectHarness, requireAvailable } from "../availability";
import type { Connections } from "../connections";
import type { CredentialContexts } from "../context";
import { HarnessError } from "../contracts";
import { CodexClient } from "./client";

/** Account operations have their own short-lived client; prompts use separate lane clients. */
export class CodexAccounts {
  readonly #starting = new Set<string>();
  readonly #clients = new Set<CodexClient>();
  #closed = false;
  readonly #logins = new Map<
    string,
    { client: CodexClient; login_id: string; timer: ReturnType<typeof setTimeout> }
  >();
  constructor(
    readonly connections: Connections,
    readonly credentials: CredentialContexts,
    private readonly detect = async () => detectHarness("codex"),
  ) {}
  private async client(connectionId: string) {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const connection = await this.connections.get(connectionId);
    if (connection.harness !== "codex" || connection.state !== "active")
      throw new DomainError("SCOPE_DENIED", 403);
    const available = requireAvailable(await this.detect());
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const launch = this.credentials.create(connection);
    const client = new CodexClient(
      available.executable as string,
      launch,
      join(launch.state_directory, "account-workspace"),
      () => {
        throw new HarnessError("NATIVE_REJECTED");
      },
    );
    this.#clients.add(client);
    try {
      await client.initialize();
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      return client;
    } catch (error) {
      await this.release(client);
      throw error;
    }
  }
  private async release(client: CodexClient) {
    this.#clients.delete(client);
    await client.close();
  }
  async inspect(connectionId: string) {
    const client = await this.client(connectionId);
    try {
      const observed = await client.inspect();
      let current = await this.connections.get(connectionId);
      if (this.#closed || current.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
      current = await this.connections.update(current, {
        login: observed.login,
        effective_billing_source:
          observed.login === "authenticated" ? observed.billing_source : "unknown",
        account_id: observed.account_id,
        capabilities: observed.capabilities,
      });
      if (observed.login !== "authenticated") return current;
      try {
        const models = await client.discoverModels();
        current = await this.connections.get(connectionId);
        if (this.#closed || current.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
        return await this.connections.update(current, { models, discovery: "succeeded" });
      } catch (error) {
        const latest = await this.connections.get(connectionId);
        if (!this.#closed && latest.state === "active")
          await this.connections.update(latest, { discovery: "failed" });
        throw error;
      }
    } finally {
      await this.release(client);
    }
  }
  async login(connectionId: string) {
    if ((await this.connections.get(connectionId)).authentication.method !== "native_login")
      throw new HarnessError("BILLING_MISMATCH");
    if (this.#logins.has(connectionId) || this.#starting.has(connectionId))
      throw new DomainError("CONFLICT");
    this.#starting.add(connectionId);
    let client: CodexClient | undefined;
    try {
      client = await this.client(connectionId);
      const login = z
        .object({ type: z.literal("chatgpt"), loginId: z.string(), authUrl: z.url() })
        .parse(await client.rpc.request("account/login/start", { type: "chatgpt" }));
      if (this.#closed || (await this.connections.get(connectionId)).state !== "active")
        throw new DomainError("SCOPE_DENIED", 403);
      const timer = setTimeout(() => {
        void this.cancel(connectionId).catch(() => {});
      }, 10 * 60_000);
      this.#logins.set(connectionId, { client, login_id: login.loginId, timer });
      return { login_id: login.loginId, auth_url: login.authUrl, expires_in_seconds: 600 };
    } catch (error) {
      if (client) await this.release(client);
      throw error;
    } finally {
      this.#starting.delete(connectionId);
    }
  }
  async cancel(connectionId: string) {
    const login = this.#logins.get(connectionId);
    if (!login) return;
    this.#logins.delete(connectionId);
    clearTimeout(login.timer);
    try {
      await login.client.rpc.request("account/login/cancel", { loginId: login.login_id });
    } finally {
      await this.release(login.client);
    }
  }
  async close() {
    this.#closed = true;
    for (const login of this.#logins.values()) clearTimeout(login.timer);
    this.#logins.clear();
    await Promise.allSettled([...this.#clients].map(async (client) => this.release(client)));
  }
}
