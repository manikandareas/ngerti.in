import { timingSafeEqual } from "node:crypto";
import { Elysia } from "elysia";
import { z } from "zod";
import { Artifacts } from "./artifacts";
import type { Background } from "./background";
import {
  admissionInput,
  agentInput,
  agentUpdate,
  CONTRACT_VERSION,
  contractDocument,
  DomainError,
  goalInput,
  id,
  kindSchema,
  queueDelete,
  queueEdit,
  routineInput,
  steerInput,
  threadInput,
} from "./contracts";
import { Conversations, conversationSnapshot, historyQuery } from "./conversations";
import { eventStream } from "./event-stream";
import { groupMessage, humanReply, membershipUpdate } from "./groups/contracts";
import { Groups } from "./groups/service";
import type { AccountService } from "./harness/accounts";
import { detectHarness } from "./harness/availability";
import type { HarnessBroker } from "./harness/broker";
import { Connections } from "./harness/connections";
import {
  brokerContract,
  connectionInput,
  HarnessError,
  interactionAnswer,
} from "./harness/contracts";
import { ProductTools } from "./harness/tools";
import { ApplicationSkills } from "./learning/application-skills";
import {
  learningContext,
  memoryDelete,
  memoryWrite,
  skillAssign,
  skillCreate,
  skillRead,
  skillRevise,
} from "./learning/contracts";
import { Memories } from "./learning/memories";
import type { Lifecycle } from "./lifecycle";
import { RunControls } from "./run-controls";
import { fileQuery, publicationInput, uploadInput, workspaceInput } from "./workspace-contracts";

