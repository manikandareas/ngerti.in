import { z } from "zod";

export const harnessId = z.enum(["codex", "muse"]);
export const capabilityState = z.enum(["supported", "unsupported", "unknown"]);
export const capabilities = z.strictObject({
  resume: capabilityState,
  steer: capabilityState,
  image_input: capabilityState,
  video_input: capabilityState,
  compaction: capabilityState,
  product_tools: capabilityState,
  settings: capabilityState,
});
export type Capabilities = z.infer<typeof capabilities>;
export const unknownCapabilities: Capabilities = {
  resume: "unknown",
  steer: "unknown",
  image_input: "unknown",
  video_input: "unknown",
  compaction: "unknown",
  product_tools: "unknown",
  settings: "unknown",
};
export const authentication = z.discriminatedUnion("method", [
  z.strictObject({ method: z.literal("native_login"), billing_source: z.literal("subscription") }),
  z.strictObject({
    method: z.literal("api_key"),
    billing_source: z.literal("api_key"),
    credential_ref: z.uuid(),
  }),
]);
export const connectionInput = z.strictObject({ harness: harnessId, authentication });
export const model = z.strictObject({
  id: z.string().min(1).max(200),
  reasoning: z.array(z.string().max(100)).max(50),
});
export const connectionFields = {
  ...connectionInput.shape,
  state: z.enum(["active", "revoked"]),
  grant_revision: z.int().positive(),
  account_id: z.string().min(1).max(200).nullable(),
  login: z.enum(["unknown", "authenticated", "required", "rejected"]),
  discovery: z.enum(["not_attempted", "succeeded", "failed"]),
  models: z.array(model).max(1000),
  inference: z.enum(["not_attempted", "succeeded", "failed", "cancelled", "unknown"]),
  capabilities,
};
export const settings = z.strictObject({
  model_id: z.string().min(1).max(200),
  reasoning: z.string().max(100).nullable(),
});
export type Settings = z.infer<typeof settings>;
export const terminal = z.strictObject({
  status: z.enum(["succeeded", "failed", "cancelled", "unknown"]),
  native_session_id: z.string().min(1).max(1000),
  native_run_id: z.string().min(1).max(1000).nullable(),
});
export const nativeEvent = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("accepted"),
    native_session_id: z.string().min(1).max(1000),
    native_run_id: z.string().min(1).max(1000),
  }),
  z.strictObject({ type: z.literal("text"), text: z.string().max(100_000) }),
]);
export type NativeEvent = z.infer<typeof nativeEvent>;
export const toolScope = z.strictObject({
  owner_id: z.uuid(),
  connection_id: z.uuid(),
  agent_id: z.uuid(),
  thread_id: z.uuid(),
  run_id: z.uuid(),
  binding_id: z.uuid(),
  grant_revision: z.int().positive(),
  connection_revision: z.int().positive(),
});
export type ToolScope = z.infer<typeof toolScope>;
export const brokerErrorCodes = [
  "EXECUTABLE_MISSING",
  "VERSION_TOO_OLD",
  "VERSION_UNKNOWN",
  "PROBE_FAILED",
  "ADAPTER_UNAVAILABLE",
  "CAPABILITY_UNSUPPORTED",
  "CAPABILITY_UNKNOWN",
  "LOGIN_REQUIRED",
  "AUTH_REJECTED",
  "BILLING_MISMATCH",
  "CREDENTIAL_MISSING",
  "MODEL_UNAVAILABLE",
  "NATIVE_REJECTED",
  "SERVICE_UNAVAILABLE",
  "NATIVE_UNKNOWN",
  "PROTOCOL_ERROR",
] as const;
/** Native messages/causes are deliberately excluded from public errors. */
export class HarnessError extends Error {
  constructor(
    readonly code: (typeof brokerErrorCodes)[number],
    readonly outcome: "not_dispatched" | "unknown" = "not_dispatched",
  ) {
    super(code);
  }
}
export function brokerContract() {
  return {
    version: "1.0.0",
    connection: z.toJSONSchema(connectionInput),
    capabilities: z.toJSONSchema(capabilities),
    settings: z.toJSONSchema(settings),
    event: z.toJSONSchema(nativeEvent),
    terminal: z.toJSONSchema(terminal),
    tool_scope: z.toJSONSchema(toolScope),
    errors: brokerErrorCodes,
    operations: [
      "inspect",
      "discover_models",
      "start",
      "resume",
      "prompt",
      "stop",
      "settings",
      "close",
    ],
  };
}
