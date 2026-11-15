import { randomBytes } from "node:crypto";
import { dirname } from "node:path";
import { Elysia } from "elysia";
import { createApi } from "../src/api";
import type { ApiServices } from "../src/api/services";
import type { AuthenticationEmail } from "../src/auth/email";
import { Authentication } from "../src/auth/service";
import type { Background } from "../src/background";
import { Connections } from "../src/harness/connections";
import { CredentialStorage } from "../src/harness/credential-storage";
import { ProductTools } from "../src/harness/tools";
import type { Lifecycle } from "../src/lifecycle";
import type { Store } from "../src/store";

const fixtures = new WeakMap<Store, Promise<{ auth: Authentication; cookie: string }>>();

async function authenticatedOwner(store: Store) {
  const connection = process.env.NGERTIIN_TEST_DATABASE_URL;
  if (!connection) throw new Error("HTTP fixtures require disposable PostgreSQL.");
  const emails: AuthenticationEmail[] = [];
  const schema = `http_auth_${store.ownerId.replaceAll("-", "")}`;
  const origin = "http://127.0.0.1:43129";
  const auth = await Authentication.open(
    {
      mode: "accounts",
      origin,
      secret: randomBytes(48).toString("hex"),
      schema,
      nativeRedirectUri: "http://127.0.0.1:43119/callback",
      allowInsecureLoopback: true,
      email: { delivery: "resend", from: "fixture@example.test", apiKey: "fixture" },
    },
    connection,
    store.ownerId,
    async (message) => {
      emails.push(message);
    },
  );
  const close = store.close.bind(store);
  let closed = false;
  store.close = async () => {
    if (closed) return close();
    closed = true;
    try {
      await auth.pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    } finally {
      await auth.close();
      await close();
    }
  };
  const body = {
    email: "owner@example.test",
    name: "Fixture owner",
    password: "Fixture-owner-password-948!",
  };
  const post = (path: string) =>
    auth.provider.handler(
      new Request(`${origin}/api/auth/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify(body),
      }),
    );
  if (!(await post("sign-up/email")).ok) throw new Error("Fixture account registration failed.");
  const verification = emails.find((message) => message.purpose === "verification");
  if (!verification) throw new Error("Fixture verification email is missing.");
  await auth.provider.handler(new Request(verification.url));
  const login = await post("sign-in/email");
  if (!login.ok) throw new Error("Fixture account sign-in failed.");
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .join("; ");
  const user = (await auth.pool.query('SELECT id FROM "user" WHERE email=$1', [body.email]))
    .rows[0];
  await auth.pool.query("UPDATE ngertiin_owner_binding SET user_id=$1,bound_at=now() WHERE id=1", [
    user.id,
  ]);
  return { auth, cookie };
}

/** Domain HTTP tests use a real verified account. The fixture credential only selects that test session. */
export async function fixtureApi(
  lifecycle: Lifecycle,
  background: Background,
  credential: string,
  services?: Omit<ApiServices, "authentication">,
) {
  let saved = fixtures.get(lifecycle.store);
  if (!saved) {
    saved = authenticatedOwner(lifecycle.store);
    fixtures.set(lifecycle.store, saved);
  }
  const { auth, cookie } = await saved;
  const api = await createApi(lifecycle, background, {
    authentication: auth,
    connections: new Connections(lifecycle),
    tools: await ProductTools.open(lifecycle),
    credentialStorage: new CredentialStorage(dirname(lifecycle.store.path)),
    ...services,
  });
  const handle = api.fetch.bind(api);
  const authenticated = (request: Request) => {
    if (new URL(request.url).pathname === "/v1/harness/tools") return handle(request);
    if (request.headers.get("Authorization") !== `Bearer ${credential}`) return handle(request);
    const headers = new Headers(request.headers);
    headers.delete("Authorization");
    headers.set("Cookie", cookie);
    if (!headers.has("Origin")) headers.set("Origin", auth.config.origin);
    return handle(new Request(request, { headers }));
  };
  const edge = new Elysia().all("*", ({ request }) => authenticated(request), { parse: "none" });
  const stop = edge.stop.bind(edge);
  edge.stop = async (force) => {
    await api.stop(force);
    return edge.server ? stop(force) : edge;
  };
  return edge;
}
