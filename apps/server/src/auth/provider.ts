import { createHash } from "node:crypto";
import {
  getOAuthProviderApi,
  type OAuthOptions,
  oauthProvider,
  type Scope,
} from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { createAuthEndpoint } from "better-auth/api";
import { organization } from "better-auth/plugins/organization";
import type { Pool } from "pg";
import { z } from "zod";
import type { AuthenticationConfig } from "./config";
import type { EmailDelivery } from "./email";

export const hashAuthenticationToken = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export const NATIVE_CLIENT_ID = "ngertiin-tauri";
export const AUTH_PATH = "/api/auth";
export function createAuthenticationProvider(
  config: AuthenticationConfig,
  pool: Pool,
  deliver: EmailDelivery,
  retire: (sessionId: string) => void,
) {
  const oauth: OAuthOptions<Scope[]> = {
    loginPage: "/sign-in",
    consentPage: "/consent",
    disableJwtPlugin: true,
    scopes: ["ngertiin", "offline_access"],
    resources: [config.origin],
    grantTypes: ["authorization_code", "refresh_token"],
    allowDynamicClientRegistration: false,
    allowUnauthenticatedClientRegistration: false,
    clientPrivileges: () => false,
    resourcePrivileges: () => false,
    accessTokenExpiresIn: 300,
    refreshTokenExpiresIn: 30 * 86400,
    storeTokens: { hash: async (token) => hashAuthenticationToken(token) },
    prefix: { opaqueAccessToken: "ng_at_", refreshToken: "ng_rt_" },
  };
  return betterAuth({
    appName: "Ngertiin",
    baseURL: config.origin,
    basePath: AUTH_PATH,
    secret: config.secret,
    database: pool,
    trustedOrigins: [config.origin],
    logger: { disabled: true },
    advanced: {
      ipAddress: { ipAddressHeaders: [] },
      useSecureCookies: !config.allowInsecureLoopback,
      database: { generateId: "uuid" },
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", path: "/" },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) =>
        deliver({ to: user.email, purpose: "recovery", url }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) =>
        deliver({ to: user.email, purpose: "verification", url }),
    },
    session: {
      expiresIn: 7 * 86400,
      updateAge: 86400,
      cookieCache: { enabled: false },
      additionalFields: { deviceKind: { type: "string", defaultValue: "web", input: false } },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 5 },
      },
    },
    databaseHooks: {
      session: {
        delete: {
          before: async (session) => {
            // OAuth offline_access refresh tokens otherwise survive the authorizing session.
            await pool.query(
              'UPDATE "oauthRefreshToken" SET revoked=now() WHERE "sessionId"=$1 AND revoked IS NULL',
              [session.id],
            );
            await pool.query(
              'UPDATE "oauthAccessToken" SET revoked=now() WHERE "sessionId"=$1 AND revoked IS NULL',
              [session.id],
            );
          },
          after: async (session) => retire(session.id),
        },
      },
    },
    plugins: [
      oauthProvider(oauth),
      // Product organization writes use one locked SQL transaction, including audit and intents.
      // Raw plugin routes stay outside the HTTP allowlist (including active-org session setters).
      organization({
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        teams: { enabled: true, defaultTeam: { enabled: false } },
      }),
      {
        id: "ngertiin-access-verification",
        schema: {
          teamMember: {
            fields: {
              organizationId: {
                type: "string",
                required: true,
                input: false,
                returned: false,
                fieldName: "organization_id",
                references: { model: "organization", field: "id" },
              },
            },
          },
        },
        endpoints: {
          verifyNativeAccess: createAuthEndpoint(
            "/ngertiin/verify-access",
            {
              method: "POST",
              body: z.object({ token: z.string() }),
              metadata: { SERVER_ONLY: true },
            },
            async (ctx) =>
              getOAuthProviderApi(ctx, oauth).requireActiveAccessToken(
                ctx.body.token,
                NATIVE_CLIENT_ID,
              ),
          ),
        },
      },
    ],
  });
}
export type AuthenticationProvider = ReturnType<typeof createAuthenticationProvider>;
