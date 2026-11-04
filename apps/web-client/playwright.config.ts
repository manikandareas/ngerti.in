import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const env = {
  NGERTIIN_STATE_DIR: mkdtempSync(join(tmpdir(), "ngertiin-ui-")),
  NGERTIIN_PORT: "8313",
  NGERTIIN_API_URL: "http://127.0.0.1:8313",
};

export default defineConfig({
  testIgnore: [
    "conversation.spec.ts",
    "model-picker.spec.ts",
    "rich-answer.spec.ts",
    "settings.spec.ts",
    "work.spec.ts",
    "composer.spec.ts",
    "machine.spec.ts",
  ],
  testDir: "./tests",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4301",
    colorScheme: "light",
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
      url: "http://127.0.0.1:8313/health/live",
      env,
    },
    {
      env,
      command: "bun run preview --host 127.0.0.1 --port 4301 --strictPort",
      url: "http://127.0.0.1:4301",
      reuseExistingServer: false,
    },
  ],
});
