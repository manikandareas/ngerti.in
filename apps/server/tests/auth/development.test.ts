import { expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { authenticationConfig } from "../../src/auth/config";
import { authenticationEmailDelivery } from "../../src/auth/email";
import { inboxMessages, startDevelopmentInbox } from "../../src/auth/inbox";

test("development always enables accounts, retains its secret and delivers private local email without Resend", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ngertiin-auth-development-"));
  try {
    const config = authenticationConfig({}, directory);
    expect(config.mode).toBe("accounts");
    expect(authenticationConfig({ NGERTIIN_AUTH_MODE: "local-development" }, directory).mode).toBe(
      "accounts",
    );
    expect(config.origin).toBe("http://127.0.0.1:3001");
    expect(config.allowInsecureLoopback).toBe(true);
    expect(config.secret.length).toBeGreaterThanOrEqual(32);
    expect(authenticationConfig({}, directory).secret).toBe(config.secret);
    const path = join(directory, "authentication/secret");
    expect(statSync(path).mode & 0o077).toBe(0);
    expect(readFileSync(path, "utf8")).toBe(config.secret);
    expect(config.email.delivery).toBe("local");
    if (config.email.delivery !== "local") throw new Error("Expected local inbox.");
    const email = {
      to: "developer@example.test",
      purpose: "verification" as const,
      url: `${config.origin}/api/auth/verify-email?token=private-fixture`,
    };
    await authenticationEmailDelivery(config.email)(email);
    const messages = await inboxMessages(config.email.directory);
    expect(messages).toHaveLength(1);
    expect(messages[0].url).toBe(email.url);
    expect(statSync(config.email.directory).mode & 0o077).toBe(0);
    const inbox = startDevelopmentInbox(config.email.directory, 0);
    try {
      const origin = `http://127.0.0.1:${inbox.port}`;
      expect((await fetch(origin)).status).toBe(200);
      expect((await fetch(origin, { headers: { Host: "foreign.invalid" } })).status).toBe(403);
      expect((await fetch(origin, { headers: { Origin: "https://foreign.invalid" } })).status).toBe(
        403,
      );
      expect((await fetch(origin, { headers: { "Sec-Fetch-Site": "cross-site" } })).status).toBe(
        403,
      );
      expect((await fetch(origin, { method: "POST" })).status).toBe(404);
    } finally {
      await inbox.stop(true);
    }
    chmodSync(path, 0o644);
    expect(() => authenticationConfig({}, directory)).toThrow("private");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("production never generates secrets or accepts a local email inbox", () => {
  const env = {
    APP_ENV: "production",
    NGERTIIN_AUTH_URL: "https://workspace.example.test",
    NGERTIIN_AUTH_SECRET: "s".repeat(48),
    NGERTIIN_AUTH_EMAIL_FROM: "auth@example.test",
    NGERTIIN_AUTH_RESEND_API_KEY: "synthetic-key",
  };
  expect(authenticationConfig(env).email.delivery).toBe("resend");
  expect(() => authenticationConfig({ ...env, NGERTIIN_AUTH_SECRET: "" })).toThrow();
  expect(() => authenticationConfig({ ...env, NGERTIIN_AUTH_EMAIL_DELIVERY: "local" })).toThrow();
  expect(() => authenticationConfig({ ...env, NGERTIIN_AUTH_RESEND_API_KEY: "" })).toThrow();
  expect(() =>
    authenticationConfig({ ...env, NGERTIIN_AUTH_URL: "http://127.0.0.1:3001" }),
  ).toThrow();
});
