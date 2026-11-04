import { z } from "zod";
import { operationResponse, operationSchemas } from "./api-responses";
import { browserCapabilities } from "./browser/contracts";
import { API_READINESS_GATE, domainEvent, errorCodes, goal, id, message, run } from "./contracts";
import { conversationSnapshot, conversationTimeline, historyQuery } from "./conversations";
import { manifests } from "./harness/availability";
import { brokerContract, brokerErrorCodes } from "./harness/contracts";
import { productToolCatalog } from "./harness/product-tool-contracts";
import { machine, machineOperation, machineProcess, machineWindow } from "./machines/contracts";

export const responseSchemas = {
  machine,
  machine_operations: z.strictObject({ operations: z.array(machineOperation) }),
  machine_processes: z.strictObject({ processes: z.array(machineProcess) }),
  machine_windows: z.strictObject({ windows: z.array(machineWindow) }),
  ...operationSchemas,
  conversation: conversationSnapshot,
  conversation_timeline: conversationTimeline,
  history_query: historyQuery,
  history: z.strictObject({
    messages: z.array(message),
    has_more: z.boolean(),
    next_before: id.nullable(),
  }),
  events: z.strictObject({ events: z.array(domainEvent), next_cursor: z.int().nonnegative() }),
  setup: z.strictObject({ agent_id: id, thread_id: id, welcome_message_id: id }),
  admission: z.strictObject({
    message,
    run: run.nullable(),
    control: z
      .strictObject({
        action: z.enum(["stop_run", "pause_goal", "stop_goal"]),
        goal: goal.optional(),
      })
      .nullable(),
  }),
  error: z.strictObject({
    error: z.strictObject({
      code: z.enum([...errorCodes, ...brokerErrorCodes]),
      message: z.string(),
      outcome: z.enum(["not_dispatched", "unknown"]).optional(),
    }),
  }),
};

// These paths call the common durable command store, or artifact receipt store.
const durablePaths = new Set([
  "/v1/message-uploads",
  "/v1/setup",
  "/v1/creation/agents",
  "/v1/creation/groups",
  "/v1/threads/:id/opening/retry",
  "/v1/groups/:id/configuration",
  "/v1/connections",
  "/v1/connections/api-key",
  "/v1/connections/:id/revoke",
  "/v1/runs/:id/steer",
  "/v1/messages/:id/edit",
  "/v1/messages/:id/delete",
  "/v1/learning/memories/write",
  "/v1/learning/memories/delete",
  "/v1/learning/skills/create",
  "/v1/learning/skills/revise",
  "/v1/learning/skills/assign",
  "/v1/agents",
  "/v1/agents/:id/configuration",
  "/v1/agents/:id/dm",
  "/v1/groups/:id/membership",
  "/v1/groups/:id/messages",
  "/v1/groups/:id/routes/:routeId/retry",
  "/v1/human-requests/:id/reply",
  "/v1/threads",
  "/v1/goals/capture",
  "/v1/goals/:id/assignment",
  "/v1/goals/:id/recover-completion",
  "/v1/goals/:id/progress",
  "/v1/routines/write",
  "/v1/routines/:id/control",
  "/v1/goals",
  "/v1/routines",
  "/v1/workspaces",
  "/v1/workspaces/:id/revoke",
  "/v1/workspaces/:id/uploads",
  "/v1/artifacts/:id/share",
  "/v1/artifacts",
  "/v1/browser/profiles",
  "/v1/browser/profiles/:id/grants",
  "/v1/runs",
  "/v1/runs/:id/cancel",
  "/v1/runs/:id/retry-preparation",
  "/v1/goals/:id/control",
  "/v1/apps/connections/:id/revoke",
  "/v1/apps/connections/:id/assign",
]);
const operationPaths = new Set([
  "/v1/connections/:id/inspect",
  "/v1/connections/:id/login",
  "/v1/connections/:id/login/cancel",
  "/v1/threads/:id/sessions",
  "/v1/threads/:id/prepare",
  "/v1/runs/:id/reconcile",
  "/v1/runs/:id/interactions",
  "/v1/learning/skills/read",
  "/v1/browser/profiles/:id/open",
  "/v1/browser/sessions/:id/view",
  "/v1/browser/sessions/:id/control",
  "/v1/apps/connect",
  "/v1/apps/connections/:id/reconnect",
  "/v1/apps/connections/:id/refresh",
  "/v1/apps/search",
  "/v1/machine/control",
  "/v1/machine/view",
  "/v1/machine/processes/control",
]);

