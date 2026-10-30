import { z } from "zod";
import { connectionFields } from "./harness/contracts";

export const CONTRACT_VERSION = "1.2.0";
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
export const agentInput = z.strictObject({
  name: z.string().trim().min(1).max(200),
  harness,
  connection_id: id,
  instructions: z.string().max(100_000).default(""),
  workspace_id: id.nullable().default(null),
  model_id: z.string().min(1).max(200).nullable().default(null),
  reasoning: z.string().max(100).nullable().default(null),
});
export const agent = agentInput.extend({
  ...base,
  kind: z.literal("agent"),
  grant_revision: z.int().positive(),
});
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
export const thread = threadInput.safeExtend({ ...base, kind: z.literal("thread") });
export const runStatus = z.enum([
  "queued",
  "dispatching",
  "running",
  "cancel_requested",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
]);
export const run = z
  .strictObject({
    ...base,
    kind: z.literal("run"),
    thread_id: id,
    agent_id: id,
    input_message_id: id,
    goal_id: id.nullable(),
    routine_id: id.nullable(),
    status: runStatus,
    cancellation: z.enum(["none", "requested", "confirmed"]),
    outcome: z.enum(["none", "succeeded", "failed", "cancelled", "unknown"]),
    grant_revision: z.int().positive(),
    dispatch_token: id.nullable(),
    authority_epoch: id.nullable(),
    binding_id: id.nullable(),
    native_run_id: z.string().min(1).max(1000).nullable().default(null),
  })
  .refine((value) => {
    const terminal = ["succeeded", "failed", "cancelled", "unknown"].includes(value.status);
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
    text,
    state: z.enum(["complete", "partial"]),
  })
  .refine(
    (value) =>
      (value.author === "agent") === (value.author_agent_id !== null) &&
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
    state: z.enum(["active", "paused", "stopped", "completed"]),
    generation: z.int().positive(),
    evidence_artifact_ids: z.array(id),
  })
  .refine(
    (value) => value.state !== "completed" || value.evidence_artifact_ids.length > 0,
    "Completed goals require evidence.",
  );
export const schedule = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("once"), at: z.iso.datetime() }),
  z.strictObject({
    type: z.literal("interval"),
    anchor_at: z.iso.datetime(),
    every_ms: z.int().min(1000).max(31_536_000_000),
  }),
]);
export const routineInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  goal_id: id.nullable().default(null),
  instruction: text,
  schedule,
  timezone: z.string().refine((v) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, "Invalid timezone."),
});
export const routine = routineInput.extend({
  ...base,
  kind: z.literal("routine"),
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
export const artifact = artifactInput.extend({ ...base, kind: z.literal("artifact") });
export const binding = z.strictObject({
  ...base,
  kind: z.literal("binding"),
  thread_id: id,
  agent_id: id,
  connection_id: id,
  harness,
  native_session_id: z.string().min(1).max(1000),
  generation: z.int().positive(),
});
export const connection = z.strictObject({
  ...base,
  kind: z.literal("connection"),
  ...connectionFields,
});
export const schemas = {
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
};
export type Kind = keyof typeof schemas;
export type Entity<K extends Kind = Kind> = z.infer<(typeof schemas)[K]>;
export const kindSchema = z.enum([
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
]);
export const admissionInput = z.strictObject({
  thread_id: id,
  agent_id: id,
  text,
  goal_id: id.nullable().default(null),
  routine_id: id.nullable().default(null),
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
        agent: agentInput,
        thread: threadInput,
        goal: goalInput,
        routine: routineInput,
        artifact: artifactInput,
        admit: admissionInput,
      }).map(([key, value]) => [key, z.toJSONSchema(value)]),
    ),
    errors: errorCodes,
  };
}
