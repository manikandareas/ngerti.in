import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const env = {
  NGERTIIN_STATE_DIR: mkdtempSync(join(tmpdir(), "ngertiin-content-viewer-")),
  NGERTIIN_PORT: "8333",
  NGERTIIN_API_URL: "http://127.0.0.1:8333",
};
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "work.spec.ts",
    "composer.spec.ts",
    "rich-answer.spec.ts",
    "pdf-viewer.spec.ts",
    "working-files.spec.ts",
  ],
  grep: /Focus|Working files|Source viewer|rich reply|contextual goals|removing a selected file|image chips/,
  outputDir: "../../.dev/content-viewer-playwright",
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/content-viewer-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4333",
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
      url: "http://127.0.0.1:8333/health/live",
      env,
    },
    {
      command: "bun run preview --host 127.0.0.1 --port 4333 --strictPort",
      url: "http://127.0.0.1:4333",
      env,
    },
  ],
});
