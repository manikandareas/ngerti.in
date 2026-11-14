import type { Elysia } from "elysia";
import { z } from "zod";
import { NATIVE_CLIENT_ID } from "./provider";
import type { Authentication } from "./service";

const providerRoutes = new Set([
  "GET /api/auth/ok",
  "POST /api/auth/sign-up/email",
  "POST /api/auth/sign-in/email",
  "POST /api/auth/send-verification-email",
  "GET /api/auth/verify-email",
  "POST /api/auth/request-password-reset",
  "POST /api/auth/reset-password",
  "GET /api/auth/oauth2/authorize",
  "POST /api/auth/oauth2/token",
  "POST /api/auth/oauth2/revoke",
]);
export function isAuthenticationRoute(request: Request) {
  const path = new URL(request.url).pathname;
  return path.startsWith("/api/auth/") || path.startsWith("/v1/auth/");
}
export function isPublicAuthenticationRoute(request: Request) {
  const path = new URL(request.url).pathname;
  return path.startsWith("/api/auth/") || (request.method === "GET" && path === "/v1/auth/native");
}
export function authenticationResponse(value: unknown, status = 200, headers?: HeadersInit) {
  const safeHeaders = new Headers(headers);
  safeHeaders.set("Cache-Control", "no-store");
  safeHeaders.set("Pragma", "no-cache");
  safeHeaders.set("Referrer-Policy", "no-referrer");
  return Response.json(value, { status, headers: safeHeaders });
}
export function registerAuthenticationRoutes(api: Elysia, auth: Authentication) {
  return api
    .all(
      "/api/auth/*",
      async ({ request }) => {
        const path = new URL(request.url).pathname;
        if (
          !providerRoutes.has(`${request.method} ${path}`) &&
          !(
            request.method === "GET" &&
            /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]{1,256}$/.test(path)
          )
        )
          return authenticationResponse(
            { error: { code: "NOT_FOUND", message: "Authentication operation is unavailable." } },
            404,
          );
        const oauthToken = path === "/api/auth/oauth2/token";
        const oauthProtocol = oauthToken || path === "/api/auth/oauth2/revoke";
        auth.checkOrigin(request, request.method === "POST" && !oauthProtocol);
        let codeExchange = false;
        if (oauthToken) {
          const form = new URLSearchParams(await request.clone().text());
          if (form.get("client_id") !== NATIVE_CLIENT_ID)
            return authenticationResponse({ error: "invalid_client" }, 400);
          for (const key of new Set(form.keys()))
            if (form.getAll(key).length !== 1)
              return authenticationResponse({ error: "invalid_request" }, 400);
          codeExchange = form.get("grant_type") === "authorization_code";
          if (form.get("grant_type") === "refresh_token") {
            try {
              await auth.assertRenewal(form.get("refresh_token") ?? "");
            } catch {
              return authenticationResponse({ error: "invalid_grant" }, 400);
            }
          }
        }
        try {
          const response = await auth.provider.handler(request);
          if (path === "/api/auth/oauth2/revoke" && response.ok) {
            await response.body?.cancel();
            return authenticationResponse({}, response.status);
          }
          if (
            (response.status < 300 || response.status >= 400) &&
            response.headers.get("content-type")?.includes("application/json")
          ) {
            const body = await response.json();
            if (response.ok) {
              if (codeExchange) await auth.bindNativeDevice(body.access_token);
              // Browser credentials travel in HttpOnly cookies, never in JSON or JS storage.
              if (!oauthToken && body && typeof body === "object") delete body.token;
              const headers = new Headers(response.headers);
              headers.delete("content-length");
              headers.set("Cache-Control", "no-store");
              headers.set("Referrer-Policy", "no-referrer");
              return new Response(JSON.stringify(body), { status: response.status, headers });
            }
            const safeCode =
              typeof body?.error === "string" && /^[a-z_]{1,64}$/.test(body.error)
                ? body.error
                : "invalid_request";
            return authenticationResponse(
              oauthProtocol
                ? { error: safeCode }
                : {
                    error: {
                      code: "AUTHENTICATION_FAILED",
                      message: "Authentication request could not be completed.",
                    },
                  },
              response.status,
            );
          }
          const headers = new Headers(response.headers);
          headers.set("Cache-Control", "no-store");
          headers.set("Referrer-Policy", "no-referrer");
          return new Response(response.body, { status: response.status, headers });
        } catch {
          return authenticationResponse(
            oauthProtocol
              ? { error: "invalid_grant" }
              : {
                  error: {
                    code: "AUTHENTICATION_FAILED",
                    message: "Authentication request could not be completed.",
                  },
                },
            400,
          );
        }
      },
      { parse: "none" },
    )
    .get("/v1/auth/native", () =>
      authenticationResponse({
        client_id: NATIVE_CLIENT_ID,
        issuer: `${auth.config.origin}/api/auth`,
        audience: auth.config.origin,
        authorization_endpoint: `${auth.config.origin}/api/auth/oauth2/authorize`,
        token_endpoint: `${auth.config.origin}/api/auth/oauth2/token`,
        redirect_uri: auth.config.nativeRedirectUri,
        response_type: "code",
        code_challenge_method: "S256",
        scope: "ngertiin offline_access",
      }),
    )
    .get("/v1/auth/session", async ({ request }) =>
      authenticationResponse(await auth.self(request)),
    )
    .get("/v1/auth/sessions", async ({ request }) =>
      authenticationResponse(await auth.sessions(request)),
    )
    .post(
      "/v1/auth/sessions/:sessionId/revoke",
      async ({ request, params }) =>
        authenticationResponse(await auth.revoke(request, params.sessionId)),
      { params: z.object({ sessionId: z.uuid() }), body: z.strictObject({}) },
    )
    .post(
      "/v1/auth/logout",
      async ({ request }) => {
        const principal = auth.principal(request);
        await auth.revoke(request, principal.sessionId);
        // Expire the same cookie name/path/attributes that the pinned provider created.
        const context = await auth.provider.$context;
        const cookie = context.authCookies.sessionToken;
        return authenticationResponse({ revoked: true }, 200, {
          "Set-Cookie": `${cookie.name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${auth.config.allowInsecureLoopback ? "" : "; Secure"}`,
        });
      },
      { body: z.strictObject({}) },
    )
    .post(
      "/v1/auth/renew",
      async ({ request }) => {
        if (auth.principal(request).kind !== "web")
          return authenticationResponse(
            {
              error: {
                code: "INVALID_REQUEST",
                message: "Native clients renew at the OAuth token endpoint.",
              },
            },
            400,
          );
        const response = await auth.provider.api.getSession({
          headers: request.headers,
          asResponse: true,
          query: { disableCookieCache: true },
        });
        await auth.authenticate(request);
        return authenticationResponse(await auth.self(request), response.status, response.headers);
      },
      { body: z.strictObject({}) },
    )
    .post(
      "/v1/auth/bootstrap",
      async ({ request, body }) =>
        authenticationResponse(await auth.claimBootstrap(request, body.token)),
      { body: z.strictObject({ token: z.string().min(32).max(128) }) },
    );
}
