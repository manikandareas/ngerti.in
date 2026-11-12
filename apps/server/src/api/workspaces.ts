import type { Elysia } from "elysia";
import { z } from "zod";
import { Artifacts } from "../artifacts";
import type { Background } from "../background";
import { DomainError, id } from "../contracts";
import type { Lifecycle } from "../lifecycle";
import { machineFor } from "../machines/service";
import { fileQuery, publicationInput, uploadInput, workspaceInput } from "../workspaces/contracts";
import type { Command } from "./services";

export function registerWorkspaceRoutes(
  api: Elysia,
  lifecycle: Lifecycle,
  background: Background,
  command: Command,
) {
  const artifacts = new Artifacts(lifecycle);
  const workspaces = artifacts.workspaces;
  return api
    .post(
      "/v1/workspaces",
      async ({ request, body }) =>
        await command(request, body, async () => await workspaces.bind(body)),
      { body: workspaceInput },
    )
    .get(
      "/v1/threads/:id/workspace",
      async ({ params, query }) =>
        Response.json(
          machineFor(lifecycle)
            ? await workspaces.ensure(params.id, query.agent_id)
            : await workspaces.current(params.id, query.agent_id),
        ),
      { params: z.object({ id }), query: z.strictObject({ agent_id: id }) },
    )
    .post(
      "/v1/workspaces/:id/revoke",
      async ({ request, params, body }) => {
        const result = await command(request, body, async () => await workspaces.revoke(params.id));
        await background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .get(
      "/v1/workspaces/:id/files",
      async ({ params, query }) =>
        (await workspaces.workingFiles(params.id)).list(query.path, query.after, query.limit),
      { params: z.object({ id }), query: fileQuery },
    )
    .get(
      "/v1/workspaces/:id/file",
      async ({ params, query }) => {
        const bytes = await (await workspaces.workingFiles(params.id)).read(query.path);
        return new Response(bytes, {
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Disposition": "attachment",
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
          },
        });
      },
      { params: z.object({ id }), query: z.strictObject({ path: z.string().min(1).max(1000) }) },
    )
    .post(
      "/v1/workspaces/:id/uploads",
      async ({ request, params, body }) =>
        artifacts.upload(params.id, id.parse(request.headers.get("Idempotency-Key")), body),
      { params: z.object({ id }), body: uploadInput },
    )
    .get(
      "/v1/artifacts/:id/content",
      async ({ params, query }) => {
        const result = await artifacts.download(params.id, query.workspace_id);
        return new Response(result.bytes, {
          headers: {
            "Content-Type": result.artifact.media_type,
            "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.artifact.name)}`,
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
            ETag: `"${result.artifact.sha256}"`,
          },
        });
      },
      { params: z.object({ id }), query: z.strictObject({ workspace_id: id }) },
    )
    .post(
      "/v1/artifacts/:id/share",
      async ({ request, params, body }) =>
        artifacts.share(
          params.id,
          body.workspace_id,
          id.parse(request.headers.get("Idempotency-Key")),
        ),
      { params: z.object({ id }), body: z.strictObject({ workspace_id: id }) },
    )
    .post(
      "/v1/artifacts",
      async ({ request, body }) =>
        artifacts.publish(id.parse(request.headers.get("Idempotency-Key")), body, async () => {
          const run = await lifecycle.store.get("run", body.run_id);
          if (!run.dispatch_token) throw new DomainError("SCOPE_DENIED", 403);
          await lifecycle.authorizeDispatch(run.id, run.dispatch_token);
        }),
      { body: publicationInput },
    );
}
