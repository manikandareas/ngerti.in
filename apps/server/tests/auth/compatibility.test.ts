import { expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { Elysia } from "elysia";
import { Pool } from "pg";
import { required } from "./helpers";

test("pinned Better Auth, PostgreSQL, Elysia and public-client PKCE complete real HTTP", async () => {
  const schema = `auth_compat_${crypto.randomUUID().replaceAll("-", "")}`;
  const pool = new Pool({
    connectionString: process.env.NGERTIIN_TEST_DATABASE_URL,
    options: `-c search_path=${schema},pg_catalog`,
  });
  let handler: (request: Request) => Promise<Response>;
  const app = new Elysia()
    .all("/api/auth/*", ({ request }) => handler(request), { parse: "none" })
    .listen({ hostname: "127.0.0.1", port: 0 });
  const origin = `http://127.0.0.1:${required(app.server).port}`;
  const auth = betterAuth({
    baseURL: origin,
    secret: randomBytes(48).toString("hex"),
    database: pool,
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
    plugins: [
      oauthProvider({
        loginPage: "/sign-in",
        consentPage: "/consent",
        disableJwtPlugin: true,
        scopes: ["ngertiin", "offline_access"],
        resources: [origin],
        clientPrivileges: () => true,
      }),
    ],
  });
  handler = auth.handler;
  try {
    await pool.query(`CREATE SCHEMA "${schema}"`);
    const migration = await getMigrations(auth.options);
    await migration.runMigrations();
    const signup = await fetch(`${origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        name: "Compatibility",
        email: "compat@example.test",
        password: "compatibility-password-123",
      }),
    });
    expect(signup.status).toBe(200);
    const cookie = signup.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const client = await auth.api.adminCreateOAuthClient({
      headers: new Headers({ Cookie: cookie, Origin: origin }),
      body: {
        client_name: "Compatibility native",
        application_type: "native",
        token_endpoint_auth_method: "none",
        redirect_uris: ["http://127.0.0.1:39473/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        scope: "ngertiin offline_access",
        resources: [origin],
        require_pkce: true,
        skip_consent: true,
      },
    });
    expect(client.client_secret).toBeUndefined();
    const verifier = randomBytes(32).toString("base64url");
    const authorize = new URL(`${origin}/api/auth/oauth2/authorize`);
    authorize.search = new URLSearchParams({
      client_id: client.client_id,
      redirect_uri: "http://127.0.0.1:39473/callback",
      response_type: "code",
      scope: "ngertiin offline_access",
      state: "compatibility-state",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
      resource: origin,
    }).toString();
    const authorized = await fetch(authorize, { headers: { Cookie: cookie }, redirect: "manual" });
    expect(authorized.status).toBe(302);
    const callback = new URL(required(authorized.headers.get("location")));
    expect(callback.searchParams.get("state")).toBe("compatibility-state");
    const token = await fetch(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: client.client_id,
        grant_type: "authorization_code",
        code: required(callback.searchParams.get("code")),
        redirect_uri: "http://127.0.0.1:39473/callback",
        code_verifier: verifier,
        resource: origin,
      }),
    });
    expect(token.status).toBe(200);
    const tokens = await token.json();
    expect(typeof tokens.access_token).toBe("string");
    expect(typeof tokens.refresh_token).toBe("string");
  } finally {
    await app.stop(true);
    await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
    await pool.end();
  }
});