type Route = {
  method: string;
  path: string;
  hooks: { body?: unknown; query?: unknown; params?: unknown };
};
function inputSchema(schema: unknown) {
  if (schema === undefined) return null;
  if (!(schema instanceof z.ZodType))
    throw new Error("HTTP contract requires an explicit Zod schema.");
  return z.toJSONSchema(schema, { io: "input" });
}

/** Read the installed router's request schemas; exporting never invokes a handler or provider. */
export function httpContract(routes: readonly Route[]) {
  return routes.map(({ method, path, hooks }) => {
    const mcp = path === "/v1/harness/tools";
    const viewer = path.startsWith("/v1/machine/viewer/");
    if (method === "POST" && !mcp && !durablePaths.has(path) && !operationPaths.has(path))
      throw new Error(`HTTP request semantics are missing for ${method} ${path}.`);
    return {
      method,
      path,
      authentication:
        path === "/health/live"
          ? "public"
          : viewer
            ? "scoped_viewer_ticket"
            : mcp
              ? "run_lease"
              : "installation_bearer",
      idempotency:
        method === "POST" && durablePaths.has(path)
          ? "required_uuid"
          : ["/v1/machine/control", "/v1/machine/processes/control"].includes(path)
            ? "required_body_command_id"
            : "not_applicable",
      semantics: mcp
        ? "mcp"
        : method === "GET"
          ? "read"
          : durablePaths.has(path)
            ? "durable_command"
            : "operation",
      request: {
        body: inputSchema(hooks.body),
        query: inputSchema(hooks.query),
        params: inputSchema(hooks.params),
      },
      response_transport:
        path === "/v1/events/stream"
          ? "sse"
          : /^\/v1\/(artifacts\/[^/]+\/content|workspaces\/[^/]+\/file)$/.test(path)
            ? "bytes"
            : viewer
              ? "upstream_viewer"
              : path === "/v1/machine/file"
                ? "bytes"
                : mcp
                  ? "json_rpc"
                  : "json",
      response: operationResponse(method, path),
    };
  });
}

