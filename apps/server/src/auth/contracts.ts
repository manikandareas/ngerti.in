import { z } from "zod";

export const authenticationSession = z.strictObject({
  user: z.strictObject({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    email_verified: z.boolean(),
  }),
  session_id: z.uuid(),
  authentication: z.enum(["web", "native"]),
  expires_at: z.iso.datetime(),
});
export const deviceSessions = z.strictObject({
  sessions: z.array(
    z.strictObject({
      id: z.uuid(),
      current: z.boolean(),
      kind: z.enum(["web", "native"]),
      user_agent: z.string().nullable(),
      created_at: z.iso.datetime(),
      updated_at: z.iso.datetime(),
      expires_at: z.iso.datetime(),
    }),
  ),
});
export const nativeAuthentication = z.strictObject({
  client_id: z.literal("ngertiin-tauri"),
  issuer: z.url(),
  audience: z.url(),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  redirect_uri: z.url(),
  response_type: z.literal("code"),
  code_challenge_method: z.literal("S256"),
  scope: z.literal("ngertiin offline_access"),
});
export function authenticationContract(origin: string) {
  return {
    version: "nma-073.1",
    mode: "accounts",
    readiness_gate: "pending_nma_079",
    issuer: `${origin}/api/auth`,
    audience: origin,
    user: {
      web: "secure_http_only_cookie",
      native: "opaque_oauth_access_token",
      native_flow: "authorization_code_s256_pkce",
      device_sessions: "server_validated_and_revocable",
      legacy_data_access: "explicit_bootstrap_owner_only_until_nma_075",
    },
    operator: "local_cli_only_no_user_role_or_installation_bearer_elevation",
    protocol: {
      base_path: "/api/auth",
      allowlist: [
        "GET /ok",
        "POST /sign-up/email",
        "POST /sign-in/email",
        "POST /send-verification-email",
        "GET /verify-email",
        "POST /request-password-reset",
        "GET /reset-password/:token",
        "POST /reset-password",
        "GET /oauth2/authorize",
        "POST /oauth2/token",
        "POST /oauth2/revoke",
      ],
      client_registration: "operator_pinned_public_native_client",
      scopes: ["ngertiin", "offline_access"],
      tokens: "native_transport_only_never_renderer_storage",
      browser_response_tokens: "redacted",
    },
  };
}
