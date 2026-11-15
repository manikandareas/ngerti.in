import { afterEach, expect, test } from "bun:test";
import { authenticationConfig } from "../../src/auth/config";
import { nativeAuthorization } from "../../src/auth/native-client";
import { CuaMachine } from "../../src/machines/cua";
import { Machines } from "../../src/machines/service";
import { MachineViews } from "../../src/machines/view";
import { authFixture, required } from "./helpers";

let f: Awaited<ReturnType<typeof authFixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
const env = {
  APP_ENV: "production",
  NGERTIIN_AUTH_URL: "https://auth.example.test",
  NGERTIIN_AUTH_SECRET: "a".repeat(48),
  NGERTIIN_AUTH_EMAIL_FROM: "auth@example.test",
  NGERTIIN_AUTH_RESEND_API_KEY: "fixture",
};

test("account mode fails closed on missing secrets, insecure origins or unsafe callbacks", () => {
  expect(() => authenticationConfig({ APP_ENV: "production" })).toThrow();
  expect(authenticationConfig(env)?.origin).toBe("https://auth.example.test");
  for (const override of [
    { NGERTIIN_AUTH_SECRET: "short" },
    { NGERTIIN_AUTH_URL: "http://auth.example.test" },
    { NGERTIIN_AUTH_URL: "https://user:password@auth.example.test" },
    { NGERTIIN_AUTH_NATIVE_REDIRECT_URI: "http://0.0.0.0:5000/callback" },
    { NGERTIIN_AUTH_NATIVE_REDIRECT_URI: "https://other.example/callback" },
    { NGERTIIN_AUTH_SCHEMA: "public; drop table user" },
  ])
    expect(() => authenticationConfig({ ...env, ...override })).toThrow();
  expect(() =>
    authenticationConfig({
      ...env,
      NGERTIIN_AUTH_URL: "http://127.0.0.1:5000",
      NGERTIIN_AUTH_ALLOW_INSECURE_LOOPBACK: "true",
      APP_ENV: "production",
    }),
  ).toThrow();
});

async function authorization(cookie: string) {
  const flow = nativeAuthorization(required(f).origin, required(f).config.nativeRedirectUri);
  const response = await fetch(flow.authorizeUrl, {
    headers: { Cookie: cookie },
    redirect: "manual",
  });
  expect(response.status).toBe(302);
  const callback = required(response.headers.get("location"));
  return { flow, callback, exchange: () => flow.exchange(callback) };
}
async function native(cookie: string) {
  const code = await authorization(cookie);
  const response = await fetch(`${required(f).origin}/api/auth/oauth2/token`, {
    method: "POST",
    body: code.exchange(),
  });
  expect(response.status).toBe(200);
  return response.json();
}

test("native callback rejects wrong state, issuer, redirect, duplicate fields and replay", async () => {
  f = await authFixture();
  const browser = await f.owner();
  const code = await authorization(browser.cookie);
  for (const [key, value] of [
    ["state", "wrong-state"],
    ["iss", "https://other.example/api/auth"],
  ]) {
    const invalid = new URL(code.callback);
    invalid.searchParams.set(key, value);
    expect(() => code.flow.exchange(invalid.toString())).toThrow();
  }
  const wrongRedirect = new URL(code.callback);
  wrongRedirect.pathname = "/other";
  expect(() => code.flow.exchange(wrongRedirect.toString())).toThrow();
  const duplicates = new URL(code.callback);
  duplicates.searchParams.append("state", "second-state");
  expect(() => code.flow.exchange(duplicates.toString())).toThrow();
  const valid = code.exchange();
  expect(valid.has("client_secret")).toBe(false);
  expect(() => code.exchange()).toThrow();
});

test("token endpoint rejects wrong verifier, redirect, audience, code replay and client registration", async () => {
  f = await authFixture();
  const browser = await f.owner();
  for (const [field, value] of [
    ["code_verifier", "invalid-verifier-that-is-at-least-forty-three-characters"],
    ["redirect_uri", "http://127.0.0.1:1/callback"],
    ["resource", "https://other.example"],
  ]) {
    const code = await authorization(browser.cookie);
    const form = code.exchange();
    form.set(field, value);
    expect(
      (await fetch(`${f.origin}/api/auth/oauth2/token`, { method: "POST", body: form })).status,
    ).toBeGreaterThanOrEqual(400);
  }
  const code = await authorization(browser.cookie);
  const form = code.exchange();
  expect(
    (await fetch(`${f.origin}/api/auth/oauth2/token`, { method: "POST", body: form })).status,
  ).toBe(200);
  expect(
    (await fetch(`${f.origin}/api/auth/oauth2/token`, { method: "POST", body: form })).status,
  ).toBe(400);
  expect(
    (
      await f.http(
        "/api/auth/oauth2/register",
        { redirect_uris: ["https://other.example"] },
        browser.cookie,
      )
    ).status,
  ).toBe(404);
  expect((await f.http("/api/auth/admin/oauth2/create-client", {}, browser.cookie)).status).toBe(
    404,
  );
  const flow = nativeAuthorization(f.origin, f.config.nativeRedirectUri);
  const plain = new URL(flow.authorizeUrl);
  plain.searchParams.set("code_challenge_method", "plain");
  const rejected = await fetch(plain, { headers: { Cookie: browser.cookie }, redirect: "manual" });
  expect(
    rejected.status >= 400 ||
      new URL(required(rejected.headers.get("location"))).searchParams.has("error"),
  ).toBe(true);
});

