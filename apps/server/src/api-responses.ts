import { z } from "zod";
import { agentActivities } from "./agents/activity";
import { submissionStatus } from "./api/attachments";
import { authenticationSession, deviceSessions, nativeAuthentication } from "./auth/contracts";
import { browserContent } from "./browser/contracts";
import { API_READINESS_GATE, agent, domainEvent, id, runStatus, schemas } from "./contracts";
import { billingSource } from "./contracts/base";
import { conversationPreviews } from "./conversations/previews";
import { routingDecisionTrace } from "./groups/decision-trace";
import { capabilities, harnessId } from "./harness/contracts";
import { interactionSnapshot, nativeInteractionJournal } from "./harness/interaction-contracts";
import { loginReadiness } from "./harness/login-readiness";
import { maintenanceJob } from "./harness/maintenance-jobs";
import { inheritedSkill, nativeSkillMetadata } from "./learning/contracts";
import {
  accessView,
  audienceView,
  auditView,
  invitationView,
  membershipView,
  organizationView,
  provisioningView,
  workgroupView,
} from "./organizations/contracts";
import { workspaceAccess } from "./organizations/workspace-access";

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
  .extend({ billing_source: billingSource });

/** Operation responses assembled from the same entity contracts used by persistence. */
export const operationSchemas = {
  machine_view: z.strictObject({
    viewer_id: z.string(),
    viewer_url: z.string(),
    expires_at: z.iso.datetime(),
    interactive: z.boolean(),
    control_revision: z.int().nonnegative(),
    machine_id: id,
  }),
  routing_decision: z.strictObject({ trace: routingDecisionTrace.nullable() }),
  agent_activity: agentActivities,
  conversation_previews: conversationPreviews,
  harness_availability: z.array(
    z.strictObject({
      harness: harnessId,
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
  session_preparation: z.strictObject({ state: z.enum(["ready", "preparing", "skipped"]) }),
  ready: z.strictObject({
    status: z.literal("foundation_ready"),
    contract_version: z.string(),
    persistence: z.literal("ready"),
    scheduler: z.literal("running"),
    dispatcher: z.literal("running"),
    registered_executors: z.int().nonnegative(),
    api_readiness_gate: z.literal(API_READINESS_GATE),
    group_routing: z.enum(["jev", "member"]),
    harnesses: z.array(
      z.strictObject({
        harness: harnessId,
        state: z.enum(["supported", "too_old", "missing", "unknown", "probe_failed"]),
        version: z.string().nullable(),
        executable: z.string().nullable(),
        minimum_version: z.string(),
      }),
    ),
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
        size_bytes: z.int().nonnegative().optional(),
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
  interactions: interactionSnapshot,
  interaction_history: z.strictObject({
    run_id: id,
    run_status: runStatus,
    cancellation: z.enum(["none", "requested", "confirmed"]),
    coverage: z.literal("observed_requests_only"),
    records: nativeInteractionJournal,
  }),
  interaction_submitted: z.strictObject({ status: z.literal("submitted") }),
  app_catalog: z.strictObject({
    items: z.array(
      z.strictObject({
        slug: z.string(),
        name: z.string(),
        connected: z.boolean(),
        logo: z.url().optional(),
        description: z.string().optional(),
        website: z.url().optional(),
        categories: z.array(z.strictObject({ slug: z.string(), name: z.string() })).optional(),
        tools_count: z.int().nonnegative().optional(),
        triggers_count: z.int().nonnegative().optional(),
        no_auth: z.boolean().optional(),
      }),
    ),
    cursor: z.string().optional(),
    metadata_complete: z.boolean().optional(),
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
routes("POST", ["/v1/threads/:id/prepare"], operationSchemas.session_preparation);
routes("GET", ["/health/ready"], operationSchemas.ready);
reference("GET", "/v1/contracts", "contract_document");
reference("GET", "/v1/harness/contracts", "harness");
reference("GET", "/v1/browser/contracts", "browser");
routes("GET", ["/v1/harnesses"], operationSchemas.harness_availability);
routes(
  "GET",
  ["/v1/harnesses/maintenance"],
  z.strictObject({
    can_update: z.boolean(),
    updating: z.array(harnessId),
    operations: z.array(maintenanceJob),
    native_login: z.array(loginReadiness),
  }),
);
routes("POST", ["/v1/harnesses/:harness/update"], maintenanceJob);
reference("POST", "/v1/setup", "setup");
reference("POST", "/v1/runs", "admission");
routes("POST", ["/v1/message-uploads"], schemas.attachment_upload);
routes("GET", ["/v1/message-submissions/:id"], submissionStatus);
routes("POST", ["/v1/groups/:id/routes/:routeId/retry"], schemas.group_route);
routes("GET", ["/v1/groups/:id/routes/:routeId/decision"], operationSchemas.routing_decision);
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
routes("POST", ["/v1/runs/:id/retry-preparation", "/v1/runs/:id/retry"], schemas.run);
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
    "/v1/connections/native-configuration",
    "/v1/connections/:id/revoke",
    "/v1/connections/:id/inspect",
  ],
  schemas.connection,
);
routes("POST", ["/v1/connections/:id/login"], operationSchemas.login);
routes("POST", ["/v1/connections/local/refresh"], z.strictObject({ available: z.boolean() }));
routes("POST", ["/v1/connections/:id/login/cancel"], operationSchemas.login_cancel);
routes("POST", ["/v1/ai/selections"], schemas.ai_selection);
routes(
  "POST",
  ["/v1/connections/:id/rotate-key"],
  z.strictObject({
    retired: schemas.connection,
    replacement: schemas.connection,
    selection_action: z.literal("explicitly_select_replacement"),
  }),
);
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
routes(
  "POST",
  ["/v1/data/team-agents/:id/skills/publish"],
  skillResult.extend({ assignment: schemas.skill_assignment }),
);
routes("POST", ["/v1/data/team-agents/:id/skills/assign"], schemas.skill_assignment);
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
routes("GET", ["/v1/machine"], schemas.machine);
routes(
  "GET",
  ["/v1/machine/windows"],
  z.strictObject({ windows: z.array(schemas.machine_window) }),
);
routes("POST", ["/v1/machine/control"], schemas.machine);
routes("POST", ["/v1/machine/view"], operationSchemas.machine_view);
routes(
  "POST",
  ["/v1/machine/views/:viewerId/renew"],
  z.strictObject({
    viewer_id: z.string(),
    expires_at: z.iso.datetime(),
    control_revision: z.int().nonnegative(),
  }),
);
routes("DELETE", ["/v1/machine/views/:viewerId"], z.strictObject({ revoked: z.boolean() }));
routes(
  "GET",
  ["/v1/machine/operations"],
  z.strictObject({ operations: z.array(schemas.machine_operation) }),
);
routes(
  "GET",
  ["/v1/machine/processes"],
  z.strictObject({ processes: z.array(schemas.machine_process) }),
);
routes("POST", ["/v1/machine/processes/control"], schemas.machine_process);
routes("GET", ["/v1/machine/files"], operationSchemas.files);

routes("GET", ["/v1/auth/session"], authenticationSession);
routes("GET", ["/v1/auth/sessions"], deviceSessions);
routes("GET", ["/v1/auth/native"], nativeAuthentication);
routes("POST", ["/v1/auth/renew"], authenticationSession);
routes(
  "POST",
  ["/v1/auth/logout", "/v1/auth/sessions/:sessionId/revoke"],
  z.strictObject({ revoked: z.boolean() }),
);
routes("POST", ["/v1/auth/bootstrap"], z.strictObject({ owner_bound: z.boolean() }));

routes(
  "GET",
  ["/v1/organizations"],
  z.strictObject({
    organizations: z.array(organizationView),
    creation_limit: z.int().nonnegative(),
    created_count: z.int().nonnegative(),
  }),
);
routes(
  "POST",
  ["/v1/organizations"],
  z.strictObject({
    organization: organizationView,
    membership: membershipView,
    provisioning: provisioningView,
  }),
);
routes("GET", ["/v1/organizations/:organizationId"], accessView);
routes(
  "POST",
  ["/v1/organizations/:organizationId"],
  z.strictObject({ organization: organizationView }),
);
routes(
  "GET",
  ["/v1/invitations/:invitationId"],
  z.strictObject({ organization: organizationView, invitation: invitationView }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/members"],
  z.strictObject({ members: z.array(membershipView) }),
);
routes(
  "POST",
  ["/v1/organizations/:organizationId/members/:membershipId/role"],
  z.strictObject({ membership: membershipView }),
);
routes(
  "POST",
  ["/v1/organizations/:organizationId/members/:membershipId/remove"],
  z.strictObject({ removed: z.literal(true) }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/provisioning"],
  z.strictObject({ provisioning: provisioningView }),
);
routes("POST", ["/v1/organizations/:organizationId/private-work/resume"], accessView);
routes(
  "GET",
  ["/v1/organizations/:organizationId/workgroups"],
  z.strictObject({ workgroups: z.array(workgroupView) }),
);
routes(
  "POST",
  [
    "/v1/organizations/:organizationId/workgroups",
    "/v1/organizations/:organizationId/workgroups/:workgroupId",
    "/v1/organizations/:organizationId/workgroups/:workgroupId/members",
  ],
  z.strictObject({ workgroup: workgroupView }),
);
routes(
  "POST",
  ["/v1/organizations/:organizationId/workgroups/:workgroupId/delete"],
  z.strictObject({ deleted: z.literal(true) }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/audiences"],
  z.strictObject({ audiences: z.array(audienceView) }),
);
routes(
  "POST",
  [
    "/v1/organizations/:organizationId/audiences",
    "/v1/organizations/:organizationId/audiences/:audienceId",
  ],
  z.strictObject({ audience: audienceView }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/audiences/:audienceId/access"],
  z.strictObject({ allowed: z.boolean() }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/invitations"],
  z.strictObject({ invitations: z.array(invitationView) }),
);
routes(
  "POST",
  [
    "/v1/organizations/:organizationId/invitations",
    "/v1/organizations/:organizationId/invitations/:invitationId/cancel",
    "/v1/organizations/:organizationId/invitations/:invitationId/send",
  ],
  z.strictObject({ invitation: invitationView }),
);
routes(
  "POST",
  ["/v1/invitations/:invitationId/accept"],
  z.strictObject({ membership: membershipView, provisioning: provisioningView }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/audit"],
  z.strictObject({ audit: z.array(auditView) }),
);
routes(
  "GET",
  ["/v1/organizations/:organizationId/export"],
  z.strictObject({
    organization: organizationView,
    members: z.array(membershipView),
    workgroups: z.array(workgroupView),
    audiences: z.array(audienceView),
    retention: z.strictObject({
      administration: z.literal("retained_until_explicit_operator_purge"),
      private_data: z.literal("excluded"),
      team_ownership: z.literal("organization"),
    }),
  }),
);

/** Fail closed when an added route has no reviewed response contract. */
routes("GET", ["/v1/data/access"], workspaceAccess);
routes(
  "POST",
  ["/v1/data/provision"],
  z.strictObject({ agent_id: id, thread_id: id, welcome_message_id: id }),
);
routes("POST", ["/v1/data/team-agents", "/v1/data/team-agents/:id/configuration"], schemas.agent);
routes("POST", ["/v1/data/agents/:id/preferences"], schemas.agent_preference);
routes("POST", ["/v1/data/agents/:id/knowledge"], schemas.published_knowledge);
routes(
  "POST",
  ["/v1/organizations/:organizationId/agent-access/:id"],
  z.strictObject({ updated: z.boolean() }),
);
routes("POST", ["/v1/data/legacy-binding"], z.strictObject({ organization_id: id, user_id: id }));

export function operationResponse(method: string, path: string) {
  if (method === "DELETE" && path === "/v1/organizations/:organizationId")
    return { status: 403, reference: "error", reason: "organization_deletion_disabled" };
  const result = responses[`${method} ${path}`];
  if (result)
    return "schema" in result
      ? { status: 200, schema: z.toJSONSchema(result.schema, { io: "input" }) }
      : { status: 200, reference: result.reference };
  if (path === "/v1/events/stream") return { status: 200, reference: "event", framing: "sse" };
  if (
    path === "/v1/workspaces/:id/file" ||
    path === "/v1/artifacts/:id/content" ||
    path === "/v1/machine/file"
  )
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
  if (path.startsWith("/v1/machine/viewer/"))
    return {
      status: [200, 101],
      framing: "upstream_viewer",
      reference: "protocols.machine_viewer",
    };
  if (path === "/api/auth/*")
    return { status: [200, 302, 400, 401, 403, 404, 429], reference: "authentication.protocol" };
  throw new Error(`HTTP response contract is missing for ${method} ${path}.`);
}
