import type { AccountService } from "./accounts";
import type { Connections } from "./connections";
import { type LocalProfiles, localHarness } from "./local-profile";
import type { HarnessDetector } from "./runtime";

export class LocalAccounts {
  readonly #pending = new Map<string, ReturnType<LocalAccounts["sync"]>>();

  constructor(
    private readonly profiles: LocalProfiles,
    private readonly connections: Connections,
    private readonly accounts: AccountService,
    private readonly detect: HarnessDetector,
  ) {}

  refresh() {
    const store = this.connections.lifecycle.store;
    const scope = store.dataContext;
    const key = JSON.stringify([scope?.organizationId, scope?.userId ?? store.ownerId]);
    const current = this.#pending.get(key);
    if (current) return current;
    const work = this.sync().finally(() => this.#pending.delete(key));
    this.#pending.set(key, work);
    return work;
  }

  private async sync() {
    const store = this.connections.lifecycle.store;
    const all = await store.list("connection");
    const manualFree = all.some(
      (item) =>
        item.authentication.method === "none" &&
        item.ownership === "personal" &&
        item.actor_id === (store.dataContext?.userId ?? null) &&
        item.state === "active",
    );
    const existing = all.filter(
      (item) =>
        item.authentication.method === "local_config" &&
        item.authentication.device_id === this.profiles.deviceId &&
        item.ownership === "personal",
    );
    await Promise.all(
      localHarness.options.map(async (harness) => {
        const available = (await this.detect(harness)).state === "supported";
        const configured = available ? this.profiles.read(harness) : null;
        const saved = existing.filter((item) => item.harness === harness);
        const free =
          available &&
          harness === "opencode" &&
          (!manualFree || saved.some((item) => item.provider_id === "opencode")) &&
          this.profiles.openCodeFreeEnabled();
        const providers = new Set([
          ...(configured?.keys() ?? []),
          ...(free ? ["opencode"] : []),
          ...saved.map((item) => item.provider_id),
        ]);
        for (const provider of providers) {
          if (!provider) continue;
          await store.validateDataContext();
          let connection = saved.find((item) => item.provider_id === provider);
          if (connection?.state === "revoked") continue;
          if (configured?.has(provider) || (free && provider === "opencode")) {
            connection ??= await this.connections.create({
              harness,
              provider_id: provider,
              authentication: {
                method: "local_config",
                billing_source: provider === "opencode" ? "free" : "api_key",
                device_id: this.profiles.deviceId,
              },
            });
            try {
              connection = await this.accounts.inspect(connection.id);
              if (connection.models.length) continue;
            } catch {
              connection = await this.connections.get(connection.id);
            }
          }
          if (connection?.state === "active")
            await this.connections.update(connection, {
              login: "required",
              effective_billing_source: "unknown",
              discovery: "failed",
              models: [],
            });
        }
      }),
    );
    return { available: true };
  }
}
