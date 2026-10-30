import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Background } from "./background";
import {
  admissionInput,
  agentInput,
  artifactInput,
  CONTRACT_VERSION,
  contractDocument,
  DomainError,
  goalInput,
  id,
  kindSchema,
  routineInput,
  threadInput,
} from "./contracts";
import type { Lifecycle } from "./lifecycle";

export function createApi(lifecycle: Lifecycle, background: Background, token: string) {
  if (token.length < 32) throw new Error("A private development token is required.");
  function command(request: Request, body: unknown, action: () => unknown) {
    const commandId = id.parse(request.headers.get("Idempotency-Key"));
    return lifecycle.store.command(
      commandId,
      { method: request.method, path: new URL(request.url).pathname, body },
      action,
    );
  }
  return new Elysia({ name: "ngertiin-foundation", serve: { maxRequestBodySize: 1_048_576 } })
    .onError(({ error, code, set }) => {
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
    .onRequest(({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/health/live") return;
      const supplied = request.headers.get("Authorization") ?? "";
      const expected = `Bearer ${token}`;
      const suppliedBytes = Buffer.from(supplied);
      const expectedBytes = Buffer.from(expected);
      if (
        suppliedBytes.length !== expectedBytes.length ||
        !timingSafeEqual(suppliedBytes, expectedBytes)
      )
        throw new DomainError("UNAUTHORIZED", 401);
      const size = Number(request.headers.get("Content-Length") ?? 0);
      if (!Number.isFinite(size) || size > 1_048_576) throw new DomainError("INVALID_REQUEST", 413);
    })
    .get("/health/ready", () => ({
      status: "foundation_ready",
      contract_version: CONTRACT_VERSION,
      persistence: "ready",
      scheduler: "running",
      dispatcher: "running",
      registered_executors: background.executorCount,
      api_readiness_gate: "pending",
    }))
    .get("/v1/contracts", () => contractDocument())
    .get("/v1/entities/:kind", ({ params }) => lifecycle.store.list(params.kind), {
      params: z.object({ kind: kindSchema }),
    })
    .get("/v1/entities/:kind/:id", ({ params }) => lifecycle.store.get(params.kind, params.id), {
      params: z.object({ kind: kindSchema, id }),
    })
    .get(
      "/v1/events",
      ({ query }) => {
        const events = lifecycle.store.events(query.after, query.limit);
        return { events, next_cursor: events.at(-1)?.cursor ?? query.after };
      },
      {
        query: z.object({
          after: z.coerce.number().int().min(0).default(0),
          limit: z.coerce.number().int().min(1).max(1000).default(100),
        }),
      },
    )
    .post(
      "/v1/agents",
      ({ request, body }) => command(request, body, () => lifecycle.create("agent", body)),
      { body: agentInput },
    )
    .post(
      "/v1/threads",
      ({ request, body }) => command(request, body, () => lifecycle.create("thread", body)),
      { body: threadInput },
    )
    .post(
      "/v1/goals",
      ({ request, body }) => command(request, body, () => lifecycle.create("goal", body)),
      { body: goalInput },
    )
    .post(
      "/v1/routines",
      ({ request, body }) => command(request, body, () => lifecycle.create("routine", body)),
      { body: routineInput },
    )
    .post(
      "/v1/artifacts",
      ({ request, body }) => command(request, body, () => lifecycle.create("artifact", body)),
      { body: artifactInput },
    )
    .post("/v1/runs", ({ request, body }) => command(request, body, () => lifecycle.admit(body)), {
      body: admissionInput,
    })
    .post(
      "/v1/runs/:id/cancel",
      ({ request, params }) => command(request, {}, () => lifecycle.cancel(params.id)),
      { params: z.object({ id }) },
    )
    .post(
      "/v1/goals/:id/control",
      ({ request, params, body }) =>
        command(request, body, () => lifecycle.controlGoal(params.id, body.state)),
      {
        params: z.object({ id }),
        body: z.strictObject({ state: z.enum(["active", "paused", "stopped"]) }),
      },
    );
}