test("expired access/device sessions fail API, SSE and renewal without affecting another device", async () => {
  f = await authFixture();
  const browser = await f.owner();
  const tokens = await native(browser.cookie);
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  const session = await (await f.http("/v1/auth/session", undefined, undefined, headers)).json();
  await f.auth.pool.query(
    "UPDATE session SET \"expiresAt\"=now()-interval '1 second' WHERE id=$1",
    [session.session_id],
  );
  expect((await f.http("/v1/events", undefined, undefined, headers)).status).toBe(401);
  expect((await f.http("/v1/events/stream", undefined, undefined, headers)).status).toBe(401);
  const renewal = await fetch(`${f.origin}/api/auth/oauth2/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: "ngertiin-tauri",
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource: f.origin,
    }),
  });
  expect(renewal.status).toBe(400);
  expect((await f.http("/v1/events", undefined, browser.cookie)).status).toBe(200);
});

test("revocation closes an existing HTTP SSE stream and preserves another device", async () => {
  f = await authFixture();
  const first = await f.owner();
  const second = await f.login();
  const self = await (await f.http("/v1/auth/session", undefined, first.cookie)).json();
  const stream = await f.http(
    `/v1/events/stream?after=${await f.domain.store.cursor}`,
    undefined,
    first.cookie,
  );
  expect(stream.status).toBe(200);
  const reader = required(stream.body).getReader();
  expect((await reader.read()).done).toBe(false);
  const pending = reader.read().catch(() => ({ done: true }));
  expect(
    (await f.http(`/v1/auth/sessions/${self.session_id}/revoke`, {}, second.cookie)).status,
  ).toBe(200);
  const ended = await Promise.race([
    pending.then((value) => value.done),
    Bun.sleep(2500).then(() => false),
  ]);
  expect(ended).toBe(true);
  await reader.cancel();
  expect((await f.http("/v1/events", undefined, second.cookie)).status).toBe(200);
});

class ViewerHost extends CuaMachine {
  override async tools() {
    return { contractVersion: "fixture", tools: [] };
  }
  override async rpc(name: string): Promise<unknown> {
    if (name.endsWith("CreateViewerTicket")) return { ticket: "fixture-native-viewer-ticket" };
    return {
      version: "fixture",
      features: ["driver", "pty", "process.exec_ledger"].map((name) => ({ name, supported: true })),
    };
  }
}
test("viewer tickets are bound to a live device and cannot be renewed from another device", async () => {
  f = await authFixture();
  const first = await f.owner();
  const second = await f.login();
  const config = {
    id: crypto.randomUUID(),
    endpoint: "http://127.0.0.1:3211",
    token: "fixture-machine-token".repeat(4),
    root: "/home/cua/workspace" as const,
    generation: 1,
    project: "ngertiin-machine-1234abcd",
  };
  const machines = await Machines.open(f.domain.lifecycle, config, new ViewerHost(config));
  const views = new MachineViews(machines);
  try {
    const request = new Request(`${f.origin}/v1/machine/view`, {
      headers: { Cookie: first.cookie },
    });
    const principal = await f.auth.authenticate(request);
    const lease = f.auth.lease(request);
    const card = await views.issue(f.origin, false, f.origin, lease);
    const viewRequest = new Request(`${f.origin}${card.viewer_url}`, {
      headers: { Cookie: first.cookie },
    });
    await expect(views.authorize(new Request(`${f.origin}${card.viewer_url}`))).rejects.toThrow(
      "UNAUTHORIZED",
    );
    expect((await views.authorize(viewRequest)).id).toBe(card.viewer_id);
    await expect(views.renew(card.viewer_id, f.origin, crypto.randomUUID())).rejects.toThrow(
      "SCOPE_DENIED",
    );
    expect(
      (await f.http(`/v1/auth/sessions/${principal.sessionId}/revoke`, {}, second.cookie)).status,
    ).toBe(200);
    expect(lease.signal.aborted).toBe(true);
    await expect(views.authorize(viewRequest)).rejects.toThrow("UNAUTHORIZED");
    await expect(views.renew(card.viewer_id, f.origin, principal.sessionId)).rejects.toThrow(
      "UNAUTHORIZED",
    );
  } finally {
    await views.close();
    await machines.close();
  }
});

test("password recovery revokes native offline credentials and leaves no auth secrets in domain records", async () => {
  f = await authFixture();
  const browser = await f.owner();
  const tokens = await native(browser.cookie);
  await f.http("/api/auth/request-password-reset", {
    email: "owner@example.test",
    redirectTo: `${f.origin}/reset-password`,
  });
  const message = required(f.emails.findLast((message) => message.purpose === "recovery"));
  const token = required(new URL(message.url).pathname.split("/").at(-1));
  expect(
    (
      await f.http("/api/auth/reset-password", {
        token,
        newPassword: "Another-long-fixture-password-179!",
      })
    ).status,
  ).toBe(200);
  expect(
    (
      await f.http("/v1/events", undefined, undefined, {
        Authorization: `Bearer ${tokens.access_token}`,
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${f.origin}/api/auth/oauth2/token`, {
        method: "POST",
        body: new URLSearchParams({
          client_id: "ngertiin-tauri",
          grant_type: "refresh_token",
          refresh_token: tokens.refresh_token,
          resource: f.origin,
        }),
      })
    ).status,
  ).toBe(400);
  const records = JSON.stringify({
    events: await f.domain.store.events(0, 1000),
    commands: (await f.domain.store.query("SELECT * FROM commands")).rows,
  });
  for (const secret of [
    tokens.access_token,
    tokens.refresh_token,
    token,
    "Another-long-fixture-password-179!",
  ])
    expect(records.includes(secret)).toBe(false);
});

