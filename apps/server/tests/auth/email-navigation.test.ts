import { afterEach, expect, test } from "bun:test";
import { authFixture, fixturePassword, required } from "./helpers";

let f: Awaited<ReturnType<typeof authFixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
const navigation = {
  "Sec-Fetch-Site": "cross-site",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "document",
};

test("email verification accepts an external document navigation while cross-site fetches and mutations remain denied", async () => {
  f = await authFixture();
  await f.signup();
  const link = required(f.emails.find((message) => message.purpose === "verification")).url;
  for (const headers of [
    { ...navigation, Origin: "https://mail.example.test" },
    { ...navigation, "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty" },
  ])
    expect((await fetch(link, { headers, redirect: "manual" })).status).toBe(403);
  const invalid = new URL(link);
  invalid.searchParams.set("token", "invalid-fixture-verification-token");
  const rejected = await fetch(invalid, { headers: navigation, redirect: "manual" });
  expect(rejected.ok).toBe(false);
  const location = rejected.headers.get("Location");
  if (location) expect(new URL(location, f.origin).origin).toBe(f.origin);
  expect(
    (
      await f.http("/api/auth/sign-in/email", {
        email: "owner@example.test",
        password: fixturePassword,
      })
    ).status,
  ).toBe(403);
  const verified = await fetch(link, { headers: navigation, redirect: "manual" });
  expect([200, 302]).toContain(verified.status);
  expect((await f.http("/v1/auth/session")).status).toBe(401);
  const device = await f.login();
  expect((await f.http("/v1/auth/session", undefined, device.cookie, navigation)).status).toBe(403);
  expect((await f.http("/v1/auth/logout", {}, device.cookie, navigation)).status).toBe(403);
  expect((await f.http("/v1/auth/session", undefined, device.cookie)).status).toBe(200);
});

test("an external recovery-link navigation redirects only to the configured local reset screen", async () => {
  f = await authFixture();
  await f.owner();
  expect(
    (
      await f.http("/api/auth/request-password-reset", {
        email: "owner@example.test",
        redirectTo: `${f.origin}/reset-password`,
      })
    ).status,
  ).toBe(200);
  const link = required(f.emails.find((message) => message.purpose === "recovery")).url;
  const response = await fetch(link, { headers: navigation, redirect: "manual" });
  expect(response.status).toBe(302);
  const target = new URL(required(response.headers.get("Location")));
  expect(target.origin).toBe(f.origin);
  expect(target.pathname).toBe("/reset-password");
  expect(target.searchParams.get("token")).toBeTruthy();
});
