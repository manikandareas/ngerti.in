import { z } from "zod";
import {
  browserActionFields,
  browserCommands,
  browserProfileFields,
  browserSessionFields,
} from "./browser/contracts";
import { goalCommands, goalFields, schedule, timezone } from "./goals/contracts";
import { groupCommands, humanRequestFields, routeFields, taskFields } from "./groups/contracts";
import { connectionFields } from "./harness/contracts";
import {
  harnessInventoryFields,
  learningCommands,
  memoryFields,
  skillAssignmentFields,
  skillFields,
  skillRevisionFields,
} from "./learning/contracts";
import {
  artifactContentFields,
  publicationInput,
  uploadInput,
  workspaceFields,
  workspaceInput,
} from "./workspace-contracts";

export const CONTRACT_VERSION = "1.9.0";
export const id = z.uuid();
const text = z.string().min(1).max(100_000);
const base = {
  id,
  owner_id: id,
  revision: z.int().positive(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
};
export const harness = z.enum(["codex", "muse"]);
const agentFields = {
  name: z.string().trim().min(1).max(200),
  handle: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/)
    .nullable(),
  avatar: z.string().max(2000).nullable(),
  soul: z.string().max(100_000),
  skills: z
    .array(
      z.strictObject({
        source: z.enum(["harness", "application"]),
        name: z.string().min(1).max(200),
        revision: z.int().positive().nullable(),
      }),
    )
    .max(100),
  harness,
  connection_id: id,
  instructions: z.string().max(100_000),
  workspace_id: id.nullable(),
  model_id: z.string().min(1).max(200).nullable(),
  reasoning: z.string().max(100).nullable(),
};
export const agentInput = z.strictObject({
  ...agentFields,
  handle: agentFields.handle.default(null),
  avatar: agentFields.avatar.default(null),
  soul: agentFields.soul.default(""),
  skills: agentFields.skills.default([]),
  instructions: agentFields.instructions.default(""),
  workspace_id: agentFields.workspace_id.default(null),
  model_id: agentFields.model_id.default(null),
  reasoning: agentFields.reasoning.default(null),
});
export const agent = agentInput.extend({
  ...base,
  kind: z.literal("agent"),
  grant_revision: z.int().positive(),
  system_role: z.literal("tobi").nullable().default(null),
  configuration_access: z.enum(["self", "owner"]).default("self"),
});
export const agentUpdate = z.strictObject({
  expected_revision: z.int().positive(),
  changes: z
    .strictObject(agentFields)
    .partial()
    .refine((value) => Object.keys(value).length > 0, "Empty update."),
});
export const agentSnapshot = agentInput.extend({ agent_id: id, revision: z.int().positive() });
export const threadInput = z
  .strictObject({
    type: z.enum(["dm", "group"]),
    member_agent_ids: z.array(id).min(1).max(100),
  })
  .refine(
    (v) =>
      new Set(v.member_agent_ids).size === v.member_agent_ids.length &&
      (v.type !== "dm" || v.member_agent_ids.length === 1),
    "Invalid thread membership.",
  );
export const thread = threadInput.safeExtend({
  ...base,
  kind: z.literal("thread"),
  purpose: z.enum(["conversation", "routing"]).default("conversation"),
  group_thread_id: id.nullable().default(null),
});
export const runStatus = z.enum([
  "queued",
  "dispatching",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
  "steered",
]);
export const run = z
  .strictObject({
    ...base,
    kind: z.literal("run"),
    thread_id: id,
    agent_id: id,
    input_message_id: id,
    task_id: id.nullable().default(null),
    thread_revision: z.int().positive().nullable().default(null),
    goal_id: id.nullable(),
    routine_id: id.nullable(),
    goal_generation: z.int().positive().nullable().default(null),
    routine_generation: z.int().positive().nullable().default(null),
    publication: z.enum(["immediate", "deferred", "quiet"]).default("immediate"),
    pending_answer: z.string().max(100_000).nullable().default(null),
    status: runStatus,
    cancellation: z.enum(["none", "requested", "confirmed"]),
    outcome: z.enum(["none", "succeeded", "failed", "cancelled", "unknown", "steered"]),
    delivery: z.enum(["pending", "steering", "unknown", "delivered", "removed"]).default("pending"),
    activity: z.enum(["idle", "generating", "tool_running", "stopping", "unknown"]).default("idle"),
    diagnostic: z
      .strictObject({
        code: z.string().regex(/^[A-Z_]+$/),
        category: z.enum(["temporary", "authentication", "configuration", "provider", "unknown"]),
        outcome: z.enum(["not_dispatched", "unknown", "failed"]),
      })
      .nullable()
      .default(null),
    native_dispatch_id: z.string().min(1).max(1000).nullable().default(null),
    grant_revision: z.int().positive(),
    dispatch_token: id.nullable(),
    authority_epoch: id.nullable(),
    binding_id: id.nullable(),
    native_run_id: z.string().min(1).max(1000).nullable().default(null),
    agent_snapshot: agentSnapshot.nullable().default(null),
    workspace_id: id.nullable().default(null),
    workspace_revision: z.int().positive().nullable().default(null),
    product_tools: z.array(z.string().max(200)).max(200).default([]),
    native_tools: z
      .array(
        z.strictObject({
          item_id: z.string().max(1000),
          name: z.string().max(200),
          command: z.string().max(8000).nullable().default(null),
          state: z.enum(["started", "completed", "failed"]),
          exit_code: z.int().nullable(),
        }),
      )
      .max(200)
      .default([]),
  })
  .refine((value) => {
    const terminal = ["succeeded", "failed", "cancelled", "unknown", "steered"].includes(
      value.status,
    );
    if (value.outcome !== (terminal ? value.status : "none")) return false;
    if (value.cancellation === "confirmed" && value.status !== "cancelled") return false;
    if (value.status === "cancel_requested" && value.cancellation !== "requested") return false;
    if (value.status === "queued")
      return (
        value.dispatch_token === null && value.binding_id === null && value.authority_epoch === null
      );
    if (["dispatching", "running", "cancel_requested", "unknown"].includes(value.status))
      return (
        value.dispatch_token !== null && value.binding_id !== null && value.authority_epoch !== null
      );
    return true;
  }, "Invalid run state.");
