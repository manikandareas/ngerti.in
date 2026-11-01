import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const env = {
  NGERTIIN_STATE_DIR: mkdtempSync(join(tmpdir(), "ngertiin-settings-")),
  NGERTIIN_PORT: "8315",
  NGERTIIN_API_URL: "http://127.0.0.1:8315",
};
export default defineConfig({
  testDir: "./tests",
  testMatch: "settings.spec.ts",
  workers: 1,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4315",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: [
    {
      command: "bun ../../scripts/verification/nma061/api-server.ts",
      url: "http://127.0.0.1:8315/health/live",
      env,
    },
    {
      command: "bun run preview --host 127.0.0.1 --port 4315 --strictPort",
      url: "http://127.0.0.1:4315",
      env,
    },
  ],
});
