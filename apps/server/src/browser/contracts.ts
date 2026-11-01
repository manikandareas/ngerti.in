import { z } from "zod";
import { base } from "../contracts/base";

const uuid = z.uuid();
export const browserScope = z.strictObject({ agent_id: uuid, thread_id: uuid });
export const browserGrant = browserScope.extend({ actions: z.boolean() });
export const browserAuthPolicy = z.strictObject({
  origin: z.url(),
  login_path_prefix: z.string().regex(/^\//).max(500),
  authenticated_path_prefix: z.string().regex(/^\//).max(500),
});
export const browserProfileInput = z.strictObject({
  name: z.string().trim().min(1).max(100),
  auth_policy: browserAuthPolicy.nullable().default(null),
  grants: z.array(browserGrant).max(100),
});
export const browserProfileFields = {
  name: z.string(),
  auth_policy: browserAuthPolicy.nullable(),
  grants: z.array(browserGrant),
  generation: z.int().positive(),
  state: z.enum(["active", "revoked"]),
};
export const browserSessionFields = {
  profile_id: uuid,
  generation: z.int().positive(),
  state: z.enum(["detached", "ready", "closed", "unknown"]),
  active_run_id: uuid.nullable(),
  control_intent: z.enum(["detach", "close", "reset"]).nullable().default(null),
};
export const browserActionFields = {
  session_id: uuid,
  profile_id: uuid,
  generation: z.int().positive(),
  run_id: uuid,
  agent_id: uuid,
  thread_id: uuid,
  fingerprint: z.string().length(64),
  native_session_id: z.string(),
  target_id: z.string().nullable(),
  tool: z.string(),
  state: z.enum(["dispatched", "succeeded", "error", "unknown"]),
  error_code: z.string().nullable(),
  elapsed_ms: z.number().nonnegative(),
};
export const browserToolArguments = {
  browser_navigate: z.strictObject({ url: z.url().max(4000), new_tab: z.boolean().default(false) }),
  browser_click: z.strictObject({ index: z.int().nonnegative() }),
  browser_type: z.strictObject({ index: z.int().nonnegative(), text: z.string().max(16000) }),
  browser_get_state: z.strictObject({ include_screenshot: z.boolean().default(false) }),
  browser_screenshot: z.strictObject({ full_page: z.literal(false).default(false) }),
  browser_list_tabs: z.strictObject({}),
  browser_switch_tab: z.strictObject({ tab_id: z.string().regex(/^[a-fA-F0-9]{4}$/) }),
  browser_scroll: z.strictObject({ direction: z.enum(["up", "down"]) }),
  browser_go_back: z.strictObject({}),
};
export const browserActionInput = z.strictObject({
  command_id: uuid,
  session_id: uuid,
  generation: z.int().positive(),
  tool: z.enum(
    Object.keys(browserToolArguments) as [
      keyof typeof browserToolArguments,
      ...(keyof typeof browserToolArguments)[],
    ],
  ),
  arguments: z.record(z.string(), z.unknown()),
  observation_id: uuid.nullable().default(null),
  expected_target_id: z.string().max(100).nullable().default(null),
});
export const browserContent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string().max(100000) }),
  z.object({
    type: z.literal("image"),
    data: z.string().max(8000000),
    mimeType: z.literal("image/png"),
  }),
]);
export const browserResult = z.object({
  content: z.array(browserContent).max(10),
  isError: z.boolean().optional(),
});
export type BrowserResult = z.infer<typeof browserResult>;
export const browserCommands = {
  browser_profile: browserProfileInput,
  browser_action: browserActionInput,
};
export const BROWSER_IMAGE = "ngertiin-browser:nma058";

export function browserCapabilities() {
  return {
    backend: "browser-use",
    entry_point: "python -m browser_use.mcp.server",
    minimum_version: "0.13.14",
    tested_version: "0.13.14",
    tools: Object.entries(browserToolArguments).map(([name, schema]) => ({
      name,
      inputSchema: z.toJSONSchema(schema),
    })),
    vnc: "view_only",
    browser_host: "backend",
    images: "supported",
    profile_persistence: "supported",
    llm_extraction: "unsupported",
    autonomous_agent: "unsupported",
    upload: "unsupported",
    frames: "unknown",
    popups: "unknown",
    desktop: "unsupported",
  };
}

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
