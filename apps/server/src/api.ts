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
import { registerMachineRoutes } from "./api/machines";
import { registerRunRoutes } from "./api/runs";
import type { ApiServices } from "./api/services";
import { registerWorkspaceRoutes } from "./api/workspaces";
import { routeAccess } from "./api-access";
import { consumerContract, httpContract } from "./api-contract";
import { authenticationContract } from "./auth/contracts";
import { registerAuthenticationRoutes } from "./auth/http";
import type { Background } from "./background";
import { API_READINESS_GATE, CONTRACT_VERSION, contractDocument, DomainError } from "./contracts";
import { detectHarness } from "./harness/availability";
import { Connections } from "./harness/connections";
import { CredentialStorage } from "./harness/credential-storage";
import { ProductTools } from "./harness/tools";
import type { Lifecycle } from "./lifecycle";
import { MachineViewGateway } from "./machines/view-gateway";
import { organizationsContract } from "./organizations/contracts";
import { ScopedData } from "./organizations/data";
import { scopedDataContract } from "./organizations/data-contracts";
import { registerOrganizationRoutes } from "./organizations/http";
import { Organizations } from "./organizations/service";

export async function createApi(
  lifecycle: Lifecycle,
  background: Background,
  token: string,
  services?: ApiServices,
) {
  services ??= {
    connections: new Connections(lifecycle),
    tools: await ProductTools.open(lifecycle),
    credentialStorage: new CredentialStorage(dirname(lifecycle.store.path)),
  };
  if (token.length < 32) throw new Error("A private development token is required.");
  const scoped = services.authentication
    ? new ScopedData(lifecycle, services.authentication)
    : undefined;
  const command = createCommand(lifecycle, services.authentication);
  const views = services.tools.machines ? new MachineViewGateway(lifecycle) : undefined;
  const api = await createHttp(
    token,
    services.tools,
    views ? async (request) => await views.authorize(request) : undefined,
    services.authentication,
    scoped,
  );
  if (services.authentication) {
    registerAuthenticationRoutes(api, services.authentication);
    registerOrganizationRoutes(api, new Organizations(services.authentication));
    scoped?.register(api);
  }
  api
    .get("/health/ready", async () => {
      try {
        await lifecycle.store.assertAuthority();
      } catch {
        throw new DomainError("STALE_DISPATCH", 503);
      }
      return {
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
      };
    })
    .get("/v1/contracts", () => ({
      ...contractDocument(),
      ...consumerContract(services.tools.machines !== undefined),
      http: httpContract(api.routes, Boolean(services.authentication)),
      ...(services.authentication
        ? {
            authentication: authenticationContract(services.authentication.config.origin),
            organizations: organizationsContract(),
            scoped_data: scopedDataContract(),
            access_model: {
              version: "nma-079.1",
              classes: [
                "public",
                "authentication_protocol",
                "operator",
                "bootstrap_owner_session",
                "user",
                "run_lease",
                "ticket",
              ],
              operator: "local_cli_only_no_http_elevation",
              database: "transaction_local_non_owner_non_superuser_non_bypassrls_role",
              entity_policy: "organization_and_actor_rls_with_explicit_published_resource_grants",
              tool_policy: "server_derived_run_lease_and_current_resource_authorization",
              surfaces: api.routes.map(({ method, path }) => ({
                method,
                path,
                ...routeAccess(path),
              })),
              entities: Object.fromEntries(
                Object.keys(contractDocument().entities).map((kind) => [
                  kind,
                  {
                    scope: "organization_and_actor",
                    sharing: [
                      "agent",
                      "published_knowledge",
                      "connection",
                      "ai_selection",
                      "app_connection",
                      "skill",
                      "skill_revision",
                      "skill_assignment",
                    ].includes(kind)
                      ? "explicit_published_configuration_or_current_resource_grant"
                      : "private",
                    reads: "same_rls_for_entity_list_detail_references_and_event_projection",
                  },
                ]),
              ),
              commands: Object.keys(contractDocument().commands),
              tools: consumerContract(services.tools.machines !== undefined).product_tools.map(
                (tool) => tool.name,
              ),
              events: "commit_ordered_actor_and_grant_filtered_signed_context_cursors",
              viewers: "issuing_user_device_domain_generation_and_input_lease",
              privileged_boundaries: [
                "authentication_and_organization_metadata",
                "schema_migration_and_offline_import",
                "guarded_legacy_binding",
                "bounded_team_and_connection_grant_lookup",
                "exact_reserved_app_effect_settlement",
                "exact_reserved_scoped_run_stop_and_settlement",
              ],
            },
          }
        : {}),
    }));
  await registerConversationRoutes(api, lifecycle, command);
  await registerIntegrationRoutes(api, lifecycle, services, command);
  await registerHarnessRoutes(api, services, command);
  await registerEventRoutes(api, lifecycle, services.authentication);
  await registerLearningRoutes(api, lifecycle, command);
  await registerGroupRoutes(api, lifecycle, background, command);
  await registerGoalRoutes(api, lifecycle, background, command);
  await registerWorkspaceRoutes(api, lifecycle, background, command);
  await registerAttachmentRoutes(api, lifecycle);
  await registerBrowserRoutes(api, services, command);
  if (services.tools.machines && views)
    await registerMachineRoutes(api, lifecycle, views, services.authentication);
  await registerRunRoutes(api, lifecycle, background, services, command);
  // Abort upstream streaming bodies before Bun waits for the HTTP server to drain.
  const stop = api.stop.bind(api);
  api.stop = async (closeActiveConnections) => {
    await views?.close();
    return api.server ? stop(closeActiveConnections) : api;
  };
  return scoped ? scoped.wrap(api) : api;
}
