import type { Entity } from "../contracts";
import type { Connections } from "./connections";
import { HarnessError } from "./contracts";

export interface AccountService {
  inspect(connectionId: string): Promise<Entity<"connection">>;
  login(connectionId: string): Promise<unknown>;
  cancel(connectionId: string): Promise<void>;
}
/** Account operations follow the selected connection; they never select a fallback provider. */
export class HarnessAccounts implements AccountService {
  constructor(
    private readonly connections: Connections,
    private readonly services: Partial<Record<"codex" | "muse", AccountService>>,
  ) {}
  private service(id: string) {
    const service = this.services[this.connections.get(id).harness];
    if (!service) throw new HarnessError("ADAPTER_UNAVAILABLE");
    return service;
  }
  inspect(id: string) {
    return this.service(id).inspect(id);
  }
  login(id: string) {
    return this.service(id).login(id);
  }
  cancel(id: string) {
    return this.service(id).cancel(id);
  }
}
