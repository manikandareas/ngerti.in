import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const env = {
  NGERTIIN_STATE_DIR: mkdtempSync(join(tmpdir(), "ngertiin-nma062-")),
  NGERTIIN_PORT: "8321",
  NGERTIIN_API_URL: "http://127.0.0.1:8321",
};
export default defineConfig({
  testDir: "./tests",
  outputDir: "../../.dev/nma062-playwright",
  testMatch: ["work.spec.ts", "composer.spec.ts"],
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/work-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4321",
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
      command: "bun ../../scripts/verification/nma062/api-server.ts",
      url: "http://127.0.0.1:8321/health/live",
      env,
    },
    {
      command: "bun run preview --host 127.0.0.1 --port 4321 --strictPort",
      url: "http://127.0.0.1:4321",
      env,
    },
  ],
});
