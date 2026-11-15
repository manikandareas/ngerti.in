import { posix } from "node:path";
import type { AnyElysia, Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "../auth/service";
import { DomainError } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { machineControl, machineProcessInput } from "../machines/contracts";
import { resolvedMachine } from "../machines/domains";
import type { MachineViewGateway } from "../machines/view-gateway";
import { fileQuery, relativePath } from "../workspaces/contracts";

export function registerMachineRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  views: MachineViewGateway,
  authentication?: Authentication,
) {
  const machine = async () => {
    const result = await resolvedMachine(lifecycle);
    if (!result) throw new DomainError("MACHINE_UNAVAILABLE", 503);
    return result;
  };
  const authorize = async (request: Request) => {
    const scope = lifecycle.store.dataContext;
    if (scope) await scope.validate(true);
    else await authentication?.assertOwner(request);
  };
  api.onStop(async () => await views.close());
  return api
    .get("/v1/machine", async () => {
      const machines = await machine();
      await machines.refresh().catch(() => {});
      return await machines.snapshot();
    })
    .get("/v1/machine/operations", async () => ({
      operations: await (await machine()).operations.list(),
    }))
    .get("/v1/machine/processes", async () => ({
      processes: await (await machine()).processes.list(),
    }))
    .get("/v1/machine/windows", async () => ({ windows: await (await machine()).desktop.list() }))
    .post(
      "/v1/machine/processes/control",
      async ({ body, request }) =>
        (await machine()).processes.control(body, null, () => authorize(request)),
      { body: machineProcessInput },
    )
    .post(
      "/v1/machine/control",
      async ({ body, request }) =>
        (await machine()).control(
          body,
          null,
          () => authorize(request),
          authentication?.principal(request).sessionId,
        ),
      {
        body: machineControl,
      },
    )
    .post(
      "/v1/machine/view",
      async ({ body, request }) => {
        const lease = authentication?.lease(request);
        try {
          return await views.issue(
            request.headers.get("Origin") ??
              authentication?.config.origin ??
              new URL(request.url).origin,
            body.interactive,
            authentication?.config.origin ?? new URL(request.url).origin,
            lease,
          );
        } catch (error) {
          lease?.release();
          throw error;
        }
      },
      { body: z.strictObject({ interactive: z.boolean().default(false) }) },
    )
    .post(
      "/v1/machine/views/:viewerId/renew",
      async ({ params, request }) =>
        views.renew(
          params.viewerId,
          request.headers.get("Origin") ??
            authentication?.config.origin ??
            new URL(request.url).origin,
          authentication?.principal(request).sessionId,
        ),
      { body: z.strictObject({}) },
    )
    .delete("/v1/machine/views/:viewerId", async ({ params, request }) =>
      views.remove(params.viewerId, authentication?.principal(request).sessionId),
    )
    .get(
      "/v1/machine/files",
      async ({ query }) => {
        const machines = await machine();
        await machines.ready();
        return machines.files().list(query.path, query.after, query.limit);
      },
      { query: fileQuery },
    )
    .get(
      "/v1/machine/file",
      async ({ query }) => {
        const machines = await machine();
        await machines.ready();
        const bytes = await machines.files().read(query.path);
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(posix.basename(query.path))}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      },
      { query: z.strictObject({ path: relativePath }) },
    )
    .use((app) => registerMachineMediaRoutes(app, views))
    .all("/v1/machine/viewer/:viewerId/*", async ({ request }) => views.proxy(request));
}

/** The account HTTP edge must own the upgrade; scoped HTTP forwarding cannot upgrade its inner router. */
export function registerMachineMediaRoutes(api: AnyElysia, views: MachineViewGateway) {
  return api.ws("/v1/machine/viewer/:viewerId/media", {
    beforeHandle: async ({ request }) => {
      await views.authorize(request);
    },
    maxPayloadLength: 65_536,
    backpressureLimit: 8 * 1024 * 1024,
    closeOnBackpressureLimit: true,
    open: async (peer) => views.open(peer.data.request, peer.raw),
    message: async (peer, message) => views.message(peer.raw, message),
    close: (peer) => views.closePeer(peer.raw),
  });
}
