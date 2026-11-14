import { randomBytes } from "node:crypto";
import { Elysia } from "elysia";
import { createApi } from "../../src/api";
import type { AuthenticationConfig } from "../../src/auth/config";
import type { AuthenticationEmail } from "../../src/auth/email";
import { Authentication } from "../../src/auth/service";
import { Background } from "../../src/background";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

export const fixturePassword = "A-long-fixture-password-948!";
export async function authFixture() {
  const domain = await fixture();
  let api: Awaited<ReturnType<typeof createApi>>;
  const edge = new Elysia()
    .all("*", ({ request }) => api.handle(request), { parse: "none" })
    .listen({ hostname: "127.0.0.1", port: 0 });
  const callback = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("Callback requires an active native flow.", { status: 400 }),
  });
  const origin = `http://127.0.0.1:${required(edge.server).port}`;
  const config: AuthenticationConfig = {
    mode: "accounts",
    origin,
    secret: randomBytes(48).toString("hex"),
    schema: `auth_${domain.owner.replaceAll("-", "")}`,
    nativeRedirectUri: `http://127.0.0.1:${callback.port}/callback`,
    allowInsecureLoopback: true,
    email: { from: "auth@example.test", apiKey: "fixture-not-a-provider-key" },
  };
  const emails: AuthenticationEmail[] = [];
  let auth: Authentication;
  try {
    auth = await Authentication.open(
      config,
      required(domain.options.connectionString),
      domain.owner,
      async (message) => {
        emails.push(message);
      },
    );
    api = await createApi(domain.lifecycle, new Background(domain.lifecycle), "o".repeat(64), {
      authentication: auth,
      tools: await ProductTools.open(domain.lifecycle),
      connections: new Connections(domain.lifecycle),
    });
  } catch (error) {
    await edge.stop(true);
    await callback.stop(true);
    await domain.close();
    throw error;
  }
  async function http(path: string, body?: unknown, cookie?: string, headers?: HeadersInit) {
    const all = new Headers(headers);
    if (cookie) all.set("Cookie", cookie);
    if (body !== undefined) {
      all.set("Content-Type", "application/json");
      if (!all.has("Origin")) all.set("Origin", origin);
    }
    return fetch(`${origin}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: all,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "manual",
    });
  }
  async function signup(email = "owner@example.test") {
    const response = await http("/api/auth/sign-up/email", {
      email,
      password: fixturePassword,
      name: email.split("@")[0],
    });
    if (response.status !== 200) throw new Error(`Fixture signup failed: ${response.status}`);
    return response;
  }
  async function verify(email = "owner@example.test") {
    const message = emails.findLast(
      (message) => message.to === email && message.purpose === "verification",
    );
    if (!message) throw new Error("Verification delivery was not captured.");
    const response = await fetch(message.url, { redirect: "manual" });
    if (response.status !== 302 && response.status !== 200)
      throw new Error(`Fixture verification failed: ${response.status}`);
  }
  async function login(email = "owner@example.test", password = fixturePassword) {
    const response = await http("/api/auth/sign-in/email", { email, password });
    if (response.status !== 200) throw new Error(`Fixture login failed: ${response.status}`);
    const cookie = response.headers
      .getSetCookie()
      .map((entry) => entry.split(";")[0])
      .join("; ");
    if (!cookie) throw new Error("Fixture login did not set a cookie.");
    return { cookie, response };
  }
  async function owner() {
    await signup();
    await verify();
    const device = await login();
    const grant = await auth.issueBootstrap("owner@example.test");
    const result = await http("/v1/auth/bootstrap", { token: grant.token }, device.cookie);
    if (result.status !== 200) throw new Error(`Fixture bootstrap failed: ${result.status}`);
    return device;
  }
  return {
    domain,
    auth,
    config,
    origin,
    emails,
    callback,
    http,
    signup,
    verify,
    login,
    owner,
    async close() {
      await edge.stop(true);
      await callback.stop(true);
      await auth.close();
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: domain.options.connectionString });
      try {
        await pool.query(`DROP SCHEMA "${config.schema}" CASCADE`);
      } finally {
        await pool.end();
      }
      await domain.close();
    },
  };
}

export function required<T>(value: T | null | undefined): T {
  if (value === null || value === undefined)
    throw new Error("Required fixture value is unavailable.");
  return value;
}
