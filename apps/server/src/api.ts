import { dirname } from "node:path";
import { registerAttachmentRoutes } from "./api/attachments";
import { registerBrowserRoutes } from "./api/browser";
import { registerConversationRoutes } from "./api/conversations";
import { registerEventRoutes } from "./api/events";
import { registerGoalRoutes } from "./api/goals";
import { registerGroupRoutes } from "./api/groups";
import { registerHarnessRoutes } from "./api/harness";
import { createCommand, createHttp } from "./api/http";
import { registerIntegrationRoutes } from "./api/integrations";
import { registerLearningRoutes } from "./api/learning";
import { registerRunRoutes } from "./api/runs";
import type { ApiServices } from "./api/services";
import { registerWorkspaceRoutes } from "./api/workspaces";
import { consumerContract, httpContract } from "./api-contract";
import type { Background } from "./background";
import { API_READINESS_GATE, CONTRACT_VERSION, contractDocument } from "./contracts";
import { detectHarness } from "./harness/availability";
import { Connections } from "./harness/connections";
import { CredentialStorage } from "./harness/credential-storage";
import { ProductTools } from "./harness/tools";
import type { Lifecycle } from "./lifecycle";

export function createApi(
  lifecycle: Lifecycle,
  background: Background,
  token: string,
  services: ApiServices = {
    connections: new Connections(lifecycle),
    tools: new ProductTools(lifecycle),
    credentialStorage: new CredentialStorage(dirname(lifecycle.store.path)),
  },
) {
  if (token.length < 32) throw new Error("A private development token is required.");
  const command = createCommand(lifecycle);
  const api = createHttp(token, services.tools);
  api
    .get("/health/ready", async () => ({
      status: "foundation_ready",
      contract_version: CONTRACT_VERSION,
      persistence: "ready",
      scheduler: "running",
      dispatcher: "running",
      registered_executors: background.executorCount,
      api_readiness_gate: API_READINESS_GATE,
      group_routing: lifecycle.groupRouter ? "jev" : "member",
      harnesses: await Promise.all(
        (["codex", "muse"] as const).map(async (id) => {
          const value = await (services.detect ?? detectHarness)(id);
          return {
            harness: id,
            state: value.state,
            version: value.version,
            executable: value.executable,
            minimum_version: value.manifest.minimum_version,
          };
        }),
      ),
    }))
    .get("/v1/contracts", () => ({
      ...contractDocument(),
      ...consumerContract(),
      http: httpContract(api.routes),
    }));
  registerConversationRoutes(api, lifecycle, command);
  registerIntegrationRoutes(api, lifecycle, services, command);
  registerHarnessRoutes(api, services, command);
  registerEventRoutes(api, lifecycle);
  registerLearningRoutes(api, lifecycle, command);
  registerGroupRoutes(api, lifecycle, background, command);
  registerGoalRoutes(api, lifecycle, background, command);
  registerWorkspaceRoutes(api, lifecycle, background, command);
  registerAttachmentRoutes(api, lifecycle);
  registerBrowserRoutes(api, services, command);
  registerRunRoutes(api, lifecycle, background, services, command);
  return api;
}
