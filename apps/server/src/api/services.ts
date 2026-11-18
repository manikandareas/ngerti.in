import type { Authentication } from "../auth/service";
import type { AccountService } from "../harness/accounts";
import type { ApiKeyChecks } from "../harness/api-key-checks";
import type { detectHarness } from "../harness/availability";
import type { HarnessBroker } from "../harness/broker";
import type { Connections } from "../harness/connections";
import type { CredentialStorage } from "../harness/credential-storage";
import type { LocalAccounts } from "../harness/local-accounts";
import type { HarnessLoginReadiness } from "../harness/login-readiness";
import type { ProductTools } from "../harness/tools";
import type { HarnessUpdater } from "../harness/updater";
import type { createCommand } from "./http";

export type Command = ReturnType<typeof createCommand>;
export type ApiServices = {
  authentication: Authentication;
  connections: Connections;
  tools: ProductTools;
  detect?: typeof detectHarness;
  updater?: HarnessUpdater;
  loginReadiness?: HarnessLoginReadiness;
  broker?: HarnessBroker;
  accounts?: AccountService;
  credentialStorage?: CredentialStorage;
  apiKeyChecks?: ApiKeyChecks;
  localAccounts?: LocalAccounts;
};