test("account-mode export identifies auth classes and the verified multi-user API gate", async () => {
  f = await authFixture();
  const owner = await f.owner();
  const response = await f.http("/v1/contracts", undefined, owner.cookie);
  expect(response.status).toBe(200);
  const contract = await response.json();
  expect(contract.authentication.readiness_gate).toBe("ready");
  expect(
    contract.http.find((route: { path: string }) => route.path === "/v1/events").authentication,
  ).toBe("user_session_or_oauth_access_token");
  expect(
    contract.http.find((route: { path: string }) => route.path === "/v1/harness/tools")
      .authentication,
  ).toBe("run_lease");
  expect(
    contract.http.find((route: { path: string }) => route.path === "/v1/auth/native")
      .authentication,
  ).toBe("public");
});

test("HTTPS configuration serializes Secure cookies and ignores spoofed proxy addresses", async () => {
  f = await authFixture();
  await f.owner();
  const { createAuthenticationProvider } = await import("../../src/auth/provider");
  const provider = createAuthenticationProvider(
    { ...f.config, origin: "https://auth.example.test", allowInsecureLoopback: false },
    f.auth.pool,
    async () => {},
    () => {},
  );
  const response = await provider.handler(
    new Request("https://auth.example.test/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://auth.example.test",
        "X-Forwarded-For": "192.0.2.1",
      },
      body: JSON.stringify({
        email: "owner@example.test",
        password: "A-long-fixture-password-948!",
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Secure");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(provider.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([]);
});

test("rate limits survive changing untrusted forwarding headers", async () => {
  f = await authFixture();
  for (let i = 0; i < 5; i++) {
    expect(
      (
        await f.http(
          "/api/auth/request-password-reset",
          { email: "missing@example.test" },
          undefined,
          { "X-Forwarded-For": `192.0.2.${i + 1}` },
        )
      ).status,
    ).toBe(200);
  }
  expect(
    (
      await f.http(
        "/api/auth/request-password-reset",
        { email: "missing@example.test" },
        undefined,
        { "X-Forwarded-For": "192.0.2.99" },
      )
    ).status,
  ).toBe(429);
});

test("a native device outlives browser logout and access-token revocation closes its stream", async () => {
  f = await authFixture();
  const browser = await f.owner();
  const tokens = await native(browser.cookie);
  const headers = { Authorization: `Bearer ${tokens.access_token}` };
  expect((await f.http("/v1/auth/logout", {}, browser.cookie)).status).toBe(200);
  expect((await f.http("/v1/events", undefined, undefined, headers)).status).toBe(200);
  const stream = await f.http(
    `/v1/events/stream?after=${await f.domain.store.cursor}`,
    undefined,
    undefined,
    headers,
  );
  const reader = required(stream.body).getReader();
  await reader.read();
  const pending = reader.read().catch(() => ({ done: true }));
  const revoked = await fetch(`${f.origin}/api/auth/oauth2/revoke`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: "ngertiin-tauri",
      token: tokens.access_token,
      token_type_hint: "access_token",
    }),
  });
  expect(revoked.status).toBe(200);
  expect(
    await Promise.race([pending.then((value) => value.done), Bun.sleep(2500).then(() => false)]),
  ).toBe(true);
  await reader.cancel();
  expect((await f.http("/v1/events", undefined, undefined, headers)).status).toBe(401);
});
