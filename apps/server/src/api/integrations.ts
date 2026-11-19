import type { Elysia } from "elysia";
import { z } from "zod";
import { id } from "../contracts";
import { appAssignment, appAuthorize, appSearch } from "../integrations/contracts";
import type { Lifecycle } from "../lifecycle";
import type { ApiServices, Command } from "./services";

export function registerIntegrationRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  services: ApiServices,
  command: Command,
) {
  const applications = services.tools.applications;
  return api
    .get(
      "/v1/apps/catalog",
      ({ query }) => applications.catalog(query.search ?? "", query.cursor),
      {
        query: z.object({
          search: z.string().max(100).optional(),
          cursor: z.string().max(500).optional(),
        }),
      },
    )
    .get("/v1/apps/managed-connectors", () => applications.managedCatalog())
    .get("/v1/apps/connections", async () => await applications.list())
    .post(
      "/v1/apps/connect",
      async ({ body }) =>
        applications.connect(body.toolkit, undefined, body.ownership, body.audience_id),
      {
        body: appAuthorize,
      },
    )
    .post(
      "/v1/apps/connections/:id/reconnect",
      async ({ params }) => {
        const connection = await lifecycle.store.get("app_connection", params.id);
        return applications.connect(connection.toolkit, connection.id);
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/apps/connections/:id/refresh",
      async ({ params }) => applications.refresh(params.id),
      {
        params: z.object({ id }),
        body: z.strictObject({}),
      },
    )
    .post(
      "/v1/apps/connections/:id/revoke",
      async ({ request, params, body }) =>
        await command(request, body, async () => await applications.revoke(params.id)),
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/apps/connections/:id/assign",
      async ({ request, params, body }) =>
        await command(request, body, async () => await applications.assign(params.id, body)),
      { params: z.object({ id }), body: appAssignment },
    )
    .post("/v1/apps/search", async ({ body }) => applications.search(body), { body: appSearch });
}
