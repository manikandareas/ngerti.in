import { defineConfig } from "@playwright/test";
import settings from "./playwright.settings.config";

export default defineConfig({
  ...settings,
  testMatch: ["marketplace.spec.ts", "marketplace-install.spec.ts", "marketplace-sidebar.spec.ts"],
  webServer: Array.isArray(settings.webServer)
    ? settings.webServer.map((server, index) =>
        index === 0
          ? { ...server, command: "bun ../../scripts/verification/nma062/api-server.ts" }
          : server,
      )
    : settings.webServer,
  outputDir: "../../.dev/marketplace-playwright",
});