export const message = z
  .strictObject({
    ...base,
    kind: z.literal("message"),
    thread_id: id,
    author: z.enum(["user", "agent", "routine"]),
    author_agent_id: id.nullable(),
    routine_id: id.nullable(),
    run_id: id.nullable(),
    purpose: z
      .enum(["conversation", "handoff", "review", "human_request", "human_reply", "continuation"])
      .default("conversation"),
    source_run_id: id.nullable().default(null),
    text: z.string().max(100_000),
    state: z.enum(["complete", "partial", "deleted"]),
    artifact_ids: z.array(id).max(20).default([]),
  })
  .refine(
    (value) =>
      (value.author === "agent") === (value.author_agent_id !== null) &&
      (value.author === "agent" || value.text.length > 0) &&
      (value.author !== "routine" || value.routine_id !== null),
    "Invalid message author.",
  );
export const goalInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  title: z.string().min(1).max(1000),
});
export const goal = goalInput
  .extend({
    ...base,
    kind: z.literal("goal"),
    ...goalFields,
    state: z.enum(["active", "paused", "stopped", "completed"]),
    generation: z.int().positive(),
    evidence_artifact_ids: z.array(id),
  })
  .refine(
    (value) => value.state !== "completed" || value.evidence_artifact_ids.length > 0,
    "Completed goals require evidence.",
  );
