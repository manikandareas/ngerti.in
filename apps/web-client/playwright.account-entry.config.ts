import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["account-entry.spec.ts", "button-surface.spec.ts"],
  workers: 2,
  retries: 0,
  timeout: 60_000,
  outputDir: "../../.dev/account-entry-results",
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:4311", trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
  webServer: {
    command: "bunx vite preview --host 127.0.0.1 --port 4311 --strictPort",
    url: "http://127.0.0.1:4311",
    reuseExistingServer: false,
  },
});
