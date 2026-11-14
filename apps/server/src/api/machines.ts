import { posix } from "node:path";
import type { Elysia } from "elysia";
import { z } from "zod";
import type { Authentication } from "../auth/service";
import { machineControl, machineProcessInput } from "../machines/contracts";
import type { Machines } from "../machines/service";
import type { MachineViews } from "../machines/view";
import { fileQuery, relativePath } from "../workspaces/contracts";

export function registerMachineRoutes(
  api: Elysia,
  machines: Machines,
  views: MachineViews,
  authentication?: Authentication,
) {
  api.onStop(async () => await views.close());
  return api
    .get("/v1/machine", async () => {
      await machines.refresh().catch(() => {});
      return await machines.snapshot();
    })
    .get("/v1/machine/operations", async () => ({ operations: await machines.operations.list() }))
    .get("/v1/machine/processes", async () => ({ processes: await machines.processes.list() }))
    .get("/v1/machine/windows", async () => ({ windows: await machines.desktop.list() }))
    .post(
      "/v1/machine/processes/control",
      async ({ body, request }) =>
        machines.processes.control(body, null, () => authentication?.assertOwner(request)),
      { body: machineProcessInput },
    )
    .post(
      "/v1/machine/control",
      async ({ body, request }) =>
        machines.control(body, null, () => authentication?.assertOwner(request)),
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
            request.headers.get("Origin") ?? new URL(request.url).origin,
            body.interactive,
            new URL(request.url).origin,
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
          request.headers.get("Origin") ?? new URL(request.url).origin,
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
        await machines.ready();
        return machines.files().list(query.path, query.after, query.limit);
      },
      { query: fileQuery },
    )
    .get(
      "/v1/machine/file",
      async ({ query }) => {
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
    .all("/v1/machine/viewer/:viewerId/*", async ({ request }) => views.proxy(request));
}
