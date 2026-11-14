import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch:
    process.env.NGERTIIN_NMA080_NATIVE_CUA === "1"
      ? "organizations-native.spec.ts"
      : "organizations.spec.ts",
  workers: 1,
  retries: 0,
  timeout: process.env.NGERTIIN_NMA080_NATIVE_CUA === "1" ? 180_000 : 60_000,
  reporter: [
    ["list"],
    [
      "json",
      {
        outputFile:
          process.env.NGERTIIN_NMA080_BROWSER_REPORT ??
          (process.env.NGERTIIN_NMA080_NATIVE_CUA === "1"
            ? "../../docs/verification/nma-080/native-browser-report.json"
            : "../../docs/verification/nma-080/browser-report.json"),
      },
    ],
  ],
  use: {
    baseURL: "http://127.0.0.1:4320",
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
  webServer: {
    command: "bun ../../scripts/verification/nma080/browser-server.ts",
    url: "http://127.0.0.1:8320/health",
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 30_000 },
  },
});
