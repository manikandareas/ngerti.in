import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const env = {
  NGERTIIN_STATE_DIR: mkdtempSync(join(tmpdir(), "ngertiin-jev-ui-")),
  NGERTIIN_PORT: "8341",
  NGERTIIN_API_URL: "http://127.0.0.1:8341",
};
export default defineConfig({
  testDir: "./tests",
  testMatch: "jev-routing-v3.spec.ts",
  outputDir: "../../.dev/jev-v3-playwright",
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/jev-v3-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4341",
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
      command: "bun ../../scripts/verification/jev-routing-v3/ui-server.ts",
      url: "http://127.0.0.1:8341/health/live",
      env,
    },
    {
      command: "bun run preview --host 127.0.0.1 --port 4341 --strictPort",
      url: "http://127.0.0.1:4341",
      env,
    },
  ],
});
