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
    .get("/v1/apps/connections", () => applications.list())
    .post("/v1/apps/connect", ({ body }) => applications.connect(body.toolkit), {
      body: appAuthorize,
    })
    .post(
      "/v1/apps/connections/:id/reconnect",
      ({ params }) => {
        const connection = lifecycle.store.get("app_connection", params.id);
        return applications.connect(connection.toolkit, connection.id);
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post("/v1/apps/connections/:id/refresh", ({ params }) => applications.refresh(params.id), {
      params: z.object({ id }),
      body: z.strictObject({}),
    })
    .post(
      "/v1/apps/connections/:id/revoke",
      ({ request, params, body }) => command(request, body, () => applications.revoke(params.id)),
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/apps/connections/:id/assign",
      ({ request, params, body }) =>
        command(request, body, () => applications.assign(params.id, body)),
      { params: z.object({ id }), body: appAssignment },
    )
    .post("/v1/apps/search", ({ body }) => applications.search(body), { body: appSearch });
}