export { schedule } from "./goals/contracts";
export const routineInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  goal_id: id.nullable().default(null),
  instruction: text,
  schedule,
  timezone,
});
export const routine = routineInput.extend({
  ...base,
  kind: z.literal("routine"),
  source_message_id: id.nullable().default(null),
  source_run_id: id.nullable().default(null),
  paused_by_goal: z.boolean().default(false),
  state: z.enum(["active", "paused", "stopped"]),
  generation: z.int().positive(),
  next_run_at: z.iso.datetime().nullable(),
});
export const occurrence = z.strictObject({
  ...base,
  kind: z.literal("occurrence"),
  routine_id: id,
  routine_generation: z.int().positive(),
  scheduled_for: z.iso.datetime(),
  run_id: id,
});
export const artifactInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  run_id: id.nullable().default(null),
  media_type: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  storage_key: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .max(200),
});
export const artifact = artifactInput.extend({
  ...base,
  ...artifactContentFields,
  kind: z.literal("artifact"),
});
export const workspace = z.strictObject({
  ...base,
  ...workspaceFields,
  kind: z.literal("workspace"),
});
export const binding = z.strictObject({
  ...base,
  kind: z.literal("binding"),
  thread_id: id,
  agent_id: id,
  connection_id: id,
  harness,
  native_session_id: z.string().min(1).max(1000),
  generation: z.int().positive(),
  active: z.boolean().default(true),
  agent_revision: z.int().positive().default(1),
  workspace_id: id.nullable().default(null),
  workspace_revision: z.int().positive().nullable().default(null),
});
export const connection = z.strictObject({
  ...base,
  kind: z.literal("connection"),
  ...connectionFields,
});
export const steerInput = z
  .strictObject({
    text: text.optional(),
    queued_run_id: id.optional(),
    expected_native_run_id: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (value) => (value.text !== undefined) !== (value.queued_run_id !== undefined),
    "Choose one steering source.",
  );
export const queueEdit = z.strictObject({ expected_revision: z.int().positive(), text });
export const queueDelete = z.strictObject({ expected_revision: z.int().positive() });
export const control = z.strictObject({
  ...base,
  kind: z.literal("control"),
  thread_id: id,
  agent_id: id,
  run_id: id,
  message_id: id,
  queued_run_id: id.nullable(),
  native_run_id: z.string().min(1).max(1000),
  state: z.enum(["requested", "accepted", "rejected", "unknown"]),
  error_code: z
    .string()
    .regex(/^[A-Z_]+$/)
    .nullable(),
});
export const memory = z.strictObject({ ...base, ...memoryFields, kind: z.literal("memory") });
export const skill = z.strictObject({ ...base, ...skillFields, kind: z.literal("skill") });
export const skillRevision = z.strictObject({
  ...base,
  ...skillRevisionFields,
  kind: z.literal("skill_revision"),
});
export const skillAssignment = z.strictObject({
  ...base,
  ...skillAssignmentFields,
  kind: z.literal("skill_assignment"),
});
export const harnessInventory = z.strictObject({
  ...base,
  ...harnessInventoryFields,
  kind: z.literal("harness_inventory"),
});
export const groupRoute = z.strictObject({
  ...base,
  ...routeFields,
  kind: z.literal("group_route"),
});
export const peerTask = z.strictObject({ ...base, ...taskFields, kind: z.literal("peer_task") });
export const humanRequest = z.strictObject({
  ...base,
  ...humanRequestFields,
  kind: z.literal("human_request"),
});
export const browserProfile = z.strictObject({
  ...base,
  ...browserProfileFields,
  kind: z.literal("browser_profile"),
});
export const browserSession = z.strictObject({
  ...base,
  ...browserSessionFields,
  kind: z.literal("browser_session"),
});
export const browserAction = z.strictObject({
  ...base,
  ...browserActionFields,
  kind: z.literal("browser_action"),
});
export const schemas = {
  browser_profile: browserProfile,
  browser_session: browserSession,
  browser_action: browserAction,
  group_route: groupRoute,
  peer_task: peerTask,
  human_request: humanRequest,
  memory,
  skill,
  skill_revision: skillRevision,
  skill_assignment: skillAssignment,
  harness_inventory: harnessInventory,
  connection,
  agent,
  thread,
  run,
  message,
  goal,
  routine,
  artifact,
  binding,
  occurrence,
  control,
  workspace,
};
export type Kind = keyof typeof schemas;
export type Entity<K extends Kind = Kind> = z.infer<(typeof schemas)[K]>;
export const kindSchema = z.enum([
  "browser_profile",
  "browser_session",
  "browser_action",
  "group_route",
  "peer_task",
  "human_request",
  "memory",
  "skill",
  "skill_revision",
  "skill_assignment",
  "harness_inventory",
  "connection",
  "agent",
  "thread",
  "run",
  "message",
  "goal",
  "routine",
  "artifact",
  "binding",
  "occurrence",
  "control",
  "workspace",
]);
export const admissionInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  text,
  goal_id: id.nullable().default(null),
  routine_id: id.nullable().default(null),
  artifact_ids: z.array(id).max(20).default([]),
});
export const domainEvent = z.strictObject({
  schema_version: z.literal(1),
  cursor: z.int().positive(),
  owner_id: id,
  type: z.string(),
  entity_kind: kindSchema,
  entity_id: id,
  revision: z.int().positive(),
  created_at: z.iso.datetime(),
  data: z.discriminatedUnion("kind", [
    groupRoute,
    peerTask,
    humanRequest,
    memory,
    skill,
    skillRevision,
    skillAssignment,
    harnessInventory,
    connection,
    agent,
    thread,
    run,
    message,
    goal,
    routine,
    artifact,
    binding,
    occurrence,
    control,
    workspace,
  ]),
});
export type DomainEvent = z.infer<typeof domainEvent>;
export const errorCodes = [
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "CONFLICT",
  "IDEMPOTENCY_CONFLICT",
  "SCOPE_DENIED",
  "STALE_DISPATCH",
  "RECONCILIATION_REQUIRED",
  "INTERNAL_ERROR",
  "CONTROL_AMBIGUOUS",
  "ROUTING_INVALID",
  "ROUTING_STALE",
  "RESPONSIBILITY_DEFERRED",
  "BROWSER_UNAVAILABLE",
  "BROWSER_UNKNOWN",
  "BROWSER_AUTH_REQUIRED",
  "BROWSER_ACTION_FAILED",
] as const;
export class DomainError extends Error {
  constructor(
    readonly code: (typeof errorCodes)[number],
    readonly status = 409,
  ) {
    super(code);
  }
}
export function contractDocument() {
  return {
    version: CONTRACT_VERSION,
    entities: Object.fromEntries(
      Object.entries(schemas).map(([key, value]) => [key, z.toJSONSchema(value)]),
    ),
    event: z.toJSONSchema(domainEvent, { io: "input" }),
    commands: Object.fromEntries(
      Object.entries({
        ...browserCommands,
        ...groupCommands,
        ...goalCommands,
        ...learningCommands,
        agent: agentInput,
        update_agent: agentUpdate,
        thread: threadInput,
        goal: goalInput,
        routine: routineInput,
        artifact: publicationInput,
        workspace: workspaceInput,
        upload: uploadInput,
        publish_artifact: publicationInput,
        admit: admissionInput,
        edit_queued_message: queueEdit,
        delete_queued_message: queueDelete,
        steer: steerInput,
      }).map(([key, value]) => [key, z.toJSONSchema(value)]),
    ),
    errors: errorCodes,
  };
}
