import type { Entity } from "../contracts";
import type { HarnessId } from "./availability";
import type { Connections } from "./connections";
import { HarnessError } from "./contracts";

export interface AccountService {
  close?(): Promise<unknown>;
  retire?(connectionId: string): Promise<void>;
  inspect(connectionId: string): Promise<Entity<"connection">>;
  login(connectionId: string): Promise<unknown>;
  cancel(connectionId: string): Promise<void>;
}
/** Account operations follow the selected connection; they never select a fallback provider. */
export class HarnessAccounts implements AccountService {
  constructor(
    private readonly connections: Connections,
    private readonly services: Partial<Record<HarnessId, AccountService>>,
    private readonly localCodex?: AccountService,
  ) {}
  private async service(id: string) {
    const connection = await this.connections.get(id);
    const service =
      connection.harness === "codex" && connection.authentication.method === "local_config"
        ? this.localCodex
        : this.services[connection.harness];
    if (!service) throw new HarnessError("ADAPTER_UNAVAILABLE");
    return service;
  }
  async retire(id: string) {
    await (await this.service(id)).retire?.(id);
  }
  async inspect(id: string) {
    return (await this.service(id)).inspect(id);
  }
  async login(id: string) {
    return (await this.service(id)).login(id);
  }
  async cancel(id: string) {
    return (await this.service(id)).cancel(id);
  }
  async close() {
    await Promise.allSettled(
      [...Object.values(this.services), this.localCodex].map((service) => service?.close?.()),
    );
  }
}
