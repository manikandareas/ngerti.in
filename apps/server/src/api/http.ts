import { Elysia } from "elysia";
import { z } from "zod";
import { routeAccess } from "../api-access";
import { isAuthenticationRoute, isPublicAuthenticationRoute } from "../auth/http";
import type { Authentication } from "../auth/service";
import { DomainError, id } from "../contracts";
import { HarnessError } from "../harness/contracts";
import type { ProductTools } from "../harness/tools";
import type { Lifecycle } from "../lifecycle";
import type { ScopedData } from "../organizations/data";
import { isOrganizationPath } from "../organizations/paths";
import { databaseDomainError } from "../persistence/errors";

export function createCommand(lifecycle: Lifecycle, authentication: Authentication) {
  return async function command<T>(request: Request, body: unknown, action: () => T): Promise<T> {
    const commandId = id.parse(request.headers.get("Idempotency-Key"));
    return await lifecycle.store.command(
      commandId,
      { method: request.method, path: new URL(request.url).pathname, body },
      action,
      () =>
        lifecycle.store.dataContext
          ? lifecycle.store.validateDataContext()
          : authentication.assertOwner(request),
    );
  };
}

export function createHttp(
  tools: ProductTools,
  authentication: Authentication,
  scoped: ScopedData,
  viewerAccess?: (request: Request) => unknown,
) {
  const api = new Elysia({
    name: "ngertiin-foundation",
    serve: { maxRequestBodySize: 24 * 1024 * 1024 },
  });
  api
    .onError(({ error: source, code, set }) => {
      const error = databaseDomainError(source) ?? source;
      if (error instanceof HarnessError) {
        set.status = 409;
        return { error: { code: error.code, message: error.message, outcome: error.outcome } };
      }
      if (error instanceof DomainError) {
        set.status = error.status;
        return { error: { code: error.code, message: error.message } };
      }
      if (error instanceof z.ZodError || code === "VALIDATION" || code === "PARSE") {
        set.status = 422;
        return {
          error: { code: "INVALID_REQUEST", message: "Request does not match the contract." },
        };
      }
      set.status = code === "NOT_FOUND" ? 404 : 500;
      return {
        error: {
          code: code === "NOT_FOUND" ? "NOT_FOUND" : "INTERNAL_ERROR",
          message: "Request could not be completed.",
        },
      };
    })
    .get("/health/live", () => ({ status: "alive" }))
    .onRequest(async ({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/health/live") return;
      const size = Number(request.headers.get("Content-Length") ?? 0);
      const maximum =
        /^\/v1\/(?:workspaces\/[^/]+\/uploads|message-uploads|machine\/viewer\/[^/]+\/files(?:\/.*)?)$/.test(
          new URL(request.url).pathname,
        )
          ? 24 * 1024 * 1024
          : 1_048_576;
      if (!Number.isFinite(size) || size > maximum) throw new DomainError("INVALID_REQUEST", 413);
      if (new URL(request.url).pathname.startsWith("/v1/machine/viewer/")) {
        if (!viewerAccess) throw new DomainError("UNAUTHORIZED", 401);
        await viewerAccess(request);
        return;
      }
      // The MCP endpoint accepts only a server-issued run lease.
      if (
        ["GET", "POST"].includes(request.method) &&
        new URL(request.url).pathname === "/v1/harness/tools"
      ) {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");
        if (
          !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
          (origin !== null && origin !== url.origin)
        )
          throw new DomainError("SCOPE_DENIED", 403);
        const protocol = request.headers.get("MCP-Protocol-Version");
        if (protocol !== null && protocol !== "2025-06-18")
          throw new DomainError("INVALID_REQUEST", 400);
        await tools.authenticate(
          (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        );
        return;
      }
      if (isPublicAuthenticationRoute(request)) return;
      if (routeAccess(new URL(request.url).pathname).authentication_class === "channel_key") return;
      if (scoped.requests.has(request)) return;
      await authentication.authenticate(request);
      if (
        !isAuthenticationRoute(request) &&
        new URL(request.url).pathname !== "/v1/contracts" &&
        !isOrganizationPath(new URL(request.url).pathname)
      )
        await authentication.assertOwner(request);
      return;
    });
  return api;
}
