import { join } from "node:path";
import { loadProfile, tauriHome } from "../src/profile";
import { prepareRuntime } from "./prepare-runtime";
import { cargo, native, root, run, toolchainEnv } from "./toolchain";

const profile = loadProfile(tauriHome());
await run([process.execPath, "run", "build:web-client"], root);
await prepareRuntime();
const { createServer } = await import("vite");
const server = await createServer({
  root: join(root, "apps/web-client"),
  configFile: join(root, "apps/web-client/vite.config.ts"),
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await server.listen();
const url = server.resolvedUrls?.local[0];
if (!url) throw new Error("The UI development server did not start.");
const child = Bun.spawn([cargo, "run", "-j", "2"], {
  cwd: native,
  env: { ...toolchainEnv, NGERTIIN_DESKTOP_VITE_URL: url },
  stdin: "ignore",
  stdout: "inherit",
  stderr: "inherit",
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
console.log(
  `Opening Tauri on saved profile port ${profile.uiPort}. UI hot reload is enabled; restart this command after Rust/backend changes.`,
);
try {
  process.exitCode = await child.exited;
} finally {
  await server.close();
}
