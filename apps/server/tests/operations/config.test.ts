import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("production bootstrap fails closed and preserves an account origin with explicit state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "ngertiin-server-config-"));
  const env = {
    PATH: process.env.PATH,
    APP_ENV: "production",
    NGERTIIN_CONFIG_FILE: join(directory, "absent"),
    NGERTIIN_STATE_DIR: directory,
    NGERTIIN_DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1/fixture",
    NGERTIIN_AUTH_URL: "https://server.example.test",
    NGERTIIN_AUTH_SECRET: "s".repeat(64),
    NGERTIIN_AUTH_EMAIL_FROM: "auth@example.test",
    NGERTIIN_AUTH_RESEND_API_KEY: "synthetic-fixture",
  };
  const code = `import { developmentConfig } from ${JSON.stringify(new URL("../../src/config.ts", import.meta.url).pathname)}; const config = developmentConfig(); console.log(config.authentication.origin);`;
  async function probe(overrides: Record<string, string>) {
    const child = Bun.spawn([process.execPath, "-e", code], {
      env: { ...env, ...overrides },
      stdout: "pipe",
      stderr: "ignore",
    });
    return { code: await child.exited, output: await new Response(child.stdout).text() };
  }
  try {
    expect((await probe({})).output.trim()).toBe("https://server.example.test");
    expect((await probe({ NGERTIIN_AUTH_SECRET: "" })).code).toBe(1);
    expect((await probe({ NGERTIIN_STATE_DIR: "relative" })).code).toBe(1);
    expect(
      (
        await probe({
          NGERTIIN_AUTH_URL: "http://127.0.0.1:8000",
          NGERTIIN_AUTH_ALLOW_INSECURE_LOOPBACK: "true",
        })
      ).code,
    ).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
