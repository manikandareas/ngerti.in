import { randomBytes } from "node:crypto";
import { Elysia } from "elysia";
import { createApi as createAccountApi } from "../../src/api";
import type { AuthenticationConfig } from "../../src/auth/config";
import type { AuthenticationEmail, EmailDelivery } from "../../src/auth/email";
import { Authentication } from "../../src/auth/service";
import { Background } from "../../src/background";
import { Connections } from "../../src/harness/connections";
import { ProductTools } from "../../src/harness/tools";
import { fixture } from "../helpers";

export const fixturePassword = "A-long-fixture-password-948!";
export interface AuthFixtureTransport {
  tls?: { key: string; cert: string };
  nativeRedirectUri?: string;
}
export async function authFixture(
  deliver?: EmailDelivery,
  httpPort = 0,
  transport?: AuthFixtureTransport,
) {
  const domain = await fixture();
  let api: Awaited<ReturnType<typeof createAccountApi>>;
  let handler = (request: Request): Response | Promise<Response> => api.handle(request);
  const edge = new Elysia()
    .all("*", ({ request }) => handler(request), { parse: "none" })
    .listen({
      hostname: "127.0.0.1",
      port: httpPort,
      ...(transport?.tls ? { tls: transport.tls } : {}),
    });
  let replacement: typeof api | undefined;
  const callback = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response("Callback requires an active native flow.", { status: 400 }),
  });
  const origin = `${transport?.tls ? "https" : "http"}://127.0.0.1:${required(edge.server).port}`;
  const config: AuthenticationConfig = {
    mode: "accounts",
    origin,
    secret: randomBytes(48).toString("hex"),
    schema: `auth_${domain.owner.replaceAll("-", "")}`,
    nativeRedirectUri: transport?.nativeRedirectUri ?? `http://127.0.0.1:${callback.port}/callback`,
    allowInsecureLoopback: !transport?.tls,
    email: { delivery: "resend", from: "auth@example.test", apiKey: "fixture-not-a-provider-key" },
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
        await deliver?.(message);
      },
    );
    api = await createAccountApi(domain.lifecycle, new Background(domain.lifecycle), {
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
    serve(next: typeof handler) {
      handler = next;
    },
    async listenApi(next: typeof api) {
      await edge.stop(true);
      replacement = next;
      next.listen({
        hostname: "127.0.0.1",
        port: Number(new URL(origin).port),
        ...(transport?.tls ? { tls: transport.tls } : {}),
      });
    },
    api,
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
      if (replacement?.server) {
        // Bun 1.3.10 can retain a stale WebSocket count after all observed peers close.
        const server = replacement.server;
        await Promise.race([replacement.stop(true), Bun.sleep(1000)]);
        server.unref();
      }
      if (edge.server) await edge.stop(true);
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
