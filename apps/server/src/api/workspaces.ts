import type { Elysia } from "elysia";
import { z } from "zod";
import { Artifacts } from "../artifacts";
import type { Background } from "../background";
import { DomainError, id } from "../contracts";
import type { Lifecycle } from "../lifecycle";
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
      ({ request, body }) => command(request, body, () => workspaces.bind(body)),
      { body: workspaceInput },
    )
    .get(
      "/v1/threads/:id/workspace",
      ({ params, query }) => Response.json(workspaces.current(params.id, query.agent_id)),
      { params: z.object({ id }), query: z.strictObject({ agent_id: id }) },
    )
    .post(
      "/v1/workspaces/:id/revoke",
      ({ request, params, body }) => {
        const result = command(request, body, () => workspaces.revoke(params.id));
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .get(
      "/v1/workspaces/:id/files",
      ({ params, query }) => workspaces.files(params.id).list(query.path, query.after, query.limit),
      { params: z.object({ id }), query: fileQuery },
    )
    .get(
      "/v1/workspaces/:id/file",
      ({ params, query }) => {
        const bytes = workspaces.files(params.id).read(query.path);
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
      ({ request, params, body }) =>
        artifacts.upload(params.id, id.parse(request.headers.get("Idempotency-Key")), body),
      { params: z.object({ id }), body: uploadInput },
    )
    .get(
      "/v1/artifacts/:id/content",
      ({ params, query }) => {
        const result = artifacts.download(params.id, query.workspace_id);
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
      ({ request, params, body }) =>
        artifacts.share(
          params.id,
          body.workspace_id,
          id.parse(request.headers.get("Idempotency-Key")),
        ),
      { params: z.object({ id }), body: z.strictObject({ workspace_id: id }) },
    )
    .post(
      "/v1/artifacts",
      ({ request, body }) =>
        artifacts.publish(id.parse(request.headers.get("Idempotency-Key")), body, () => {
          const run = lifecycle.store.get("run", body.run_id);
          if (!run.dispatch_token) throw new DomainError("SCOPE_DENIED", 403);
          lifecycle.authorizeDispatch(run.id, run.dispatch_token);
        }),
      { body: publicationInput },
    );
}
