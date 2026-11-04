import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "../src/profile";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const profile = loadProfile();
const built = Bun.spawn([process.execPath, join(root, "apps/desktop/scripts/build.ts")], {
  stdout: "inherit",
  stderr: "inherit",
});
if (await built.exited) process.exit(1);
const vite = await import("vite");
const server = await vite.createServer({
  root: join(root, "apps/web-client"),
  configFile: join(root, "apps/web-client/vite.config.ts"),
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("The UI development server did not start.");
const electron = (await import("electron")).default;
const child = spawn(electron as unknown as string, [join(root, "apps/desktop")], {
  stdio: "inherit",
  detached: process.platform !== "win32",
  env: { ...process.env, NGERTIIN_DESKTOP_VITE_URL: url },
});
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child.kill("SIGTERM");
  await server.close();
}
process.on("SIGINT", () => void close());
process.on("SIGTERM", () => void close());
child.on("exit", (code) => {
  void server.close().then(() => process.exit(code ?? 0));
});
child.on("error", () => {
  void close().then(() => process.exit(1));
});
console.log(
  `Ngertiin Dev is opening on its saved profile port ${profile.uiPort}. Close the window to keep agents running; Quit to stop managed services.`,
);