export function consumerContract(machineRuntime = false) {
  return {
    projections: Object.fromEntries(
      Object.entries(responseSchemas).map(([name, schema]) => [
        name,
        z.toJSONSchema(schema, {
          io: name === "events" || name === "history_query" ? "input" : "output",
        }),
      ]),
    ),
    harness: brokerContract(),
    harness_versions: manifests,
    browser: machineRuntime ? { state: "replaced", resource: "machine" } : browserCapabilities(),
    machine: {
      cardinality: "one_per_installation",
      working_files: "shared",
      input_ownership: "agent_or_human",
      process_cancellation: "attributed_process_group",
      unknown_effects: "reconcile_before_new_intent",
      viewer: "cua_html5_grpc_web_media",
      host_native_work: "disabled_for_machine_sessions",
    },
    product_tools: productToolCatalog(machineRuntime ? "machine" : "browser"),
    protocols: {
      machine_viewer: {
        path: "/v1/machine/viewer/:viewerId/*",
        http: "upstream_static_and_grpc_web",
        websocket: "Loopback URL returned by StreamService/OpenMedia",
        credential: "scoped_viewer_ticket",
        activation: "current_human_lease_revision",
        revocation: "close_media_and_reject_stale_ticket_reuse",
      },
      native_interactions: {
        history: "GET /v1/runs/:id/interactions/history",
        coverage: "observed_requests_only",
        identity: ["run_id", "type", "request_id", "source_index"],
        chronology: {
          anchor:
            "First observed same-run agent conversation message; input-message fallback when no agent output exists.",
          offset:
            "UTF-16 code units (JavaScript String.length); null for input-message or legacy fallback.",
          prefix_hash:
            "SHA-256 of the UTF-8 observed message prefix; never replace the first anchor on later observations.",
          unavailable:
            "Use a per-run fallback when message/prefix is unavailable or changed; do not fabricate engine ordering or timestamps.",
        },
        response_replay:
          "Same submitted answer returns its acknowledgement without native dispatch; changed input conflicts.",
        unknown_response:
          "An in-flight attempt after timeout, disconnect or restart is fenced until an acknowledgement for that same attempt is observed. Never blindly replay.",
        observation:
          "Request disappearance, native submission acknowledgement and run termination are separate observations; none establishes that an approved action completed.",
        bounds: { records_per_run: 1000, snapshot_bytes: 131072, journal_bytes: 2097152 },
        privacy:
          "Installation-owner private normalized requests and redacted answer displays only; no opaque native event or response-body log.",
      },
      event: {
        schema_version: 1,
        sse_event: "domain",
        sse_id: "cursor",
        reconnect_header: "Last-Event-ID",
        header_precedes_query: true,
        query_cursor: "after",
        deduplicate_by: "cursor",
        entity_key: ["entity_kind", "entity_id"],
        entity_order: "revision",
        text_updates: "replace_snapshot",
        deletion: "message.state=deleted",
        maximum_page_size: 1000,
        stream_lifetime_ms: 60000,
        snapshot_cursor:
          "Resume after the atomic conversation snapshot cursor; history pages are separate reads.",
      },
      command: {
        header: "Idempotency-Key",
        format: "uuid",
        identity: ["key", "method", "path", "normalized_body"],
        replay: "original_receipt",
        changed_input: "IDEMPOTENCY_CONFLICT",
        receipt_is_current_state: false,
        unknown_effect: "hold_until_authoritative_reconciliation",
      },
      mcp: {
        endpoint: "/v1/harness/tools",
        version: "2025-06-18",
        get_status: 405,
        notification_status: 202,
        authentication: "run_lease",
        json_rpc_errors: "protocol_envelope",
      },
      vnc: machineRuntime
        ? { state: "replaced", protocol: "machine_viewer" }
        : {
            authentication: "single_use_scoped_ticket",
            transport: "binary_rfb_websocket",
            mode: "view_only",
          },
      errors: {
        invalid_request: [400, 413, 422],
        authentication: 401,
        scope: 403,
        missing: 404,
        conflict: 409,
        harness: 409,
        unexpected: 500,
        retry:
          "Read code, outcome and durable receipt before deciding whether another dispatch is safe.",
      },
      state: {
        cancellation:
          "requested is intent; confirmed requires a matching terminal observation or local undispatched cancellation.",
        outcome:
          "HTTP success and agent text do not establish a native or external effect outcome.",
        usage: "Unavailable native usage remains unknown; no zero or unlimited inference is made.",
        billing: "Authentication method and effective billing are distinct; no silent fallback.",
        conversational_cancellation:
          "The native agent interprets chat/steering and calls scoped cancel_run or goal/Routine tools; new chat admission never classifies cancellation text.",
        direct_cancellation:
          "POST /v1/runs/:id/cancel remains independent of model processing and ordinary queue delivery.",
      },
    },
    readiness: {
      ticket: "NMA-060",
      state: API_READINESS_GATE,
      scope: "engine_backend_api_only",
      evidence: machineRuntime
        ? "docs/verification/shared-machine/README.md"
        : "docs/verification/nma-060/final-cohort/README.md",
    },
  };
}
