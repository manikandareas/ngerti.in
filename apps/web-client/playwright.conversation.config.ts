import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const state = mkdtempSync(join(tmpdir(), "ngertiin-nma061-"));
const env = {
  NGERTIIN_STATE_DIR: state,
  NGERTIIN_PORT: "8311",
  NGERTIIN_API_URL: "http://127.0.0.1:8311",
};
export default defineConfig({
  testDir: "./tests",
  testMatch: [
    "conversation.spec.ts",
    "activity.spec.ts",
    "preparation.spec.ts",
    "model-picker.spec.ts",
    "rich-answer.spec.ts",
    "agent-avatar.spec.ts",
    "sidebar.spec.ts",
  ],
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "test-results/conversation-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4311",
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
      url: "http://127.0.0.1:8311/health/live",
      env,
    },
    {
      command: "bun run preview --host 127.0.0.1 --port 4311 --strictPort",
      url: "http://127.0.0.1:4311",
      env,
    },
  ],
});
