import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { DomainError } from "../../contracts";
import { detectHarness, requireAvailable, versionState } from "../availability";
import type { Connections } from "../connections";
import type { CredentialContexts } from "../context";
import { HarnessError } from "../contracts";
import { CodexClient } from "./client";

type AccountTokens = { accessToken: string; chatgptAccountId: string; chatgptPlanType?: string };

/** One managed credential authority per connection; actor sessions receive only short-lived access tokens. */
export class CodexAccounts {
  readonly #authorities = new Map<string, Promise<CodexClient>>();
  readonly #tokenRefresh = new Map<string, { refresh: boolean; promise: Promise<AccountTokens> }>();
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
    private readonly args: string[] = [],
  ) {
    credentials.codexTokens = (id, refresh) => this.tokens(id, refresh);
  }
  private async client(connectionId: string): Promise<CodexClient> {
    const current = await this.connections.get(connectionId);
    if (this.#closed || current.state !== "active") throw new DomainError("SCOPE_DENIED", 403);
    let pending = this.#authorities.get(connectionId);
    if (!pending) {
      pending = this.createClient(connectionId).catch((error) => {
        this.#authorities.delete(connectionId);
        throw error;
      });
      this.#authorities.set(connectionId, pending);
    }
    const client = await pending;
    if (
      client.rpc.process.child.exitCode !== null &&
      this.#authorities.get(connectionId) === pending
    ) {
      this.#authorities.delete(connectionId);
      this.#clients.delete(client);
      await client.close();
      return this.client(connectionId);
    }
    return client;
  }
  private async createClient(connectionId: string) {
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const connection = await this.connections.get(connectionId);
    if (connection.harness !== "codex" || connection.state !== "active")
      throw new DomainError("SCOPE_DENIED", 403);
    const available = requireAvailable(await this.detect());
    if (
      this.connections.lifecycle.store.dataContext &&
      (!available.version || versionState(available.version, "0.169.0").state !== "supported")
    )
      throw new HarnessError("VERSION_TOO_OLD");
    if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
    const launch = this.credentials.create(connection);
    const client = new CodexClient(
      available.executable as string,
      launch,
      join(launch.state_directory, "account-workspace"),
      () => {
        throw new HarnessError("NATIVE_REJECTED");
      },
      "",
      this.args,
    );
    const receive = client.rpc.onMessage;
    client.rpc.onMessage = (message) => {
      receive(message);
      if (message.method === "account/login/completed") {
        const pending = this.#logins.get(connectionId);
        if (
          pending &&
          pending.login_id === (message.params as { loginId?: string } | undefined)?.loginId
        ) {
          clearTimeout(pending.timer);
          this.#logins.delete(connectionId);
        }
      }
    };
    this.#clients.add(client);
    try {
      await client.initialize();
      if (this.#closed) throw new HarnessError("ADAPTER_UNAVAILABLE");
      return client;
    } catch (error) {
      this.#clients.delete(client);
      await client.close();
      throw error;
    }
  }
  private async release(client: CodexClient) {
    if (this.#closed) {
      this.#clients.delete(client);
      await client.close();
    }
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
        account_plan: observed.account_plan ?? null,
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
  async login(connectionId: string, mode?: "browser" | "device") {
    if (
      this.connections.lifecycle.store.dataContext &&
      process.env.NGERTIIN_PROVIDER_NATIVE_STORAGE !== "encrypted-volume"
    )
      throw new HarnessError("CAPABILITY_UNSUPPORTED");
    if ((await this.connections.get(connectionId)).authentication.method !== "native_login")
      throw new HarnessError("BILLING_MISMATCH");
    if (this.#logins.has(connectionId) || this.#starting.has(connectionId))
      throw new DomainError("CONFLICT");
    this.#starting.add(connectionId);
    let client: CodexClient | undefined;
    try {
      client = await this.client(connectionId);
      const remote =
        mode === "device" || (mode !== "browser" && !!this.connections.lifecycle.store.dataContext);
      const login = z
        .discriminatedUnion("type", [
          z.object({ type: z.literal("chatgpt"), loginId: z.string(), authUrl: z.url() }),
          z.object({
            type: z.literal("chatgptDeviceCode"),
            loginId: z.string(),
            verificationUrl: z.url(),
            userCode: z.string(),
          }),
        ])
        .parse(
          await client.rpc.request("account/login/start", {
            type: remote ? "chatgptDeviceCode" : "chatgpt",
          }),
        );
      if (this.#closed || (await this.connections.get(connectionId)).state !== "active")
        throw new DomainError("SCOPE_DENIED", 403);
      const timer = setTimeout(() => {
        void this.cancel(connectionId).catch(() => {});
      }, 10 * 60_000);
      this.#logins.set(connectionId, { client, login_id: login.loginId, timer });
      return login.type === "chatgptDeviceCode"
        ? {
            login_id: login.loginId,
            auth_url: login.verificationUrl,
            user_code: login.userCode,
            expires_in_seconds: 600,
          }
        : { login_id: login.loginId, auth_url: login.authUrl, expires_in_seconds: 600 };
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
  async tokens(connectionId: string, refresh = false): Promise<AccountTokens> {
    // Register before any consumer's asynchronous permission check. Otherwise a fast
    // refresh can finish while another already-arrived consumer is still validating.
    let pending = this.#tokenRefresh.get(connectionId);
    if (!pending) {
      const operation = this.readTokens(connectionId, refresh).finally(() =>
        this.#tokenRefresh.delete(connectionId),
      );
      // readTokens performs its own authorization before native access. A denied
      // consumer may exit before awaiting the shared operation; retain no rejection leak.
      void operation.catch(() => {});
      pending = { refresh, promise: operation };
      this.#tokenRefresh.set(connectionId, pending);
    }
    const initial = await this.connections.get(connectionId);
    await this.connections.authorize(initial);
    if (pending && refresh && !pending.refresh) {
      await pending.promise;
      return this.tokens(connectionId, true);
    }
    const tokens = await pending.promise;
    const latest = await this.connections.get(connectionId);
    await this.connections.authorize(latest);
    if (latest.grant_revision !== initial.grant_revision) throw new HarnessError("AUTH_REJECTED");
    return tokens;
  }
  private async readTokens(connectionId: string, refresh: boolean) {
    const initial = await this.connections.get(connectionId);
    await this.connections.authorize(initial);
    if (initial.authentication.method !== "native_login" || this.#starting.has(connectionId))
      throw new HarnessError("LOGIN_REQUIRED");
    const client = await this.client(connectionId);
    await client.rpc.request("account/read", { refreshToken: refresh });
    const file = join(this.credentials.root, "connections", connectionId, "codex", "auth.json");
    const info = lstatSync(file);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0 || info.size > 65536)
      throw new HarnessError("CREDENTIAL_MISSING");
    const stored = z
      .object({
        tokens: z.object({ access_token: z.string().min(1), account_id: z.string().min(1) }),
      })
      .parse(JSON.parse(readFileSync(file, "utf8")));
    const latest = await this.connections.get(connectionId);
    await this.connections.authorize(latest);
    if (
      latest.grant_revision !== initial.grant_revision ||
      !latest.account_id ||
      createHash("sha256").update(stored.tokens.account_id).digest("hex") !== latest.account_id
    )
      throw new HarnessError("AUTH_REJECTED");
    return {
      accessToken: stored.tokens.access_token,
      chatgptAccountId: stored.tokens.account_id,
      ...(latest.account_plan ? { chatgptPlanType: latest.account_plan } : {}),
    };
  }
  async retire(connectionId: string) {
    const pending = this.#authorities.get(connectionId);
    this.#authorities.delete(connectionId);
    const login = this.#logins.get(connectionId);
    if (login) clearTimeout(login.timer);
    this.#logins.delete(connectionId);
    const client = await pending;
    if (client) {
      this.#clients.delete(client);
      await client.close();
    }
  }
  async close() {
    this.#closed = true;
    for (const login of this.#logins.values()) clearTimeout(login.timer);
    this.#logins.clear();
    await Promise.allSettled([...this.#clients].map(async (client) => this.release(client)));
  }
}
