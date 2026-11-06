import { posix } from "node:path";
import type { Elysia } from "elysia";
import { z } from "zod";
import { machineControl, machineProcessInput } from "../machines/contracts";
import type { Machines } from "../machines/service";
import type { MachineViews } from "../machines/view";
import { fileQuery, relativePath } from "../workspaces/contracts";

export function registerMachineRoutes(api: Elysia, machines: Machines, views: MachineViews) {
  api.onStop(() => views.close());
  return api
    .get("/v1/machine", async () => {
      await machines.refresh().catch(() => {});
      return machines.snapshot();
    })
    .get("/v1/machine/operations", () => ({ operations: machines.operations.list() }))
    .get("/v1/machine/processes", () => ({ processes: machines.processes.list() }))
    .get("/v1/machine/windows", () => ({ windows: machines.desktop.list() }))
    .post(
      "/v1/machine/processes/control",
      ({ body }) => machines.processes.control(body, null, () => {}),
      { body: machineProcessInput },
    )
    .post("/v1/machine/control", ({ body }) => machines.control(body, null), {
      body: machineControl,
    })
    .post(
      "/v1/machine/view",
      ({ body, request }) =>
        views.issue(
          request.headers.get("Origin") ?? new URL(request.url).origin,
          body.interactive,
          new URL(request.url).origin,
        ),
      { body: z.strictObject({ interactive: z.boolean().default(false) }) },
    )
    .post(
      "/v1/machine/views/:viewerId/renew",
      ({ params, request }) =>
        views.renew(params.viewerId, request.headers.get("Origin") ?? new URL(request.url).origin),
      { body: z.strictObject({}) },
    )
    .delete("/v1/machine/views/:viewerId", ({ params }) => views.remove(params.viewerId))
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
    .all("/v1/machine/viewer/:viewerId/*", ({ request }) => views.proxy(request));
}
