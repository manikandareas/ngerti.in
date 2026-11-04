import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Profile } from "../src/profile";
export const root = fileURLToPath(new URL("../../../", import.meta.url));
export async function freePort() {
  const server = createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No port");
  await new Promise<void>((ok) => server.close(() => ok()));
  return address.port;
}
export async function fixture() {
  const home = mkdtempSync(join(tmpdir(), "ngertiin-desktop-"));
  const stateDirectory = join(home, "state");
  mkdirSync(stateDirectory, { mode: 0o700 });
  const configFile = join(home, "empty.env");
  writeFileSync(configFile, "NGERTIIN_GROUP_ROUTER=member\nTYPESAFE_API_KEY=\n", { mode: 0o600 });
  const profile: Profile = {
    version: 1,
    managerId: crypto.randomUUID(),
    stateDirectory,
    projectRoot: root,
    configFile,
    bunExecutable:
      process.env.NGERTIIN_TEST_BUN ??
      (process.versions.bun ? process.execPath : "/opt/homebrew/bin/bun"),
    uiPort: await freePort(),
  };
  return { home, profile, close: () => rmSync(home, { recursive: true, force: true }) };
}