export function createApi(
  lifecycle: Lifecycle,
  background: Background,
  token: string,
  services: {
    connections: Connections;
    tools: ProductTools;
    detect?: typeof detectHarness;
    broker?: HarnessBroker;
    accounts?: AccountService;
  } = { connections: new Connections(lifecycle), tools: new ProductTools(lifecycle) },
) {
  if (token.length < 32) throw new Error("A private development token is required.");
  const conversations = new Conversations(lifecycle);
  const groups = new Groups(lifecycle);
  const controls = new RunControls(lifecycle);
  const memories = new Memories(lifecycle);
  const skills = new ApplicationSkills(lifecycle);
  const artifacts = new Artifacts(lifecycle);
  const workspaces = artifacts.workspaces;
  function command(request: Request, body: unknown, action: () => unknown) {
    const commandId = id.parse(request.headers.get("Idempotency-Key"));
    return lifecycle.store.command(
      commandId,
      { method: request.method, path: new URL(request.url).pathname, body },
      action,
    );
  }
  return new Elysia({
    name: "ngertiin-foundation",
    serve: { maxRequestBodySize: 24 * 1024 * 1024 },
  })
    .onError(({ error, code, set }) => {
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
    .onRequest(({ request }) => {
      if (request.method === "GET" && new URL(request.url).pathname === "/health/live") return;
      const size = Number(request.headers.get("Content-Length") ?? 0);
      const maximum = /^\/v1\/workspaces\/[^/]+\/uploads$/.test(new URL(request.url).pathname)
        ? 24 * 1024 * 1024
        : 1_048_576;
      if (!Number.isFinite(size) || size > maximum) throw new DomainError("INVALID_REQUEST", 413);
      // The MCP endpoint accepts only a server-issued run lease, never the installation token.
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
        services.tools.authenticate(
          (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        );
        return;
      }
      const supplied = request.headers.get("Authorization") ?? "";
      const expected = `Bearer ${token}`;
      const suppliedBytes = Buffer.from(supplied);
      const expectedBytes = Buffer.from(expected);
      if (
        suppliedBytes.length !== expectedBytes.length ||
        !timingSafeEqual(suppliedBytes, expectedBytes)
      )
        throw new DomainError("UNAUTHORIZED", 401);
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
    .get("/v1/contracts", () => ({
      ...contractDocument(),
      projections: {
        conversation: z.toJSONSchema(conversationSnapshot),
        history_query: z.toJSONSchema(historyQuery, { io: "input" }),
      },
    }))
    .post("/v1/setup", ({ request, body }) => command(request, body, () => conversations.setup()), {
      body: z.strictObject({}),
    })
    .get("/v1/threads/:id/snapshot", ({ params }) => conversations.snapshot(params.id), {
      params: z.object({ id }),
    })
    .get(
      "/v1/threads/:id/history",
      ({ params, query }) => conversations.history(params.id, query),
      { params: z.object({ id }), query: historyQuery },
    )
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
    .post(
      "/v1/runs/:id/steer",
      async ({ request, params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        const control = command(request, body, () =>
          controls.requestSteer(params.id, body),
        ) as ReturnType<RunControls["requestSteer"]>;
        return services.broker.dispatchSteer(control.id);
      },
      { params: z.object({ id }), body: steerInput },
    )
    .post(
      "/v1/runs/:id/reconcile",
      ({ params }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.reconcile(params.id);
      },
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/messages/:id/edit",
      ({ request, params, body }) => command(request, body, () => controls.edit(params.id, body)),
      { params: z.object({ id }), body: queueEdit },
    )
    .post(
      "/v1/messages/:id/delete",
      ({ request, params, body }) => command(request, body, () => controls.remove(params.id, body)),
      { params: z.object({ id }), body: queueDelete },
    )
    .get(
      "/v1/runs/:id/interactions",
      ({ params }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.interactions(params.id);
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/runs/:id/interactions",
      ({ params, body }) => {
        if (!services.broker) throw new HarnessError("ADAPTER_UNAVAILABLE");
        return services.broker.respond(params.id, body);
      },
      { params: z.object({ id }), body: interactionAnswer },
    )
    .post("/v1/harness/tools", async ({ request, body }) => {
      const result = await services.tools.rpc(
        (request.headers.get("Authorization") ?? "").replace(/^Bearer /, ""),
        body,
      );
      if (result === null) return new Response(null, { status: 202 });
      return result;
    })
    .get("/v1/harness/tools", () => new Response(null, { status: 405 }))
    .get("/v1/entities/:kind", ({ params }) => lifecycle.store.list(params.kind), {
      params: z.object({ kind: kindSchema }),
    })
    .get("/v1/entities/:kind/:id", ({ params }) => lifecycle.store.get(params.kind, params.id), {
      params: z.object({ kind: kindSchema, id }),
    })
    .get(
      "/v1/events/stream",
      ({ request, query }) =>
        eventStream(
          lifecycle.store,
          z.coerce
            .number()
            .int()
            .min(0)
            .parse(request.headers.get("Last-Event-ID") ?? query.after),
          request.signal,
        ),
      { query: z.object({ after: z.coerce.number().int().min(0).default(0) }) },
    )
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
    .get(
      "/v1/learning/memories",
      ({ query }) =>
        memories.recall(
          { agent_id: query.agent_id, thread_id: query.thread_id },
          {
            query: query.query ?? "",
            include_deleted: query.include_deleted === "true",
            after: query.after ?? null,
            limit: query.limit ?? 50,
          },
        ),
      {
        query: learningContext.extend({
          query: z.string().max(1000).optional(),
          include_deleted: z.enum(["true", "false"]).optional(),
          after: z.uuid().optional(),
          limit: z.coerce.number().int().min(1).max(100).optional(),
        }),
      },
    )
    .post(
      "/v1/learning/memories/write",
      ({ request, body }) =>
        command(request, body, () => {
          const { context, ...input } = body;
          return memories.write(context, input);
        }),
      { body: memoryWrite.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/memories/delete",
      ({ request, body }) =>
        command(request, body, () => {
          const { context, ...input } = body;
          return memories.remove(context, input);
        }),
      { body: memoryDelete.extend({ context: learningContext }) },
    )
    .get(
      "/v1/learning/skills",
      ({ query }) => skills.inventory({ agent_id: query.agent_id, thread_id: query.thread_id }),
      { query: learningContext },
    )
    .post(
      "/v1/learning/skills/read",
      ({ body }) => skills.read(body.context, { skill_id: body.skill_id, version: body.version }),
      { body: skillRead.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/create",
      ({ request, body }) =>
        command(request, body, () => {
          const { context, ...input } = body;
          return skills.create(context, input);
        }),
      { body: skillCreate.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/revise",
      ({ request, body }) =>
        command(request, body, () => {
          const { context, ...input } = body;
          return skills.revise(context, input);
        }),
      { body: skillRevise.extend({ context: learningContext }) },
    )
    .post(
      "/v1/learning/skills/assign",
      ({ request, body }) =>
        command(request, body, () => {
          const { context, ...input } = body;
          return skills.assign(context, input);
        }),
      { body: skillAssign.extend({ context: learningContext }) },
    )
    .post(
      "/v1/agents",
      ({ request, body }) => command(request, body, () => lifecycle.create("agent", body)),
      { body: agentInput },
    )
    .post(
      "/v1/agents/:id/configuration",
      ({ request, params, body }) =>
        command(request, body, () => lifecycle.updateAgent(params.id, body)),
      { params: z.object({ id }), body: agentUpdate },
    )
    .post(
      "/v1/agents/:id/dm",
      ({ request, params, body }) =>
        command(request, body, () =>
          lifecycle.create("thread", { type: "dm", member_agent_ids: [params.id] }),
        ),
      { params: z.object({ id }), body: z.strictObject({}) },
    )
    .post(
      "/v1/groups/:id/membership",
      ({ request, params, body }) => {
        const result = command(request, body, () => groups.membership(params.id, body));
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }), body: membershipUpdate },
    )
    .post(
      "/v1/groups/:id/messages",
      ({ request, params, body }) => command(request, body, () => groups.send(params.id, body)),
      { params: z.object({ id }), body: groupMessage },
    )
    .post(
      "/v1/human-requests/:id/reply",
      ({ request, params, body }) => command(request, body, () => groups.reply(params.id, body)),
      { params: z.object({ id }), body: humanReply },
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
      "/v1/workspaces",
      ({ request, body }) => command(request, body, () => workspaces.bind(body)),
      { body: workspaceInput },
    )
    .get(
      "/v1/threads/:id/workspace",
      ({ params, query }) => workspaces.current(params.id, query.agent_id),
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
    )
    .post(
      "/v1/runs",
      ({ request, body }) => {
        const result = command(request, body, () => controls.send(body));
        background.notifyControls();
        return result;
      },
      {
        body: admissionInput,
      },
    )
    .post(
      "/v1/runs/:id/cancel",
      ({ request, params }) => {
        const result = command(request, {}, () => lifecycle.cancel(params.id));
        background.notifyControls();
        return result;
      },
      { params: z.object({ id }) },
    )
    .post(
      "/v1/goals/:id/control",
      ({ request, params, body }) => {
        const result = command(request, body, () => lifecycle.controlGoal(params.id, body.state));
        background.notifyControls();
        return result;
      },
      {
        params: z.object({ id }),
        body: z.strictObject({ state: z.enum(["active", "paused", "stopped"]) }),
      },
    );
}
