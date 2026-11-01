import type { Elysia } from "elysia";
import { z } from "zod";
import { id } from "../contracts";
import { detectHarness } from "../harness/availability";
import { brokerContract, connectionInput, HarnessError } from "../harness/contracts";
import type { ApiServices, Command } from "./services";

export function registerHarnessRoutes(api: Elysia, services: ApiServices, command: Command) {
  return api
    .get("/v1/harness/contracts", () => brokerContract())
    .get("/v1/harnesses", async () =>
      Promise.all((["codex", "muse"] as const).map((id) => (services.detect ?? detectHarness)(id))),
    )
    .post(
      "/v1/connections",
      ({ request, body }) => command(request, body, () => services.connections.create(body)),
      { body: connectionInput },
    )
    .post(
      "/v1/connections/:id/revoke",
      ({ request, params }) => command(request, {}, () => services.connections.revoke(params.id)),
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/:id/inspect",
      ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.accounts.inspect(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/:id/login",
      ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.accounts.login(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/connections/:id/login/cancel",
      async ({ params }) => {
        if (!services.accounts) throw new HarnessError("ADAPTER_UNAVAILABLE");
        await services.accounts.cancel(params.id);
        return { status: "cancelled" };
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/threads/:id/sessions",
      ({ params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.openSession(params.id, body.agent_id);
      },
      { params: z.object({ id }), body: z.strictObject({ agent_id: id }) },
    )
    .post("/v1/harness/tools", async ({ request, body }) => {
      const result = await services.tools.rpc(
        (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        body,
      );
      if (result === null) return new Response(null, { status: 202 });
      return result;
    })
    .get("/v1/harness/tools", () => new Response(null, { status: 405 }));
}
