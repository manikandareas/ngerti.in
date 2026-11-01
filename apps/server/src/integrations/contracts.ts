import { z } from "zod";
import { base } from "../contracts/base";

export const toolkitSlug = z.string().regex(/^[a-z][a-z0-9_]{0,100}$/);
export const appToolSlug = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{1,200}$/)
  .refine((s) => !s.startsWith("COMPOSIO_"));
export const appGrant = z.strictObject({
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  tools: z.array(appToolSlug).max(100),
});
export const appConnectionFields = {
  toolkit: toolkitSlug,
  account_id: z.string().min(1).max(200),
  state: z.enum(["pending", "active", "revoked", "auth_required"]),
  generation: z.int().positive(),
  grants: z.array(appGrant).max(100),
};
export const appSessionFields = {
  connection_id: z.uuid(),
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  generation: z.int().positive(),
  native_session_id: z.string().min(1).max(200),
};
export const appEffectFields = {
  connection_id: z.uuid(),
  account_id: z.string(),
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  run_id: z.uuid(),
  generation: z.int().positive(),
  tool: appToolSlug,
  fingerprint: z.string().length(64),
  state: z.enum(["dispatched", "succeeded", "failed", "unknown"]),
  log_id: z.string().max(200).nullable(),
  request_id: z.string().max(200).nullable().default(null),
  sdk_error: z.string().max(100).nullable().default(null),
  error_code: z.string().nullable(),
  result: z.unknown().nullable(),
};
export const appSearch = z.strictObject({
  connection_id: z.uuid(),
  query: z.string().trim().min(1).max(500),
});
export const appExecute = z.strictObject({
  command_id: z.uuid(),
  connection_id: z.uuid(),
  tool: appToolSlug,
  arguments: z.record(z.string(), z.unknown()),
});
export const appAuthorize = z.strictObject({ toolkit: toolkitSlug });
export const appAssignment = z.strictObject({
  expected_revision: z.int().positive(),
  grants: z.array(appGrant).max(100),
});
export const integrationCommands = {
  app_authorize: appAuthorize,
  app_assignment: appAssignment,
  app_search: appSearch,
  app_execute: appExecute,
};

export const appConnection = z.strictObject({
  ...base,
  ...appConnectionFields,
  kind: z.literal("app_connection"),
});
export const appSession = z.strictObject({
  ...base,
  ...appSessionFields,
  kind: z.literal("app_session"),
});
export const appEffect = z.strictObject({
  ...base,
  ...appEffectFields,
  kind: z.literal("app_effect"),
});
