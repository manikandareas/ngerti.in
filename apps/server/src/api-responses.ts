import { z } from "zod";
import { agentActivities } from "./agents/activity";
import { submissionStatus } from "./api/attachments";
import { browserContent } from "./browser/contracts";
import { API_READINESS_GATE, agent, domainEvent, id, runStatus, schemas } from "./contracts";
import { conversationPreviews } from "./conversations/previews";
import { capabilities } from "./harness/contracts";
import { nativeInteractionJournal } from "./harness/interaction-contracts";
import { approval, userInput } from "./harness/muse/protocol";
import { inheritedSkill, nativeSkillMetadata } from "./learning/contracts";

const jsonSchema = z.record(z.string(), z.json());
const skillResult = z.strictObject({ skill: schemas.skill, revision: schemas.skill_revision });
const openingConnection = schemas.connection
  .pick({
    id: true,
    state: true,
    login: true,
    capabilities: true,
    effective_billing_source: true,
  })
  .extend({ billing_source: z.enum(["subscription", "api_key"]) });

/** Operation responses assembled from the same entity contracts used by persistence. */
export const operationSchemas = {
  agent_activity: agentActivities,
  conversation_previews: conversationPreviews,
  harness_availability: z.array(
    z.strictObject({
      harness: z.enum(["codex", "muse"]),
      state: z.enum(["supported", "too_old", "missing", "unknown", "probe_failed"]),
      version: z.string().nullable(),
      executable: z.string().nullable(),
      manifest: z.strictObject({
        executable: z.string(),
        minimum_version: z.string(),
        tested_native_version: z.string(),
        protocol: z.string(),
        sdk_version: z.string().nullable(),
        evidence: z.string(),
        authentication_methods: z.array(z.string()),
        capabilities,
      }),
    }),
  ),
  live: z.strictObject({ status: z.literal("alive") }),
  ready: z.strictObject({
    status: z.literal("foundation_ready"),
    contract_version: z.string(),
    persistence: z.literal("ready"),
    scheduler: z.literal("running"),
    dispatcher: z.literal("running"),
    registered_executors: z.int().nonnegative(),
    api_readiness_gate: z.literal(API_READINESS_GATE),
  }),
  creation_agent: z.strictObject({
    agent,
    thread: schemas.thread,
    message: schemas.message,
    run: schemas.run,
  }),
  creation_group: z.strictObject({
    thread: schemas.thread,
    message: schemas.message,
    route: schemas.group_route,
  }),
  opening: z.strictObject({
    thread: schemas.thread,
    message: schemas.message.nullable(),
    route: schemas.group_route.nullable(),
    task: schemas.peer_task.nullable(),
    run: schemas.run.nullable(),
    connection: openingConnection.nullable(),
    recovery: z.enum(["reconcile", "retry", "configure_or_wait", "none"]),
  }),
  goals: z.strictObject({ goals: z.array(schemas.goal), routines: z.array(schemas.routine) }),
  goal_progress: schemas.goal.extend({ execution_guidance: z.string() }),
  memories: z.strictObject({
    memories: z.array(schemas.memory),
    has_more: z.boolean(),
    next_after: id.nullable(),
  }),
  skill_result: skillResult,
  skills: z.strictObject({
    application: z.array(
      schemas.skill.extend({ key: z.string(), assignment: schemas.skill_assignment.nullable() }),
    ),
    harness: z.array(
      inheritedSkill.pick({ key: true, name: true, location: true, sha256: true }).extend({
        description: z.string(),
        source: z.literal("harness"),
        writable: z.literal(false),
      }),
    ),
    harness_state: z.enum(["supported", "unknown"]),
    native_state: z.enum(["supported", "unknown"]),
    native_catalog: z.array(nativeSkillMetadata),
    rejected_packages: z.int().nonnegative(),
    configured_references: z.array(
      agent.shape.skills.unwrap().element.extend({ state: z.literal("reference_only") }),
    ),
    conflict_policy: z.literal(
      "qualified_identity_required; no_cross_source_overwrite; pinned_application_versions",
    ),
    collisions: z.array(z.string()),
  }),
  files: z.strictObject({
    entries: z.array(
      z.strictObject({
        name: z.string(),
        path: z.string(),
        type: z.enum(["file", "directory", "unsupported"]),
      }),
    ),
    next_after: z.string().nullable(),
  }),
  login: z.union([
    z.strictObject({
      login_id: z.string(),
      auth_url: z.url(),
      expires_in_seconds: z.int().positive(),
    }),
    z.strictObject({
      user_code: z.string(),
      auth_url: z.url(),
      expires_in_seconds: z.int().positive(),
    }),
  ]),
  login_cancel: z.strictObject({ status: z.literal("cancelled") }),
  interactions: z.strictObject({ approvals: z.array(approval), user_inputs: z.array(userInput) }),
  interaction_history: z.strictObject({
    run_id: id,
    run_status: runStatus,
    cancellation: z.enum(["none", "requested", "confirmed"]),
    coverage: z.literal("observed_requests_only"),
    records: nativeInteractionJournal,
  }),
  interaction_submitted: z.strictObject({ status: z.literal("submitted") }),
  app_catalog: z.strictObject({
    items: z.array(z.strictObject({ slug: z.string(), name: z.string(), connected: z.boolean() })),
    cursor: z.string().optional(),
  }),
  app_connect: z.strictObject({ connection: schemas.app_connection, connect_url: z.url() }),
  app_search: z.union([
    z.array(
      z.strictObject({
        slug: z.string(),
        toolkit: z.string(),
        description: z.string().optional(),
        input_schema: jsonSchema.optional(),
      }),
    ),
    z.strictObject({ truncated: z.literal(true), message: z.string() }),
  ]),
  browser_observation: z.strictObject({
    session: schemas.browser_session,
    binding: z
      .object({
        native_session_id: z.string(),
        target_id: z.string().nullable(),
        tabs: z.array(z.object({ target_id: z.string(), tab_id: z.string() })),
      })
      .nullable(),
    content: z.array(browserContent),
    auth: z.enum(["authenticated", "required", "unknown"]),
  }),
  browser_view: z.strictObject({
    session_id: id,
    generation: z.int().positive(),
    host: z.literal("backend"),
    display: z.literal(":99"),
    mode: z.literal("view_only"),
    transport: z.literal("rfb_websocket"),
    url: z.url(),
    expires_at: z.iso.datetime(),
  }),
};

