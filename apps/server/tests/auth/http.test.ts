import { afterEach, expect, test } from "bun:test";
import { nativeAuthorization } from "../../src/auth/native-client";
import { Authentication } from "../../src/auth/service";
import { authFixture, fixturePassword, required } from "./helpers";

let f: Awaited<ReturnType<typeof authFixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});

test("verified login uses HttpOnly cookies, redacts tokens and denies installation credentials", async () => {
  f = await authFixture();
  expect((await f.http("/v1/events")).status).toBe(401);
  expect(
    (
      await f.http("/v1/events", undefined, undefined, {
        Authorization: `Bearer ${"o".repeat(64)}`,
      })
    ).status,
  ).toBe(401);
  expect(
    (await f.http("/api/auth/ngertiin/verify-access", { token: "private-input" })).status,
  ).toBe(404);
  const signup = await f.signup();
  expect(await signup.text()).not.toContain('"token"');
  expect(
    (
      await f.http("/api/auth/sign-in/email", {
        email: "owner@example.test",
        password: fixturePassword,
      })
    ).status,
  ).toBe(403);
  await f.verify();
  const device = await f.login();
  expect(device.response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(device.response.headers.get("set-cookie")).toContain("SameSite=Lax");
  expect(await device.response.text()).not.toContain('"token"');
  expect((await f.http("/v1/auth/session", undefined, device.cookie)).status).toBe(200);
  expect((await f.http("/v1/events", undefined, device.cookie)).status).toBe(403);
  const list = await f.http("/v1/auth/sessions", undefined, device.cookie);
  expect(await list.text()).not.toContain('"token"');
});

test("Owner bootstrap requires verified intended identity, expires and consumes once under a race", async () => {
  f = await authFixture();
  await f.signup();
  await f.verify();
  const owner = await f.login();
  await f.signup("outsider@example.test");
  await f.verify("outsider@example.test");
  const outsider = await f.login("outsider@example.test");
  let grant = await f.auth.issueBootstrap("owner@example.test");
  expect((await f.http("/v1/auth/bootstrap", { token: grant.token })).status).toBe(401);
  expect((await f.http("/v1/auth/bootstrap", { token: grant.token }, outsider.cookie)).status).toBe(
    403,
  );
  await f.auth.pool.query(
    "UPDATE ngertiin_owner_bootstrap SET expires_at=now()-interval '1 second'",
  );
  expect((await f.http("/v1/auth/bootstrap", { token: grant.token }, owner.cookie)).status).toBe(
    403,
  );
  grant = await f.auth.issueBootstrap("owner@example.test");
  const results = await Promise.all([
    f.http("/v1/auth/bootstrap", { token: grant.token }, owner.cookie),
    f.http("/v1/auth/bootstrap", { token: grant.token }, owner.cookie),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 403]);
  expect((await f.http("/v1/events", undefined, owner.cookie)).status).toBe(200);
  expect((await f.http("/v1/entities/agent", undefined, outsider.cookie)).status).toBe(403);
  expect((await f.http("/v1/events/stream", undefined, outsider.cookie)).status).toBe(403);
  await expect(f.auth.issueBootstrap("outsider@example.test")).rejects.toThrow("already bound");
});

test("one device can renew, revoke and logout without ending another device or durable work", async () => {
  f = await authFixture();
  const first = await f.owner();
  const second = await f.login();
  const firstSession = await (await f.http("/v1/auth/session", undefined, first.cookie)).json();
  const secondSession = await (await f.http("/v1/auth/session", undefined, second.cookie)).json();
  expect(firstSession.session_id).not.toBe(secondSession.session_id);
  expect((await f.http("/v1/auth/renew", {}, second.cookie)).status).toBe(200);
  expect(
    (await (await f.http("/v1/auth/sessions", undefined, first.cookie)).json()).sessions,
  ).toHaveLength(2);
  expect(
    (await f.http(`/v1/auth/sessions/${firstSession.session_id}/revoke`, {}, second.cookie)).status,
  ).toBe(200);
  expect((await f.http("/v1/auth/session", undefined, first.cookie)).status).toBe(401);
  expect((await f.http("/v1/events/stream", undefined, first.cookie)).status).toBe(401);
  expect((await f.http("/v1/events", undefined, second.cookie)).status).toBe(200);
  const before = await f.domain.store.list("agent");
  expect((await f.http("/v1/auth/logout", {}, second.cookie)).status).toBe(200);
  expect((await f.http("/v1/auth/session", undefined, second.cookie)).status).toBe(401);
  expect(await f.domain.store.list("agent")).toEqual(before);
});

test("cross-origin and missing-origin cookie mutations fail without disclosing input", async () => {
  f = await authFixture();
  const device = await f.owner();
  expect(
    (await f.http("/v1/auth/logout", {}, device.cookie, { Origin: "https://attacker.example" }))
      .status,
  ).toBe(403);
  expect(
    (
      await fetch(`${f.origin}/v1/auth/logout`, {
        method: "POST",
        headers: { Cookie: device.cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await f.http(
        "/api/auth/sign-in/email",
        { email: "owner@example.test", password: "secret-do-not-echo" },
        undefined,
        { Origin: "https://attacker.example" },
      )
    ).status,
  ).toBe(403);
  const failure = await f.http("/api/auth/sign-in/email", {
    email: "owner@example.test",
    password: "secret-do-not-echo",
  });
  expect(await failure.text()).not.toContain("secret-do-not-echo");
  expect((await f.http("/v1/auth/session", undefined, device.cookie)).status).toBe(200);
});

test("recovery uses controlled email delivery and retires old sessions", async () => {
  f = await authFixture();
  const device = await f.owner();
  expect(
    (
      await f.http("/api/auth/request-password-reset", {
        email: "owner@example.test",
        redirectTo: `${f.origin}/reset-password`,
      })
    ).status,
  ).toBe(200);
  const message = required(f.emails.findLast((message) => message.purpose === "recovery"));
  expect(message.to).toBe("owner@example.test");
  const token = required(new URL(message.url).pathname.split("/").at(-1));
  const password = "Replacement-fixture-password-159!";
  expect((await f.http("/api/auth/reset-password", { token, newPassword: password })).status).toBe(
    200,
  );
  expect((await f.http("/v1/auth/session", undefined, device.cookie)).status).toBe(401);
  expect(
    (
      await f.http("/api/auth/sign-in/email", {
        email: "owner@example.test",
        password: fixturePassword,
      })
    ).status,
  ).toBe(401);
  expect((await f.login("owner@example.test", password)).cookie.length).toBeGreaterThan(0);
  expect(
    (await f.http("/api/auth/reset-password", { token, newPassword: fixturePassword })).status,
  ).toBe(400);
});

test("native loopback PKCE exchange, rotation and per-device revocation complete over real HTTP", async () => {
  f = await authFixture();
  const browser = await f.owner();
  const flow = nativeAuthorization(f.origin, f.config.nativeRedirectUri);
  let exchangeBody: URLSearchParams | undefined;
  f.callback.reload({
    fetch: async (request) => {
      exchangeBody = flow.exchange(request.url);
      return new Response("Native callback accepted.");
    },
  });
  const authorize = await fetch(flow.authorizeUrl, {
    headers: { Cookie: browser.cookie },
    redirect: "manual",
  });
  expect(authorize.status).toBe(302);
  const callback = required(authorize.headers.get("location"));
  expect((await fetch(callback)).status).toBe(200);
  const tokenReply = await fetch(`${f.origin}/api/auth/oauth2/token`, {
    method: "POST",
    body: exchangeBody,
  });
  expect(tokenReply.status).toBe(200);
  const tokens = await tokenReply.json();
  const nativeHeaders = { Authorization: `Bearer ${tokens.access_token}` };
  const nativeSession = await (
    await f.http("/v1/auth/session", undefined, undefined, nativeHeaders)
  ).json();
  expect(nativeSession.authentication).toBe("native");
  const webSession = await (await f.http("/v1/auth/session", undefined, browser.cookie)).json();
  expect(nativeSession.session_id).not.toBe(webSession.session_id);
  expect((await f.http("/v1/events", undefined, undefined, nativeHeaders)).status).toBe(200);
  const renewed = await fetch(`${f.origin}/api/auth/oauth2/token`, {
    method: "POST",
    body: new URLSearchParams({
      client_id: "ngertiin-tauri",
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      resource: f.origin,
    }),
  });
  expect(renewed.status).toBe(200);
  const rotated = await renewed.json();
  expect(rotated.refresh_token === tokens.refresh_token).toBe(false);
  expect(
    (await f.http(`/v1/auth/sessions/${nativeSession.session_id}/revoke`, {}, browser.cookie))
      .status,
  ).toBe(200);
  expect((await f.http("/v1/events", undefined, undefined, nativeHeaders)).status).toBe(401);
  expect(
    (
      await f.http("/v1/auth/session", undefined, undefined, {
        Authorization: `Bearer ${rotated.access_token}`,
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
          refresh_token: rotated.refresh_token,
          resource: f.origin,
        }),
      })
    ).status,
  ).toBe(400);
  expect((await f.http("/v1/events", undefined, browser.cookie)).status).toBe(200);
  expect(() => flow.exchange(callback)).toThrow();
});

test("persisted sessions and Owner mapping survive reopening the auth service", async () => {
  f = await authFixture();
  const device = await f.owner();
  const reopened = await Authentication.open(
    f.config,
    required(f.domain.options.connectionString),
    f.domain.owner,
    async () => {},
  );
  try {
    const request = new Request(`${f.origin}/v1/events`, { headers: { Cookie: device.cookie } });
    await reopened.authenticate(request);
    await reopened.assertOwner(request);
    expect((await reopened.self(request)).user.email).toBe("owner@example.test");
  } finally {
    await reopened.close();
  }
});
