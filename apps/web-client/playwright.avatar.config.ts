import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "avatar.spec.ts",
  outputDir: "../../.dev/avatar-playwright",
  workers: 2,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "../../.dev/avatar-playwright-report.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4316",
    colorScheme: "light",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 1100 } },
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
  webServer: {
    command: "bun run preview --host 127.0.0.1 --port 4316 --strictPort",
    url: "http://127.0.0.1:4316/avatar-studio",
  },
});