type Result =
  | { schema: z.ZodType; description?: string }
  | { reference: string; description?: string };
const responses: Record<string, Result> = {};
function routes(method: string, paths: string[], schema: z.ZodType) {
  for (const path of paths) responses[`${method} ${path}`] = { schema };
}
function reference(method: string, path: string, name: string) {
  responses[`${method} ${path}`] = { reference: name };
}
routes("GET", ["/health/live"], operationSchemas.live);
routes("GET", ["/health/ready"], operationSchemas.ready);
reference("GET", "/v1/contracts", "contract_document");
reference("GET", "/v1/harness/contracts", "harness");
reference("GET", "/v1/browser/contracts", "browser");
routes("GET", ["/v1/harnesses"], operationSchemas.harness_availability);
reference("POST", "/v1/setup", "setup");
reference("POST", "/v1/runs", "admission");
routes("POST", ["/v1/message-uploads"], schemas.attachment_upload);
routes("GET", ["/v1/message-submissions/:id"], submissionStatus);
routes("POST", ["/v1/groups/:id/routes/:routeId/retry"], schemas.group_route);
reference("GET", "/v1/threads/:id/snapshot", "conversation");
reference("GET", "/v1/threads/:id/history", "history");
reference("GET", "/v1/threads/:id/timeline", "conversation_timeline");
reference("GET", "/v1/events", "events");
routes("GET", ["/v1/entities/:kind"], z.array(domainEvent.shape.data));
routes("GET", ["/v1/entities/:kind/:id"], domainEvent.shape.data);
routes("POST", ["/v1/agents", "/v1/agents/:id/configuration"], agent);
routes(
  "POST",
  ["/v1/threads", "/v1/agents/:id/dm", "/v1/groups/:id/membership", "/v1/groups/:id/configuration"],
  schemas.thread,
);
routes("POST", ["/v1/creation/agents"], operationSchemas.creation_agent);
routes("POST", ["/v1/creation/groups"], operationSchemas.creation_group);
routes("GET", ["/v1/agents/activity"], operationSchemas.agent_activity);
routes("GET", ["/v1/conversations/previews"], operationSchemas.conversation_previews);
routes("GET", ["/v1/threads/:id/opening"], operationSchemas.opening);
routes(
  "POST",
  ["/v1/threads/:id/opening/retry", "/v1/runs/:id/cancel", "/v1/runs/:id/reconcile"],
  schemas.run,
);
routes("POST", ["/v1/groups/:id/messages"], schemas.group_route);
routes("POST", ["/v1/human-requests/:id/reply"], schemas.human_request);
routes("POST", ["/v1/messages/:id/edit", "/v1/messages/:id/delete"], schemas.message);
routes("POST", ["/v1/runs/:id/steer"], schemas.control);
routes("GET", ["/v1/threads/:id/goals"], operationSchemas.goals);
routes(
  "POST",
  [
    "/v1/goals",
    "/v1/goals/capture",
    "/v1/goals/:id/control",
    "/v1/goals/:id/assignment",
    "/v1/goals/:id/recover-completion",
  ],
  schemas.goal,
);
routes("POST", ["/v1/goals/:id/progress"], operationSchemas.goal_progress);
routes("POST", ["/v1/routines", "/v1/routines/write", "/v1/routines/:id/control"], schemas.routine);
routes(
  "POST",
  [
    "/v1/connections",
    "/v1/connections/api-key",
    "/v1/connections/:id/revoke",
    "/v1/connections/:id/inspect",
  ],
  schemas.connection,
);
routes("POST", ["/v1/connections/:id/login"], operationSchemas.login);
routes("POST", ["/v1/connections/:id/login/cancel"], operationSchemas.login_cancel);
routes("POST", ["/v1/threads/:id/sessions"], schemas.binding);
routes("GET", ["/v1/runs/:id/interactions"], operationSchemas.interactions);
routes("GET", ["/v1/runs/:id/interactions/history"], operationSchemas.interaction_history);
routes("POST", ["/v1/runs/:id/interactions"], operationSchemas.interaction_submitted);
routes("GET", ["/v1/learning/memories"], operationSchemas.memories);
routes("POST", ["/v1/learning/memories/write", "/v1/learning/memories/delete"], schemas.memory);
routes("GET", ["/v1/learning/skills"], operationSchemas.skills);
routes(
  "POST",
  ["/v1/learning/skills/read", "/v1/learning/skills/create", "/v1/learning/skills/revise"],
  skillResult,
);
routes("POST", ["/v1/learning/skills/assign"], schemas.skill_assignment);
routes("POST", ["/v1/workspaces", "/v1/workspaces/:id/revoke"], schemas.workspace);
routes("GET", ["/v1/threads/:id/workspace"], schemas.workspace.nullable());
routes("GET", ["/v1/workspaces/:id/files"], operationSchemas.files);
routes(
  "POST",
  ["/v1/workspaces/:id/uploads", "/v1/artifacts/:id/share", "/v1/artifacts"],
  schemas.artifact,
);
routes("GET", ["/v1/apps/catalog"], operationSchemas.app_catalog);
routes("GET", ["/v1/apps/connections"], z.array(schemas.app_connection));
routes(
  "POST",
  ["/v1/apps/connect", "/v1/apps/connections/:id/reconnect"],
  operationSchemas.app_connect,
);
routes(
  "POST",
  [
    "/v1/apps/connections/:id/refresh",
    "/v1/apps/connections/:id/revoke",
    "/v1/apps/connections/:id/assign",
  ],
  schemas.app_connection,
);
routes("POST", ["/v1/apps/search"], operationSchemas.app_search);
routes("GET", ["/v1/browser/profiles"], z.array(schemas.browser_profile));
routes(
  "POST",
  ["/v1/browser/profiles", "/v1/browser/profiles/:id/grants"],
  schemas.browser_profile,
);
routes(
  "POST",
  ["/v1/browser/profiles/:id/open", "/v1/browser/sessions/:id/control"],
  schemas.browser_session,
);
routes("GET", ["/v1/browser/sessions/:id"], operationSchemas.browser_observation);
routes("GET", ["/v1/browser/sessions/:id/receipts"], z.array(schemas.browser_action));
routes("POST", ["/v1/browser/sessions/:id/view"], operationSchemas.browser_view);

/** Fail closed when an added route has no reviewed response contract. */
export function operationResponse(method: string, path: string) {
  const result = responses[`${method} ${path}`];
  if (result)
    return "schema" in result
      ? { status: 200, schema: z.toJSONSchema(result.schema, { io: "input" }) }
      : { status: 200, reference: result.reference };
  if (path === "/v1/events/stream") return { status: 200, reference: "event", framing: "sse" };
  if (path === "/v1/workspaces/:id/file" || path === "/v1/artifacts/:id/content")
    return {
      status: 200,
      framing: "bytes",
      headers: ["Content-Type", "Content-Disposition", "Cache-Control", "X-Content-Type-Options"],
    };
  if (path === "/v1/harness/tools")
    return {
      status: method === "GET" ? 405 : [200, 202],
      reference: "protocols.mcp",
      framing: "json_rpc_or_empty",
    };
  throw new Error(`HTTP response contract is missing for ${method} ${path}.`);
}
