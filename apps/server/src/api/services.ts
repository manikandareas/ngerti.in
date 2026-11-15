import type { Authentication } from "../auth/service";
import type { AccountService } from "../harness/accounts";
import type { detectHarness } from "../harness/availability";
import type { HarnessBroker } from "../harness/broker";
import type { Connections } from "../harness/connections";
import type { CredentialStorage } from "../harness/credential-storage";
import type { ProductTools } from "../harness/tools";
import type { createCommand } from "./http";

export type Command = ReturnType<typeof createCommand>;
export type ApiServices = {
  authentication: Authentication;
  connections: Connections;
  tools: ProductTools;
  detect?: typeof detectHarness;
  broker?: HarnessBroker;
  accounts?: AccountService;
  credentialStorage?: CredentialStorage;
};
