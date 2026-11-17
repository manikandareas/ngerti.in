import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "pg";
import { authenticationConfig } from "../src/auth/config";
import { inboxMessages } from "../src/auth/inbox";
import { startApplication } from "../src/main";

test("account bootstrap rejects installation credentials and preserves verified sessions across restart", async () => {
  const stateDir = mkdtempSync(join(tmpdir(), "ngertiin-bootstrap-"));
  const authentication = authenticationConfig({ APP_ENV: "development" }, stateDir);
  const config = {
    owner_id: crypto.randomUUID(),
    stateDir,
    authentication,
    installationFile: join(stateDir, "installation.json"),
    database: join(stateDir, "ngertiin.postgres"),
    databaseUrl: process.env.NGERTIIN_TEST_DATABASE_URL,
    databaseSchema: `test_${crypto.randomUUID().replaceAll("-", "")}`,
    port: 0,
    groupRouter: "member" as const,
    typesafeApiKey: undefined,
    nativeCodexExecutable: undefined,
    harnessExecutables: { codex: undefined, muse: undefined },
  };
  // Every bootstrap test owns independent application and account schemas.
  authentication.schema = `auth_${crypto.randomUUID().replaceAll("-", "")}`;
  let application: Awaited<ReturnType<typeof startApplication>> | undefined;
  const request = (path: string, body?: unknown, cookie?: string) =>
    fetch(`${application?.url ?? "http://not-started.invalid"}${path}`, {
      method: body === undefined ? "GET" : "POST",
      redirect: "manual",
      headers: {
        Origin: authentication.origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  try {
    const occupied = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response("occupied"),
    });
    try {
      await expect(
        startApplication({ ...config, port: occupied.port as number }),
      ).rejects.toThrow();
    } finally {
      await occupied.stop(true);
    }
    application = await startApplication(config);
    const first = JSON.parse(readFileSync(join(stateDir, "runtime.json"), "utf8"));
    expect(first.url).toBe(application.url);
    expect(statSync(join(stateDir, "runtime.json")).mode & 0o077).toBe(0);
    await expect(startApplication(config)).rejects.toThrow("Another application authority");
    expect(
      (
        await fetch(`${application.url}/v1/contracts`, {
          headers: { Authorization: `Bearer ${"c".repeat(64)}` },
        })
      ).status,
    ).toBe(401);
    const identity = {
      email: "first@example.test",
      name: "First owner",
      password: "Account-bootstrap-password-948!",
    };
    expect((await request("/api/auth/sign-up/email", identity)).status).toBe(200);
    expect(authentication.email.delivery).toBe("local");
    if (authentication.email.delivery !== "local") throw new Error("Expected local inbox.");
    const messages = await inboxMessages(authentication.email.directory);
    expect(messages).toHaveLength(1);
    const verification = new URL(messages[0].url);
    expect([200, 302]).toContain(
      (await request(verification.pathname + verification.search)).status,
    );
    const login = await request("/api/auth/sign-in/email", identity);
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    expect((await request("/health/ready", undefined, cookie)).status).toBe(200);
    const organizations = await (await request("/v1/organizations", undefined, cookie)).json();
    expect(organizations.creation_limit).toBe(1);
    const session = await (await request("/v1/auth/session", undefined, cookie)).json();
    await application.stop();
    expect(() => readFileSync(join(stateDir, "runtime.json"))).toThrow();
    application = await startApplication(config);
    const second = JSON.parse(readFileSync(join(stateDir, "runtime.json"), "utf8"));
    expect(second.instance_id).not.toBe(first.instance_id);
    expect(await (await request("/v1/auth/session", undefined, cookie)).json()).toEqual(session);
  } finally {
    await application?.stop();
    const client = new Client({ connectionString: config.databaseUrl });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS "${config.databaseSchema}" CASCADE`);
      await client.query(`DROP SCHEMA IF EXISTS "${authentication.schema}" CASCADE`);
    } finally {
      await client.end();
    }
    rmSync(stateDir, { recursive: true, force: true });
  }
});
