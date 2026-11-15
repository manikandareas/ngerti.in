import { expect, test } from "bun:test";
import { resolve } from "node:path";

// The shared runner owns a disposable PostgreSQL instance for these real-account browser fixtures.
test("current account and organization desktop/mobile browser journeys", async () => {
  if (!process.env.NGERTIIN_TEST_DATABASE_URL)
    throw new Error("Use the disposable PostgreSQL test runner.");
  const web = resolve(import.meta.dir, "../../../apps/web-client");
  const child = Bun.spawn(
    [
      process.execPath,
      resolve(web, "node_modules/@playwright/test/cli.js"),
      "test",
      "--config",
      "playwright.organizations.config.ts",
      ...(process.env.NGERTIIN_ACCOUNT_BROWSER_GREP
        ? ["--grep", process.env.NGERTIIN_ACCOUNT_BROWSER_GREP]
        : []),
    ],
    {
      cwd: web,
      env: process.env,
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  expect(await child.exited).toBe(0);
}, 900_000);
